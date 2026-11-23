"""Check the video queue topology without Docker or a running RabbitMQ broker."""

import json
from pathlib import Path
import re
import unittest


DEFINITIONS_PATH = (
    Path(__file__).resolve().parents[2]
    / "picturas-27" / "rabbitMQ" / "definitions.json"
)
HEAVY_QUEUE = "video_heavy_queue"

# Keep the pre-elasticity work queues explicit so lost coverage cannot go unnoticed.
EXISTING_WORK_QUEUES = (
    "project_queue",
    "border_queue",
    "brightness_queue",
    "contrast_queue",
    "cut_queue",
    "saturation_queue",
    "binarization_queue",
    "rotate_queue",
    "resize_queue",
    "cut_ai_queue",
    "upgrade_ai_queue",
    "bg_remove_ai_queue",
    "text_ai_queue",
    "obj_ai_queue",
    "people_ai_queue",
    "expand_ai_queue",
    "video_queue",
)


class VideoQueueTopologyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.definitions = json.loads(DEFINITIONS_PATH.read_text(encoding="utf-8"))

    def queue(self, name):
        matches = [
            queue for queue in self.definitions["queues"]
            if queue["name"] == name and queue["vhost"] == "/"
        ]
        self.assertEqual(len(matches), 1, f"Expected exactly one {name} in vhost /")
        return matches[0]

    def policy(self):
        matches = [
            policy for policy in self.definitions["policies"]
            if policy["name"] == "work-queues-dead-letter" and policy["vhost"] == "/"
        ]
        self.assertEqual(len(matches), 1, "Expected exactly one work-queues-dead-letter policy")
        return matches[0]

    def test_heavy_queue_exists(self):
        self.queue(HEAVY_QUEUE)

    def test_heavy_queue_is_quorum(self):
        self.assertEqual(self.queue(HEAVY_QUEUE)["arguments"].get("x-queue-type"), "quorum")

    def test_heavy_queue_is_durable_and_not_auto_deleted(self):
        queue = self.queue(HEAVY_QUEUE)
        self.assertIs(queue["durable"], True)
        self.assertIs(queue["auto_delete"], False)

    def test_heavy_queue_has_the_direct_exchange_binding(self):
        self.assertIn({
            "source": "picturas",
            "vhost": "/",
            "destination": HEAVY_QUEUE,
            "destination_type": "queue",
            "routing_key": HEAVY_QUEUE,
            "arguments": {},
        }, self.definitions["bindings"])

    def test_dead_letter_policy_covers_heavy_queue(self):
        self.assertIsNotNone(re.search(self.policy()["pattern"], HEAVY_QUEUE))

    def test_dead_letter_policy_preserves_existing_queue_coverage(self):
        pattern = re.compile(self.policy()["pattern"])
        for name in EXISTING_WORK_QUEUES:
            with self.subTest(queue=name):
                self.assertEqual(self.queue(name)["arguments"].get("x-queue-type"), "quorum")
                self.assertIsNotNone(pattern.search(name))

    def test_dead_letter_policy_guarantees_are_preserved(self):
        policy = self.policy()
        self.assertEqual(policy["apply-to"], "quorum_queues")
        self.assertEqual(policy["definition"], {
            "dead-letter-exchange": "picturas.dlx",
            "dead-letter-strategy": "at-least-once",
            "overflow": "reject-publish",
            "delivery-limit": 5,
        })

    def test_classic_queues_remain_outside_work_queue_policy(self):
        pattern = re.compile(self.policy()["pattern"])
        for name in ("scale_queue", "watermark_queue", "ws_queue", "picturas.dlq"):
            with self.subTest(queue=name):
                self.assertIsNone(pattern.search(name))


if __name__ == "__main__":
    unittest.main()
