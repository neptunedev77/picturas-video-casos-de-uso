"""Tests of the video worker on top of ReliableConsumer (DA-R1, step 3).

No broker and no ffmpeg: ReliableConsumer and process_video are replaced by
fakes, so these tests check only how video.py talks to RabbitMQ.
"""
import json
import os
import sys

import pytest

# on the host, utils/ lives in Tools/ (in the container it is next to tests/). Appended, not
# prepended: Tools/video/ (added by conftest) must win, so that "import video" is video.py.
_TOOLS = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if os.path.isdir(os.path.join(_TOOLS, "utils")):
    sys.path.append(_TOOLS)

import video  # noqa: E402
from video_processor import InvalidTrim  # noqa: E402


class FakeConsumer:
    def __init__(self, queue, handler, host, port, username, password):
        self.queue, self.handler = queue, handler
        self.published = []

    def publish(self, routing_key, body):
        self.published.append((routing_key, json.loads(body)))


def job(**overrides):
    msg = {
        "messageId": "msg-1",
        "procedure": "video",
        "parameters": {
            "inputImageURI": "/images/in.mp4",
            "outputImageURI": "/images/out.mp4",
            "tools": [{"procedure": "trim", "parameters": {"start": 0, "end": 1}}],
            "progress": {"user": "u1", "projectId": "p1", "imgId": "i1"},
        },
    }
    msg.update(overrides)
    return json.dumps(msg).encode()


@pytest.fixture
def worker(monkeypatch):
    monkeypatch.setattr(video, "ReliableConsumer", FakeConsumer)
    return video.VideoWorker()


def test_worker_consumes_the_video_queue(worker):
    assert worker._consumer.queue == "video_queue"
    assert worker._consumer.handler == worker.callback


def test_success_publishes_progress_then_the_reply_unchanged(worker, monkeypatch):
    def fake_process(input_uri, output_uri, tools, preview, progress_cb):
        progress_cb(50)
        return {"frames": 25, "duration": 1.0}

    monkeypatch.setattr(video, "process_video", fake_process)
    worker.callback(None, None, None, job())

    (q1, progress), (q2, reply) = worker._consumer.published
    assert q1 == "ws_queue"
    assert {k: progress[k] for k in ("status", "user", "projectId", "imgId", "preview", "percent")} \
        == {"status": "success", "user": "u1", "projectId": "p1", "imgId": "i1",
            "preview": False, "percent": 50}
    assert q2 == "project_queue"
    assert reply["correlationId"] == "msg-1" and reply["status"] == "success"
    assert reply["output"] == {"type": "video", "imageURI": "/images/out.mp4"}
    assert reply["metadata"]["microservice"] == "picturas-video-tool-ms"


def test_known_error_replies_with_its_code_and_error_msg(worker, monkeypatch):
    def fake_process(*a, **k):
        raise InvalidTrim("end before start")

    monkeypatch.setattr(video, "process_video", fake_process)
    worker.callback(None, None, None, job())

    queue, reply = worker._consumer.published[-1]
    assert queue == "project_queue" and reply["status"] == "error"
    assert reply["correlationId"] == "msg-1"
    assert reply["error"]["code"] == video.CODES["invalid_trim"]
    assert reply["error"]["msg"] == reply["error"]["message"] == "end before start"


def test_invalid_message_is_discarded_without_reply(worker):
    worker.callback(None, None, None, b"not json")   # must not raise: the consumer then acks it
    assert worker._consumer.published == []


def test_unpublished_reply_is_left_to_the_consumer(worker, monkeypatch):
    # a reply that could not be published must not turn into an error reply
    monkeypatch.setattr(video, "process_video", lambda *a, **k: {"frames": 1})

    def failing_publish(routing_key, body):
        raise video.PublishError("broker gone")

    worker._consumer.publish = failing_publish
    with pytest.raises(video.PublishError):
        worker.callback(None, None, None, job(parameters={
            "inputImageURI": "/i.mp4", "outputImageURI": "/o.mp4", "tools": []}))
