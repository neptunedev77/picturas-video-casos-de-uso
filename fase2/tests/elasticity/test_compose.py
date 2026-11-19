"""Validate the resolved video pool configuration without starting containers."""

import json
from pathlib import Path
import subprocess
import unittest


APP_PATH = Path(__file__).resolve().parents[2] / "picturas-27"
VIDEO_POOLS = ("video_tool", "video_heavy_tool")


class VideoPoolComposeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        result = subprocess.run(
            ["docker", "compose", "config", "--format", "json"],
            cwd=APP_PATH, capture_output=True, text=True, encoding="utf-8",
            check=True, timeout=30,
        )
        cls.services = json.loads(result.stdout)["services"]

    def test_each_pool_consumes_its_own_queue(self):
        for service, queue in zip(VIDEO_POOLS, ("video_queue", "video_heavy_queue")):
            with self.subTest(service=service):
                self.assertEqual(self.services[service]["environment"]["VIDEO_QUEUE"], queue)

    def test_pools_share_the_same_image_and_build(self):
        normal, heavy = (self.services[name] for name in VIDEO_POOLS)
        self.assertEqual(normal["image"], heavy["image"])
        self.assertEqual(normal["build"], heavy["build"])
        self.assertEqual(normal["build"]["dockerfile"], "video/Dockerfile")

    def test_worker_environment_only_differs_by_queue(self):
        environments = [
            {key: value for key, value in self.services[name]["environment"].items()
             if key != "VIDEO_QUEUE"}
            for name in VIDEO_POOLS
        ]
        self.assertEqual(environments[0], environments[1])
        self.assertEqual(environments[0]["VIDEO_PREVIEW_SECONDS"], "3")
        self.assertEqual(environments[0]["WHISPER_MODEL"], "small")
        self.assertEqual(environments[0]["WHISPER_CACHE_DIR"], "/models/whisper")
        self.assertEqual(environments[0]["WHISPER_CPU_THREADS"], "2")

    def test_pools_share_volumes_networks_and_dependencies(self):
        normal, heavy = (self.services[name] for name in VIDEO_POOLS)
        for key in ("volumes", "networks", "depends_on"):
            with self.subTest(configuration=key):
                self.assertEqual(normal[key], heavy[key])
        self.assertEqual(
            {(volume["source"], volume["target"]) for volume in normal["volumes"]},
            {("image_data", "/app/images"), ("whisper_models", "/models/whisper")},
        )
        self.assertEqual(normal["depends_on"]["rabbitmq"]["condition"], "service_healthy")

    def test_each_replica_has_cpu_and_memory_limits(self):
        for name in VIDEO_POOLS:
            with self.subTest(service=name):
                self.assertEqual(float(self.services[name]["cpus"]), 2.0)
                self.assertEqual(int(self.services[name]["mem_limit"]), 3 * 2**30)

    def test_worker_grace_is_preserved_with_a_longer_docker_timeout(self):
        for name in VIDEO_POOLS:
            with self.subTest(service=name):
                service = self.services[name]
                self.assertEqual(service["environment"]["WORKER_SHUTDOWN_GRACE_S"], "8")
                self.assertEqual(service["stop_grace_period"], "45s")
                self.assertEqual(service.get("stop_signal", "SIGTERM"), "SIGTERM")

    def test_pools_keep_restart_policy_and_allow_replicas_without_extra_ports(self):
        for name in VIDEO_POOLS:
            with self.subTest(service=name):
                service = self.services[name]
                self.assertEqual(service["restart"], "on-failure")
                self.assertFalse(service.get("container_name"))
                self.assertFalse(service.get("ports"))


if __name__ == "__main__":
    unittest.main()
