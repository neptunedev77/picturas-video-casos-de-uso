"""REQ-VID-QUOTA-003: the anonymization and background-removal workers consume their own priority
queue, one request at a time. Run in Tools with:  python -m unittest discover -s utils/tests -v
"""
import os
import sys
import types
import unittest
from unittest.mock import MagicMock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

# A fake pika: the helpers only need a channel; no RabbitMQ is contacted.
pika = types.ModuleType("pika")
pika.PlainCredentials = MagicMock()
pika.ConnectionParameters = MagicMock()
pika.BlockingConnection = MagicMock()
exchange_type = types.ModuleType("pika.exchange_type")
exchange_type.ExchangeType = MagicMock()
sys.modules.setdefault("pika", pika)
sys.modules.setdefault("pika.exchange_type", exchange_type)

from utils.rabbit_mq import Rabbit_MQ  # noqa: E402
from utils.tool_msg import ToolMSG  # noqa: E402


def new_channel():
    channel = MagicMock()
    pika.BlockingConnection.return_value.channel.return_value = channel
    return channel


class ToolQueueTests(unittest.TestCase):
    def test_video_tools_read_their_priority_queue_with_manual_ack(self):
        for tool, queue in [("privacy_blur", "privacy_blur_requests_queue"), ("video_bg_remove", "video_bg_remove_requests_queue")]:
            with self.subTest(tool=tool):
                channel = new_channel()
                ToolMSG(tool, tool, "rabbitmq", 5672, "u", "p").read_msg(lambda *args: None)
                channel.queue_declare.assert_called_with(queue=queue, durable=True, arguments={"x-max-priority": 10})
                channel.basic_qos.assert_called_once_with(prefetch_count=1)
                self.assertEqual(channel.basic_consume.call_args.kwargs["queue"], queue)
                self.assertFalse(channel.basic_consume.call_args.kwargs["auto_ack"])

    def test_image_tools_keep_auto_ack_and_no_queue_arguments(self):
        channel = new_channel()
        ToolMSG("brightness", "brightness", "rabbitmq", 5672, "u", "p").read_msg(lambda *args: None)
        channel.queue_declare.assert_called_with(queue="brightness_queue", durable=True, arguments=None)
        channel.basic_qos.assert_not_called()
        self.assertTrue(channel.basic_consume.call_args.kwargs["auto_ack"])

    def test_no_tool_uses_the_unconsumed_high_priority_queue(self):
        self.assertNotIn("high_priority", ToolMSG.queues)
        self.assertNotIn("high_priority_queue", ToolMSG.queues.values())


class ManualAckTests(unittest.TestCase):
    def consume(self, callback):
        channel = new_channel()
        Rabbit_MQ("rabbitmq", 5672, "u", "p").read_rabbit_msg(
            "privacy_blur_requests_queue", callback, arguments={"x-max-priority": 10}, manual_ack=True)
        return channel, channel.basic_consume.call_args.kwargs["on_message_callback"]

    def test_the_request_is_acknowledged_only_after_the_callback(self):
        order = []
        channel, handler = self.consume(lambda *args: order.append("callback"))
        ch = MagicMock()
        ch.basic_ack.side_effect = lambda **kwargs: order.append("ack")
        handler(ch, types.SimpleNamespace(delivery_tag=7), None, b"{}")
        self.assertEqual(order, ["callback", "ack"])
        ch.basic_ack.assert_called_once_with(delivery_tag=7)

    def test_a_failed_request_is_still_acknowledged_and_never_redelivered_in_a_loop(self):
        def fail(*args):
            raise RuntimeError("boom")
        channel, handler = self.consume(fail)
        ch = MagicMock()
        with self.assertRaises(RuntimeError):
            handler(ch, types.SimpleNamespace(delivery_tag=3), None, b"{}")
        ch.basic_ack.assert_called_once_with(delivery_tag=3)

    def test_results_sent_later_redeclare_the_queue_with_the_same_arguments(self):
        # A declaration with different arguments would make RabbitMQ close the channel.
        channel = new_channel()
        rabbit = Rabbit_MQ("rabbitmq", 5672, "u", "p")
        rabbit.read_rabbit_msg("video_bg_remove_requests_queue", lambda *a: None, arguments={"x-max-priority": 10}, manual_ack=True)
        rabbit.send_rabbit_msg("{}", "project_queue")
        channel.queue_declare.assert_called_with(queue="video_bg_remove_requests_queue", durable=True, arguments={"x-max-priority": 10})


if __name__ == "__main__":
    unittest.main()
