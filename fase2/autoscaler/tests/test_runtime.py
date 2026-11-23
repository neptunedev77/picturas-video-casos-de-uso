import json
from pathlib import Path
import subprocess
from types import SimpleNamespace
import unittest
from urllib.error import URLError

from fase2.autoscaler.autoscaler import load_config
from fase2.autoscaler.policy import ReplicaCounts, evaluate
from fase2.autoscaler.runtime import ReadError, Runtime, parse_containers, parse_queues


CONFIG_PATH = Path(__file__).resolve().parents[1] / "config.json"


def container(identifier="a", service="video_tool", status="running", project="picturas", **state):
    return {
        "Id": identifier * 64,
        "Config": {"Labels": {"com.docker.compose.project": project, "com.docker.compose.service": service}},
        "State": {"Status": status, "Running": status in ("running", "paused"), **state},
    }


class RuntimeTests(unittest.TestCase):
    def setUp(self):
        self.config = load_config(CONFIG_PATH)
        self.documents = [container(), container("b", "video_heavy_tool")]
        self.queues = [
            {"name": pool.queue, "vhost": "/", "messages_ready": 2,
             "messages_unacknowledged": 1, "consumers": 1}
            for pool in self.config.policy.pools
        ]
        self.commands, self.requests = [], []
        self.docker_failure = False
        self.http_failure = False
        self.inspect_payload = None

    def run_command(self, command, **kwargs):
        self.commands.append(command)
        self.assertEqual(command[0], "docker")
        self.assertIn(command[1], ("ps", "inspect"))
        self.assertFalse(kwargs["check"])
        if self.docker_failure:
            return SimpleNamespace(returncode=1, stdout="", stderr="daemon unavailable")
        if command[1] == "ps":
            service = command[-1].rsplit("=", 1)[1]
            identifiers = [c["Id"] for c in self.documents if
                           c["Config"]["Labels"]["com.docker.compose.service"] == service]
            return SimpleNamespace(returncode=0, stdout="\n".join(identifiers), stderr="")
        payload = self.documents if self.inspect_payload is None else self.inspect_payload
        return SimpleNamespace(returncode=0, stdout=json.dumps(payload), stderr="")

    def get_http(self, url, headers, timeout):
        self.requests.append((url, headers, timeout))
        if self.http_failure:
            raise URLError("broker unavailable")
        return self.queues

    def runtime(self):
        return Runtime(self.config, "test-user", "test-password", self.run_command, self.get_http)

    def test_queue_metrics_are_parsed_without_defaulting_missing_values(self):
        queues = parse_queues(self.queues, self.config.policy.pools, "/")
        self.assertEqual((queues["normal"].ready, queues["normal"].unacked, queues["normal"].consumers), (2, 1, 1))

    def test_invalid_queue_counts_are_rejected(self):
        for value in (-1, True, "0", None, float("nan")):
            with self.subTest(value=value):
                self.queues[0]["messages_ready"] = value
                with self.assertRaises(ReadError):
                    parse_queues(self.queues, self.config.policy.pools, "/")

    def test_missing_queue_metric_is_not_zero(self):
        del self.queues[0]["messages_unacknowledged"]
        with self.assertRaises(ReadError):
            parse_queues(self.queues, self.config.policy.pools, "/")

    def test_missing_duplicate_or_wrong_vhost_queue_is_rejected(self):
        for payload in (self.queues[:1], [*self.queues, self.queues[0]],
                        [{**queue, "vhost": "other"} for queue in self.queues], {}):
            with self.subTest(payload=payload), self.assertRaises(ReadError):
                parse_queues(payload, self.config.policy.pools, "/")

    def test_unavailable_queue_is_rejected(self):
        self.queues[0]["state"] = "down"
        with self.assertRaises(ReadError):
            parse_queues(self.queues, self.config.policy.pools, "/")

    def test_container_lifecycle_states_are_counted(self):
        documents = [
            container("a"), container("b", status="created"),
            container("c", status="restarting"), container("d", Health={"Status": "starting"}),
            container("e", status="stopping"), container("f", status="removing"),
            container("1", status="paused"), container("2", status="exited"),
            container("3", status="dead"), container("4", "video_heavy_tool"),
        ]
        counts = parse_containers(documents, "picturas", self.config.policy.pools)
        self.assertEqual(counts["normal"], ReplicaCounts(running=1, starting=3, stopping=2, paused=1, stopped=2))
        self.assertEqual(counts["normal"].occupied, 7)
        self.assertEqual(counts["heavy"].running, 1)

    def test_labels_select_exact_services_and_project_and_exclude_oneoff_tests(self):
        oneoff = container("e")
        oneoff["Config"]["Labels"]["com.docker.compose.oneoff"] = "True"
        documents = [container(), container("b", "video_heavy_tool"),
                     container("c", project="other"), container("d", service="video_tool_extra"), oneoff]
        counts = parse_containers(documents, "picturas", self.config.policy.pools)
        self.assertEqual(counts["normal"].occupied, 1)
        self.assertEqual(counts["heavy"].occupied, 1)

    def test_paused_flag_is_counted_even_if_status_still_says_running(self):
        counts = parse_containers([container(Paused=True)], "picturas", self.config.policy.pools)
        self.assertEqual(counts["normal"], ReplicaCounts(paused=1))

    def test_malformed_duplicate_or_unknown_container_state_is_rejected(self):
        for payload in ([container(status="unknown")], [container(Running=False)],
                        [container(status="exited", Running=True)],
                        [container(status="exited", Running=None)],
                        [container(), container()], [{}], None):
            with self.subTest(payload=payload), self.assertRaises(ReadError):
                parse_containers(payload, "picturas", self.config.policy.pools)

    def test_runtime_reads_queue_metrics_and_real_containers(self):
        observations = self.runtime().collect()
        self.assertEqual(observations["normal"].replicas.running, 1)
        self.assertEqual(observations["heavy"].queue.ready, 2)
        self.assertEqual(observations["normal"].errors, ())
        self.assertEqual([command[1] for command in self.commands], ["ps", "ps", "inspect"])
        self.assertTrue(self.requests[0][0].endswith("/queues/%2F"))
        self.assertTrue(self.requests[0][1]["Authorization"].startswith("Basic "))
        self.assertEqual(self.requests[0][2], 2)

    def test_empty_successful_docker_queries_are_legitimate_zero_counts(self):
        self.documents = []
        observations = self.runtime().collect()
        self.assertEqual(observations["normal"].replicas.occupied, 0)
        self.assertEqual(observations["normal"].errors, ())
        self.assertEqual(len(self.commands), 2)

    def test_rabbitmq_failure_does_not_become_empty_queue(self):
        self.http_failure = True
        observations = self.runtime().collect()
        self.assertIsNone(observations["normal"].queue)
        self.assertEqual(observations["normal"].replicas.running, 1)
        result = evaluate(self.config.policy, observations, {}, 0)
        self.assertTrue(result.degraded)
        self.assertTrue(all(d.intent == "hold" for d in result.decisions))

    def test_docker_failure_does_not_fabricate_free_capacity(self):
        self.docker_failure = True
        observations = self.runtime().collect()
        self.assertIsNone(observations["normal"].replicas)
        self.assertIsNone(observations["heavy"].replicas)
        result = evaluate(self.config.policy, observations, {}, 0)
        self.assertIsNone(result.observed_total)
        self.assertTrue(all(d.desired is None for d in result.decisions))

    def test_failed_docker_refresh_keeps_last_counts_but_marks_them_unusable(self):
        runtime = self.runtime()
        first = runtime.collect()
        self.docker_failure = True
        second = runtime.collect()
        self.assertEqual(second["normal"].replicas, first["normal"].replicas)
        self.assertTrue(second["normal"].errors)
        self.assertTrue(evaluate(self.config.policy, second, {}, 0).degraded)

    def test_partial_inspect_response_does_not_fabricate_a_missing_replica(self):
        self.inspect_payload = self.documents[:1]
        observations = self.runtime().collect()
        self.assertIsNone(observations["normal"].replicas)
        self.assertIn("incomplete", observations["normal"].errors[0])

    def test_malformed_inspect_ids_or_labels_do_not_fabricate_free_capacity(self):
        malformed_id = container()
        malformed_id["Id"] = []
        wrong_labels = container()
        wrong_labels["Config"]["Labels"]["com.docker.compose.project"] = "other"
        malformed_config = container()
        malformed_config["Config"] = "invalid"
        for document in (malformed_id, wrong_labels, malformed_config):
            with self.subTest(document=document):
                self.inspect_payload = [document, self.documents[1]]
                observation = self.runtime().collect()["normal"]
                self.assertIsNone(observation.replicas)
                self.assertTrue(observation.errors)

    def test_docker_timeout_or_missing_executable_is_degraded(self):
        for failure in (FileNotFoundError("docker missing"), subprocess.TimeoutExpired("docker", 2)):
            with self.subTest(failure=failure):
                def fail(*args, **kwargs):
                    raise failure
                runtime = Runtime(self.config, password="test-password", command_runner=fail, http_get=self.get_http)
                self.assertIsNone(runtime.collect()["normal"].replicas)

    def test_invalid_docker_json_is_degraded(self):
        def command(arguments, **kwargs):
            result = self.run_command(arguments, **kwargs)
            if arguments[1] == "inspect":
                result.stdout = "not JSON"
            return result
        runtime = Runtime(self.config, password="test-password", command_runner=command, http_get=self.get_http)
        self.assertIsNone(runtime.collect()["normal"].replicas)

    def test_missing_credentials_are_reported_without_a_request(self):
        runtime = Runtime(self.config, command_runner=self.run_command, http_get=self.get_http)
        observation = runtime.collect()["normal"]
        self.assertIsNone(observation.queue)
        self.assertTrue(observation.errors)
        self.assertEqual(self.requests, [])

    def test_runtime_rejects_every_non_read_docker_command(self):
        runtime = self.runtime()
        for operation in ("run", "create", "start", "stop", "rm", "compose"):
            with self.subTest(operation=operation), self.assertRaises(ReadError):
                runtime._docker([operation])
        self.assertEqual(self.commands, [])

    def test_inventory_is_from_the_same_valid_snapshot_as_counts(self):
        runtime = self.runtime()
        observations = runtime.collect()
        self.assertEqual(runtime.inventory, self.documents)
        self.assertEqual(observations["normal"].replicas.running, 1)
        self.docker_failure = True
        runtime.collect()
        self.assertIsNone(runtime.inventory)

    def test_inventory_excludes_compose_oneoff_containers(self):
        self.documents[0]["Config"]["Labels"]["com.docker.compose.oneoff"] = "True"
        runtime = self.runtime()
        observations = runtime.collect()
        self.assertEqual(runtime.inventory, self.documents[1:])
        self.assertEqual(observations["normal"].replicas.occupied, 0)

    def test_actuation_can_pin_read_commands_to_one_context(self):
        commands = []
        def command(arguments, **kwargs):
            commands.append(arguments)
            self.assertEqual(arguments[:3], ["docker", "--context", "pinned-context"])
            return self.run_command(["docker", *arguments[3:]], **kwargs)
        runtime = Runtime(self.config, password="test-password", command_runner=command, http_get=self.get_http)
        runtime.docker_context = "pinned-context"
        self.assertEqual(runtime.collect()["normal"].replicas.running, 1)
        self.assertEqual(len(commands), 3)


if __name__ == "__main__":
    unittest.main()
