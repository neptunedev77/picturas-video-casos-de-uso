"""Reliable RabbitMQ consumer shared by the PictuRAS workers (DA-R1).

Guarantees, compared with the old auto-ack consumer:

- Manual ack, sent only after the handler returns. The handler publishes its
  reply first, so a job is never acknowledged before its result is on the
  broker. If the worker dies midway, RabbitMQ redelivers the job.
- The handler runs in a worker thread. The connection thread keeps serving
  heartbeats while a long job (e.g. a video) runs, so a dead worker is
  detected by the broker instead of looking alive forever (heartbeat=0).
- pika's BlockingConnection is not thread-safe: every channel operation
  (publish, ack, nack) runs on the connection thread. The worker thread hands
  them over with add_callback_threadsafe.
- prefetch_count=1: a replica holds at most one unacked job.
- Persistent publishes (delivery_mode=2).
- Reconnection with exponential backoff when the broker goes away. Unacked
  deliveries are redelivered by RabbitMQ, so nothing is acked late on a new
  connection.
- SIGTERM: stop taking jobs, wait up to `grace_s` for the current one,
  otherwise requeue it, then return so the process can exit with code 0.

A handler that raises is treated as a poison message: it is rejected
without requeue (no infinite redelivery loop). Expected failures must be
reported by the handler itself, as an error reply. If the reply itself
cannot be published, the job is requeued so that it is done again.
"""
import os
import signal
import threading
import time

import pika
from pika.exceptions import AMQPChannelError, AMQPConnectionError
from pika.exchange_type import ExchangeType

EXCHANGE = "picturas"
PERSISTENT = pika.BasicProperties(delivery_mode=2)

# under Docker's default 10 s stop timeout, so the requeue happens before SIGKILL
DEFAULT_GRACE_S = float(os.getenv("WORKER_SHUTDOWN_GRACE_S", "8"))
DEFAULT_HEARTBEAT_S = int(os.getenv("RABBITMQ_HEARTBEAT_S", "60"))
PUBLISH_TIMEOUT_S = 30
BACKOFF_MAX_S = 30


class PublishError(Exception):
    """The reply could not be handed to the broker (connection lost)."""


class ReliableConsumer:
    def __init__(self, queue, handler, host, port, username, password,
                 prefetch=1, heartbeat=DEFAULT_HEARTBEAT_S, grace_s=DEFAULT_GRACE_S,
                 connection_factory=None, log=print):
        """`handler(ch, method, properties, body)` keeps the signature of the
        old pika callbacks. `ch` is always None: the handler must not touch the
        channel directly, it publishes through `publish()`."""
        self._queue = queue
        self._handler = handler
        self._prefetch = prefetch
        self._grace_s = grace_s
        self._log = log
        if connection_factory is None:
            params = pika.ConnectionParameters(
                host, int(port), "/", pika.PlainCredentials(username, password),
                heartbeat=heartbeat, blocked_connection_timeout=PUBLISH_TIMEOUT_S)
            connection_factory = lambda: pika.BlockingConnection(params)  # noqa: E731
        self._connect = connection_factory

        self._connection = None
        self._channel = None
        self._generation = 0          # bumped on every (re)connection
        self._consumer_tag = None
        self._job = None              # (delivery_tag, generation) of the running job
        self._stop = threading.Event()

    # ------------------------------------------------------------------ public
    def stop(self, *_):
        """Ask the consumer to shut down gracefully (also the SIGTERM handler)."""
        if not self._stop.is_set():
            self._log(f"[consumer:{self._queue}] stop requested", flush=True)
        self._stop.set()

    def publish(self, routing_key, body):
        """Publish a persistent message on the `picturas` exchange.

        Called from the handler's worker thread: the publish runs on the
        connection thread and this call waits until it is done, so the caller
        knows the reply reached the broker before its job is acked."""
        if isinstance(body, str):
            body = body.encode()
        done = threading.Event()
        outcome = {}

        def _do():
            try:
                self._channel.basic_publish(EXCHANGE, routing_key, body, PERSISTENT)
            except Exception as e:  # noqa: BLE001 - reported to the caller
                outcome["error"] = e
            done.set()

        connection = self._connection
        try:
            connection.add_callback_threadsafe(_do)
        except Exception as e:  # noqa: BLE001 - connection already closed
            raise PublishError(f"connection closed: {e}") from e
        if not done.wait(PUBLISH_TIMEOUT_S):
            raise PublishError("publish not confirmed in time (connection lost?)")
        if "error" in outcome:
            raise PublishError(str(outcome["error"])) from outcome["error"]

    def run(self):
        """Consume until stop() / SIGTERM. Returns when the shutdown is complete."""
        if threading.current_thread() is threading.main_thread():
            signal.signal(signal.SIGTERM, self.stop)

        backoff = 1
        while not self._stop.is_set():
            try:
                self._open()
                backoff = 1
                self._loop()
            except (AMQPConnectionError, AMQPChannelError) as e:
                self._job = None  # the broker requeues it: never ack on a new connection
                self._close()
                if self._stop.is_set():
                    break
                self._log(f"[consumer:{self._queue}] connection lost ({e!r}), "
                          f"retrying in {backoff}s", flush=True)
                self._stop.wait(backoff)
                backoff = min(backoff * 2, BACKOFF_MAX_S)
        self._close()
        self._log(f"[consumer:{self._queue}] stopped", flush=True)

    # ---------------------------------------------------------------- internal
    def _open(self):
        self._connection = self._connect()
        self._generation += 1
        self._channel = self._connection.channel()
        self._channel.exchange_declare(exchange=EXCHANGE, exchange_type=ExchangeType.direct,
                                       durable=True)
        self._channel.queue_declare(queue=self._queue, durable=True)
        self._channel.queue_bind(queue=self._queue, exchange=EXCHANGE, routing_key=self._queue)
        self._channel.basic_qos(prefetch_count=self._prefetch)
        self._consumer_tag = self._channel.basic_consume(
            queue=self._queue, on_message_callback=self._on_message, auto_ack=False)
        self._log(f"[consumer:{self._queue}] waiting for jobs", flush=True)

    def _loop(self):
        deadline = None
        while True:
            self._connection.process_data_events(time_limit=0.5)
            if not self._stop.is_set():
                continue
            if deadline is None:
                deadline = time.monotonic() + self._grace_s
                self._cancel_consumer()
            if self._job is None:
                return
            if time.monotonic() >= deadline:
                tag, _ = self._job
                self._log(f"[consumer:{self._queue}] job not finished in {self._grace_s}s, "
                          f"requeueing it", flush=True)
                self._channel.basic_nack(delivery_tag=tag, requeue=True)
                self._job = None
                return

    def _cancel_consumer(self):
        if self._consumer_tag is not None:
            try:
                self._channel.basic_cancel(self._consumer_tag)
            except Exception:  # noqa: BLE001 - shutting down anyway
                pass
            self._consumer_tag = None

    def _on_message(self, ch, method, properties, body):
        # connection thread: hand the job to a worker thread and return at once
        generation = self._generation
        self._job = (method.delivery_tag, generation)
        threading.Thread(target=self._work, daemon=True,
                         args=(method, properties, body, generation)).start()

    def _work(self, method, properties, body, generation):
        try:
            self._handler(None, method, properties, body)
            outcome = "ack"
        except PublishError as e:
            # the reply did not reach the broker: requeue the job so it is
            # redone (if the connection is gone, the broker requeues it anyway)
            self._log(f"[consumer:{self._queue}] reply not published ({e}), "
                      f"requeueing the job", flush=True)
            outcome = "requeue"
        except Exception as e:  # noqa: BLE001 - poison message
            self._log(f"[consumer:{self._queue}] handler failed ({e!r}), "
                      f"message rejected", flush=True)
            outcome = "reject"

        def _settle():
            if self._job != (method.delivery_tag, generation) \
                    or generation != self._generation:
                return  # requeued on shutdown, or the connection changed
            if outcome == "ack":
                self._channel.basic_ack(delivery_tag=method.delivery_tag)
            else:
                self._channel.basic_nack(delivery_tag=method.delivery_tag,
                                         requeue=(outcome == "requeue"))
            self._job = None

        try:
            self._connection.add_callback_threadsafe(_settle)
        except Exception:  # noqa: BLE001 - connection gone: the broker redelivers
            pass

    def _close(self):
        try:
            if self._connection is not None and self._connection.is_open:
                self._connection.close()
        except Exception:  # noqa: BLE001 - best effort on shutdown
            pass
