"""Tests of Tools/utils/reliable_consumer.py (DA-R1), with an in-memory broker.

They live here because the video image already contains utils/ and these
tests run with the rest of the worker tests in fase2/tests/run-all.sh.
"""
import os
import queue
import sys
import threading
import time
from types import SimpleNamespace

import pytest
from pika.exceptions import AMQPConnectionError, NackError, UnroutableError

# on the host, utils/ lives in Tools/ (in the container it is next to tests/)
_TOOLS = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if os.path.isdir(os.path.join(_TOOLS, "utils")):
    sys.path.insert(0, _TOOLS)

from utils.reliable_consumer import ReliableConsumer  # noqa: E402


class FakeChannel:
    def __init__(self, fail_publish=False):
        self.ops = []
        self.confirms = False
        self.mandatory = []
        self.prefetch = None
        self.auto_ack = None
        self.on_message = None
        self.cancelled = False
        self.fail_publish = fail_publish

    def confirm_delivery(self):
        self.confirms = True

    def exchange_declare(self, **kw): pass
    def queue_declare(self, **kw):
        self.queue_arguments = kw.get("arguments")
    def queue_bind(self, **kw): pass

    def basic_qos(self, prefetch_count):
        self.prefetch = prefetch_count

    def basic_consume(self, queue, on_message_callback, auto_ack):
        self.on_message, self.auto_ack = on_message_callback, auto_ack
        return "ctag"

    def basic_cancel(self, tag):
        self.cancelled = True
        self.ops.append(("cancel",))

    def basic_publish(self, exchange, routing_key, body, properties, mandatory=False):
        self.mandatory.append(mandatory)
        if isinstance(self.fail_publish, Exception):
            raise self.fail_publish
        if self.fail_publish:
            raise RuntimeError("broker gone")
        self.ops.append(("publish", routing_key, body, properties.delivery_mode))

    def basic_ack(self, delivery_tag):
        self.ops.append(("ack", delivery_tag))

    def basic_nack(self, delivery_tag, requeue):
        self.ops.append(("nack", delivery_tag, requeue))


class FakeConnection:
    """Runs thread-safe callbacks and deliveries on the thread that calls
    process_data_events, like pika's BlockingConnection."""

    def __init__(self, channel):
        self._channel = channel
        self._callbacks = queue.Queue()
        self._deliveries = queue.Queue()
        self._tag = 0
        self.is_open = True

    def channel(self):
        return self._channel

    def add_callback_threadsafe(self, cb):
        self._callbacks.put(cb)

    def inject(self, body):
        self._deliveries.put(body)

    def process_data_events(self, time_limit=0):
        while not self._callbacks.empty():
            self._callbacks.get()()
        if not self._channel.cancelled and not self._deliveries.empty():
            self._tag += 1
            method = SimpleNamespace(delivery_tag=self._tag)
            self._channel.on_message(self._channel, method, None, self._deliveries.get())
        time.sleep(0.01)

    def close(self):
        self.is_open = False


def wait_until(cond, timeout=5):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if cond():
            return True
        time.sleep(0.01)
    return False


def start(handler, channel=None, grace_s=2, factory=None):
    channel = channel or FakeChannel()
    connection = FakeConnection(channel)
    consumer = ReliableConsumer("test_queue", handler, None, None, None, None,
                                grace_s=grace_s,
                                connection_factory=factory or (lambda: connection),
                                log=lambda *a, **k: None)
    runner = threading.Thread(target=consumer.run, daemon=True)
    runner.start()
    assert wait_until(lambda: channel.on_message is not None)
    return consumer, connection, channel, runner


def test_consumes_with_manual_ack_and_prefetch_one():
    consumer, _, channel, runner = start(lambda *a: None)
    assert channel.auto_ack is False
    assert channel.prefetch == 1
    assert channel.queue_arguments == {"x-queue-type": "quorum"}   # as in definitions.json
    consumer.stop()
    runner.join(5)


def test_reply_is_published_persistent_before_the_ack():
    consumer = None

    def handler(ch, method, properties, body):
        consumer.publish("project_queue", b"reply:" + body)

    consumer, connection, channel, runner = start(handler)
    connection.inject(b"job")
    assert wait_until(lambda: ("ack", 1) in channel.ops)
    assert channel.ops == [("publish", "project_queue", b"reply:job", 2), ("ack", 1)]
    consumer.stop()
    runner.join(5)


def test_handler_exception_requeues_the_message():
    # the retries are bounded by the queue's delivery limit (DA-R3), then dead-lettered
    def handler(*a):
        raise ValueError("poison")

    consumer, connection, channel, runner = start(handler)
    connection.inject(b"job")
    assert wait_until(lambda: ("nack", 1, True) in channel.ops)
    assert not any(op[0] == "ack" for op in channel.ops)
    consumer.stop()
    runner.join(5)


def test_failed_reply_requeues_the_job_and_frees_the_worker():
    consumer = None

    def handler(ch, method, properties, body):
        consumer.publish("project_queue", b"reply")

    consumer, connection, channel, runner = start(handler, channel=FakeChannel(fail_publish=True))
    connection.inject(b"job")
    assert wait_until(lambda: ("nack", 1, True) in channel.ops)
    assert ("ack", 1) not in channel.ops
    # the worker is free again: the next job is taken (prefetch 1 would block it otherwise)
    connection.inject(b"next job")
    assert wait_until(lambda: ("nack", 2, True) in channel.ops)
    consumer.stop()
    runner.join(5)


def test_stop_lets_a_short_job_finish_and_acks_it():
    started = threading.Event()

    def handler(*a):
        started.set()
        time.sleep(0.3)

    consumer, connection, channel, runner = start(handler, grace_s=2)
    connection.inject(b"job")
    assert started.wait(2)
    consumer.stop()
    runner.join(5)
    assert not runner.is_alive()
    assert channel.ops == [("cancel",), ("ack", 1)]


def test_stop_requeues_a_job_longer_than_the_grace_period():
    release = threading.Event()
    started = threading.Event()

    def handler(*a):
        started.set()
        release.wait(10)

    consumer, connection, channel, runner = start(handler, grace_s=0.3)
    connection.inject(b"job")
    assert started.wait(2)
    consumer.stop()
    runner.join(5)
    assert not runner.is_alive()
    assert ("nack", 1, True) in channel.ops
    release.set()
    time.sleep(0.1)
    # the job finished after the requeue: it must not be acked as well
    assert ("ack", 1) not in channel.ops


def test_no_new_jobs_are_taken_after_stop():
    consumer, connection, channel, runner = start(lambda *a: None)
    consumer.stop()
    runner.join(5)
    connection.inject(b"late job")
    connection.process_data_events()
    assert not any(op[0] in ("ack", "nack") for op in channel.ops)


def test_reconnects_after_the_broker_was_unreachable():
    channel = FakeChannel()
    connection = FakeConnection(channel)
    attempts = []

    def factory():
        attempts.append(1)
        if len(attempts) == 1:
            raise AMQPConnectionError("broker down")
        return connection

    consumer, _, _, runner = start(lambda *a: None, channel=channel, factory=factory)
    assert len(attempts) == 2
    consumer.stop()
    runner.join(5)


def test_publishes_are_confirmed_by_the_broker_and_mandatory():
    consumer = None

    def handler(ch, method, properties, body):
        consumer.publish("project_queue", b"reply")

    consumer, connection, channel, runner = start(handler)
    assert channel.confirms is True                 # confirm_delivery() on every (re)connection
    connection.inject(b"job")
    assert wait_until(lambda: ("ack", 1) in channel.ops)
    assert channel.mandatory == [True]
    consumer.stop()
    runner.join(5)


@pytest.mark.parametrize("refusal", [NackError([]), UnroutableError([])])
def test_a_reply_refused_or_unroutable_requeues_the_job(refusal):
    consumer = None

    def handler(ch, method, properties, body):
        consumer.publish("project_queue", b"reply")

    consumer, connection, channel, runner = start(handler, channel=FakeChannel(fail_publish=refusal))
    connection.inject(b"job")
    assert wait_until(lambda: ("nack", 1, True) in channel.ops)
    assert ("ack", 1) not in channel.ops            # never acked without a confirmed reply
    consumer.stop()
    runner.join(5)
