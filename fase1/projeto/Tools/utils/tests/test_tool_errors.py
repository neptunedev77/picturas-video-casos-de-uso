"""A tool's error must reach projects: same ids as a success (correlationId = request id) and the
text in error.message. Run in Tools with:  python -m unittest discover -s utils/tests -v
"""
import json
import os
import sys
import types
import unittest
from unittest.mock import MagicMock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

pika = types.ModuleType("pika")
pika.PlainCredentials = MagicMock()
pika.ConnectionParameters = MagicMock()
pika.BlockingConnection = MagicMock()
exchange_type = types.ModuleType("pika.exchange_type")
exchange_type.ExchangeType = MagicMock()
sys.modules.setdefault("pika", pika)
sys.modules.setdefault("pika.exchange_type", exchange_type)

from utils.tool_msg import ToolMSG  # noqa: E402


def sent_body(tool, **kwargs):
    tool._rabbit_mq = MagicMock()
    tool.send_msg(**kwargs)
    body, queue = tool._rabbit_mq.send_rabbit_msg.call_args.args
    return json.loads(body), queue


class ToolErrorMessageTests(unittest.TestCase):
    def setUp(self):
        self.tool = ToolMSG("ms", "video_bg_remove", "rabbitmq", 5672, "u", "p")

    def test_error_keeps_the_request_id_as_correlation_id_like_a_success(self):
        error, queue = sent_body(self.tool, msg_id="request-1", resp_msg_id="video-bg-remove-0-request-1",
                                 timestamp="t", status="error", processingTime=1, new_img_uri=None,
                                 err_code=2403, err_msg="Tempo limite excedido", og_img_uri="in.mp4")
        success, _ = sent_body(self.tool, msg_id="request-1", resp_msg_id="video-bg-remove-1-request-1",
                               timestamp="t", status="success", processingTime=1, new_img_uri="out.mp4")
        self.assertEqual(queue, "project_queue")
        self.assertEqual(error["correlationId"], "request-1")
        self.assertEqual(error["correlationId"], success["correlationId"])
        self.assertEqual(error["messageId"], "video-bg-remove-0-request-1")

    def test_error_carries_code_and_message(self):
        error, _ = sent_body(self.tool, msg_id="r", resp_msg_id="x", timestamp="t", status="error",
                             processingTime=1, new_img_uri=None, err_code=2403, err_msg="falhou", og_img_uri="in.mp4")
        self.assertEqual(error["error"]["code"], 2403)
        self.assertEqual(error["error"]["message"], "falhou")


if __name__ == "__main__":
    unittest.main()
