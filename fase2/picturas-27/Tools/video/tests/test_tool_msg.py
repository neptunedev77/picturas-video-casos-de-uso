"""Tests of Tools/utils/tool_msg.py on top of ReliableConsumer (DA-R1, step 2).

ToolMSG is the only RabbitMQ entry point of the 15 image tools, so these tests
check that it keeps its interface (read_msg / send_msg) and message format.
"""
import json
import os
import sys

import pytest

# on the host, utils/ lives in Tools/ (in the container it is next to tests/)
_TOOLS = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if os.path.isdir(os.path.join(_TOOLS, "utils")):
    sys.path.insert(0, _TOOLS)

import utils.tool_msg as tool_msg  # noqa: E402


class FakeConsumer:
    """Stands in for ReliableConsumer: records what ToolMSG asks of it."""
    instances = []

    def __init__(self, queue, handler, host, port, username, password):
        self.queue, self.handler = queue, handler
        self.connection = (host, port, username, password)
        self.published = []
        self.ran = False
        FakeConsumer.instances.append(self)

    def run(self):
        # behaves like a SIGTERM during the run: handle one job, then return
        self.ran = True
        self.handler(None, None, None, b"job")

    def publish(self, routing_key, body):
        self.published.append((routing_key, json.loads(body)))


@pytest.fixture
def tool(monkeypatch):
    FakeConsumer.instances.clear()
    monkeypatch.setattr(tool_msg, "ReliableConsumer", FakeConsumer)
    return tool_msg.ToolMSG("picturas-border-tool-ms", "border", "rabbitmq", "5672", "user", "pw")


def test_read_msg_consumes_the_tool_queue_and_exits_when_stopped(tool):
    seen = []
    with pytest.raises(SystemExit) as stopped:
        tool.read_msg(lambda ch, method, properties, body: seen.append(body))
    assert stopped.value.code == 0          # no return to the tool's `while True` loop
    consumer = FakeConsumer.instances[0]
    assert consumer.ran and consumer.queue == "border_queue"
    assert consumer.connection == ("rabbitmq", "5672", "user", "pw")
    assert seen == [b"job"]


def test_success_reply_is_published_to_project_queue_unchanged(tool):
    def handler(ch, method, properties, body):
        tool.send_msg("msg-1", "border-0-msg-1", "2026-11-18T00:00:00+00:00", "success",
                      12.5, "/images/out.png")

    with pytest.raises(SystemExit):
        tool.read_msg(handler)
    routing_key, msg = FakeConsumer.instances[0].published[0]
    assert routing_key == "project_queue"
    assert msg == {
        "messageId": "border-0-msg-1",
        "correlationId": "msg-1",
        "timestamp": "2026-11-18T00:00:00+00:00",
        "status": "success",
        "output": {"type": "image", "imageURI": "/images/out.png"},
        "metadata": {"processingTime": 12.5, "microservice": "picturas-border-tool-ms"},
    }


def test_error_reply_keeps_its_current_format(tool):
    # format kept as in the base on purpose: the error replies are fixed in a later step
    def handler(ch, method, properties, body):
        tool.send_msg("msg-1", "border-0-msg-1", "t", "error", 1.0, None,
                      err_code=1201, err_msg="boom", og_img_uri="/images/in.png")

    with pytest.raises(SystemExit):
        tool.read_msg(handler)
    _, msg = FakeConsumer.instances[0].published[0]
    assert msg["status"] == "error"
    assert (msg["messageId"], msg["correlationId"]) == ("msg-1", "border-0-msg-1")
    assert msg["error"] == {"code": 1201, "message": "boom",
                            "details": {"inputFileURI": "/images/in.png"}}
