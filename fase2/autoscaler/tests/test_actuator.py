"""Deterministic actuation tests: no Docker daemon or broker is contacted."""

from dataclasses import replace
import json
import multiprocessing
import os
from pathlib import Path
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from fase2.autoscaler.actuator import Actuator, SafetyError, exclusive_lock
from fase2.autoscaler.autoscaler import load_config, observe
from fase2.autoscaler.policy import Observation, PoolMemory, QueueMetrics
from fase2.autoscaler.runtime import parse_containers


CONFIG_PATH = Path(__file__).resolve().parents[1] / "config.json"


def compose_files_label(config):
    """The config_files label real Compose writes: compose_file plus the override next to it."""
    files = [config.compose_file]
    override = config.compose_file.parent / "docker-compose.override.yml"
    if override.is_file():
        files.append(override)
    return ",".join(str(f) for f in files)


def hold_lock(path, ready, release):
    with exclusive_lock(Path(path)):
        ready.set()
        release.wait(10)


class World:
    def __init__(self, config, normal=1, heavy=1):
        self.config = config
        self.inventory = []
        self.commands, self.up_commands = [], []
        self.docker_context = None
        self.tick, self.wall = 100.0, 1800000000.0
        self.queues = {"normal": QueueMetrics(0, 0, normal), "heavy": QueueMetrics(20, 0, heavy)}
        self.failure = self.invalid = self.on_up = self.on_collect = None
        self.collects = 0
        self.sequence = 0
        self.documents = []
        for service, count in (("video_tool", normal), ("video_heavy_tool", heavy)):
            for _ in range(count):
                self.add(service)
        self.spec = {"name": config.project, "services": {}}
        for service, queue in (("video_tool", "video_queue"), ("video_heavy_tool", "video_heavy_queue")):
            self.spec["services"][service] = {
                "image": "picturas-video_tool", "environment": {"VIDEO_QUEUE": queue},
                "cpus": "4.0", "mem_limit": 3 * 2**30, "restart": "on-failure",
                "networks": {"elk": None},
                "depends_on": {"rabbitmq": {"condition": "service_healthy"}},
                "volumes": [{"source": "image_data", "target": "/app/images"},
                            {"source": "whisper_models", "target": "/models/whisper"}],
            }

    def add(self, service, status="running"):
        self.sequence += 1
        document = {
            "Id": f"{self.sequence:064x}",
            "Config": {"Labels": {
                "com.docker.compose.project": self.config.project,
                "com.docker.compose.service": service,
                "com.docker.compose.project.working_dir": str(self.config.compose_file.parent),
                "com.docker.compose.project.config_files": compose_files_label(self.config),
            }},
            "State": {"Status": status, "Running": status == "running"},
        }
        self.documents.append(document)
        return document

    def collect(self):
        self.collects += 1
        if self.on_collect:
            self.on_collect(self.collects)
        if self.invalid == "docker":
            self.inventory = None
            return {name: Observation(None, queue, ("docker unavailable",)) for name, queue in self.queues.items()}
        self.inventory = list(self.documents)
        replicas = parse_containers(self.inventory, self.config.project, self.config.policy.pools)
        return {name: Observation(replicas[name], None if self.invalid == "rabbit" else queue)
                for name, queue in self.queues.items()}

    def command(self, arguments, **kwargs):
        self.commands.append(arguments)
        assert kwargs["check"] is False
        if arguments == ["docker", "context", "show"]:
            return SimpleNamespace(returncode=0, stdout="test-context\n")
        assert arguments[:3] == ["docker", "--context", "test-context"]
        if arguments[3] == "info":
            if self.failure == "daemon":
                return SimpleNamespace(returncode=1, stdout="")
            return SimpleNamespace(returncode=0, stdout="test-daemon")
        if arguments[-3:] == ["config", "--format", "json"]:
            return SimpleNamespace(returncode=0, stdout=json.dumps(self.spec))
        assert "up" in arguments
        self.up_commands.append(arguments)
        if self.failure == "launch":
            raise FileNotFoundError("docker")
        if self.failure == "timeout":
            raise subprocess.TimeoutExpired(arguments, kwargs["timeout"])
        if self.failure == "nonzero":
            return SimpleNamespace(returncode=1, stdout="")
        if self.on_up:
            self.on_up(arguments)
        else:
            self.add(arguments[-1])
            name = "normal" if arguments[-1] == "video_tool" else "heavy"
            self.queues[name] = replace(self.queues[name], consumers=self.queues[name].consumers + 1)
        return SimpleNamespace(returncode=0, stdout="")

    def advance(self, seconds):
        self.wall += seconds
        self.tick += seconds


class ActuatorTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.config = replace(load_config(CONFIG_PATH), state_dir=Path(self.directory.name))
        self.world = World(self.config)
        self.memory = {}
        self.actuator = self.new_actuator()

    def new_actuator(self, config=None):
        return Actuator(config or self.config, self.world.command,
                        lambda: self.world.wall, lambda: self.world.tick)

    def step(self, actuator=None):
        report, self.memory = (actuator or self.actuator).step(
            self.world, self.memory,
            lambda config, runtime, memory: observe(config, runtime, memory, self.world.tick),
        )
        return report

    def journal(self):
        paths = list(Path(self.directory.name).glob("*.json"))
        self.assertEqual(len(paths), 1)
        return paths[0], json.loads(paths[0].read_text(encoding="utf-8"))

    def test_heavy_one_to_two_and_confirmed_consumer(self):
        before = {d["Id"] for d in self.world.documents}
        report = self.step()
        self.assertEqual(report["actuation"]["status"], "ready")
        self.assertTrue(report["actuation"]["ready"])
        self.assertEqual((report["actions_attempted"], report["actions_executed"]), (1, 1))
        self.assertEqual(report["observed_total"], 3)
        self.assertEqual(report["occupied_with_reservations"], 3)
        self.assertTrue(before.issubset(d["Id"] for d in self.world.documents))
        self.assertIsNone(self.journal()[1]["pending"])

    def test_heavy_zero_to_one(self):
        self.world = World(self.config, heavy=0)
        self.actuator = self.new_actuator()
        report = self.step()
        self.assertEqual(report["actuation"]["status"], "ready")
        self.assertEqual(report["pools"]["heavy"]["replicas"]["running"], 1)

    def test_normal_one_to_two(self):
        self.world.queues = {"normal": QueueMetrics(10, 0, 1), "heavy": QueueMetrics(0, 0, 1)}
        report = self.step()
        self.assertEqual(report["actuation"]["pool"], "normal")
        self.assertEqual(self.world.up_commands[0][-1], "video_tool")

    def test_missing_normal_minimum_takes_priority(self):
        self.world = World(self.config, normal=0, heavy=1)
        self.actuator = self.new_actuator()
        report = self.step()
        self.assertEqual(report["actuation"]["pool"], "normal")

    def test_only_one_pool_is_added_per_step(self):
        self.world = World(self.config, heavy=0)
        self.world.queues["normal"] = QueueMetrics(100, 0, 1)
        self.actuator = self.new_actuator()
        report = self.step()
        self.assertEqual(len(self.world.up_commands), 1)
        self.assertEqual(report["observed_total"], 2)

    def test_pool_maximum(self):
        self.world = World(self.config, normal=2, heavy=0)
        self.world.queues = {"normal": QueueMetrics(100, 0, 2), "heavy": QueueMetrics(0, 0, 0)}
        self.actuator = self.new_actuator()
        self.step()
        self.assertEqual(self.world.up_commands, [])

    def test_global_budget(self):
        self.world = World(self.config, heavy=2)
        self.world.queues["normal"] = QueueMetrics(100, 0, 1)
        self.actuator = self.new_actuator()
        self.step()
        self.assertEqual(self.world.up_commands, [])

    def test_repeated_steps_do_not_duplicate_capacity(self):
        self.step()
        for _ in range(4):
            self.world.advance(10)
            self.step()
        self.assertEqual(len(self.world.up_commands), 1)

    def test_cooldown_survives_new_actuator_and_empty_memory(self):
        self.world = World(self.config, heavy=0)
        self.actuator = self.new_actuator()
        self.step()
        self.memory = {}
        self.world.advance(4)
        report = self.step(self.new_actuator())
        self.assertEqual(report["pools"]["heavy"]["decision"]["reason"], "scale_out_cooldown")
        self.assertEqual(len(self.world.up_commands), 1)
        self.world.advance(1)
        self.step(self.new_actuator())
        self.assertEqual(len(self.world.up_commands), 2)

    def test_policy_intention_cooldown_is_respected(self):
        self.memory = {"heavy": PoolMemory(last_scale_out=self.world.tick)}
        self.step()
        self.assertEqual(self.world.up_commands, [])

    def test_starting_paused_stopping_and_stopped_never_trigger_reconciliation_removal(self):
        for status in ("created", "restarting", "paused", "removing", "exited", "dead"):
            with self.subTest(status=status):
                self.world = World(self.config)
                self.world.add("video_heavy_tool", status)
                self.actuator = self.new_actuator()
                self.memory = {}
                self.step()
                self.assertEqual(self.world.up_commands, [])

    def test_stopped_container_in_other_pool_blocks_actuation(self):
        self.world.documents[0]["State"] = {"Status": "exited", "Running": False}
        self.world.queues["normal"] = QueueMetrics(0, 0, 0)
        report = self.step()
        self.assertEqual(report["actuation"]["status"], "blocked")
        self.assertEqual(self.world.up_commands, [])

    def test_compose_uses_explicit_paths_context_service_and_non_destructive_flags(self):
        self.step()
        command = self.world.up_commands[0]
        for flag in ("--project-name", "--project-directory", "--file", "--no-deps", "--no-recreate", "--no-build"):
            self.assertIn(flag, command)
        self.assertIn(str(self.config.compose_file), command)
        self.assertIn(str(self.config.compose_file.parent), command)
        self.assertEqual(command[-5:], ["--pull", "never", "--scale", "video_heavy_tool=2", "video_heavy_tool"])
        for forbidden in ("stop", "rm", "down", "--remove-orphans", "--force-recreate", "--build"):
            self.assertNotIn(forbidden, command)

    def test_compose_includes_the_override_file_compose_loads_by_default(self):
        override = self.config.compose_file.parent / "docker-compose.override.yml"
        self.assertTrue(override.is_file())   # shipped with the repository
        self.step()
        command = self.world.up_commands[0]
        files = [command[i + 1] for i, part in enumerate(command) if part == "--file"]
        self.assertEqual(files, [str(self.config.compose_file), str(override)])

    def test_container_created_without_the_override_blocks_actuation(self):
        # e.g. started with `docker compose -f docker-compose.yaml`: different configuration
        self.world.documents[0]["Config"]["Labels"]["com.docker.compose.project.config_files"] = \
            str(self.config.compose_file)
        report = self.step()
        self.assertEqual(report["actuation"]["status"], "blocked")
        self.assertEqual(self.world.up_commands, [])

    def test_compose_cannot_inherit_automatic_orphan_removal(self):
        original = self.world.command
        environments = []
        def command(arguments, **kwargs):
            if "up" in arguments:
                environments.append(kwargs.get("env", {}))
            return original(arguments, **kwargs)
        actuator = Actuator(self.config, command, lambda: self.world.wall, lambda: self.world.tick)
        with patch.dict(os.environ, {"COMPOSE_REMOVE_ORPHANS": "1"}):
            self.assertTrue(self.step(actuator)["actuation"]["ready"])
            self.assertEqual(environments[0].get("COMPOSE_REMOVE_ORPHANS"), "0")
            self.assertEqual(os.environ["COMPOSE_REMOVE_ORPHANS"], "1")

    def test_existing_containers_from_another_checkout_are_not_touched(self):
        self.world.documents[0]["Config"]["Labels"]["com.docker.compose.project.working_dir"] = "/other/checkout"
        report = self.step()
        self.assertEqual(report["actuation"]["status"], "blocked")
        self.assertEqual(self.world.up_commands, [])

    def test_unsafe_compose_configuration_is_blocked(self):
        for key, value in (("ports", ["9000:9000"]), ("container_name", "fixed"), ("cpus", 2), ("mem_limit", 1)):
            with self.subTest(key=key):
                spec = self.world.spec["services"]["video_tool"]
                original = dict(spec)
                spec[key] = value
                self.step()
                self.assertEqual(self.world.up_commands, [])
                spec.clear(); spec.update(original)

    def test_fresh_observation_cancels_an_outdated_proposal(self):
        def collect(number):
            if number == 2:
                self.world.queues["heavy"] = QueueMetrics(0, 0, 1)
        self.world.on_collect = collect
        report = self.step()
        self.assertEqual(report["actuation"]["status"], "idle")
        self.assertEqual(self.world.up_commands, [])

    def test_fresh_capacity_change_cannot_exceed_three(self):
        def collect(number):
            if number == 2:
                self.world.add("video_tool")
                self.world.queues["normal"] = QueueMetrics(0, 0, 2)
        self.world.on_collect = collect
        self.step()
        self.assertEqual(self.world.up_commands, [])

    def test_invalid_rabbit_or_docker_observation_never_creates(self):
        for failure in ("rabbit", "docker"):
            with self.subTest(failure=failure):
                self.world.invalid = failure
                report = self.step()
                self.assertEqual(report["status"], "degraded")
                self.assertEqual(self.world.up_commands, [])

    def test_missing_consumer_prevents_creation(self):
        self.world.queues["heavy"] = QueueMetrics(10, 0, 0)
        self.step()
        self.assertEqual(self.world.up_commands, [])

    def test_docker_preflight_failure_does_not_invent_zero_capacity(self):
        self.world.failure = "daemon"
        report = self.step()
        self.assertIsNone(report["observed_total"])
        self.assertEqual(self.world.up_commands, [])

    def test_failed_creation_without_observed_container_keeps_reservation(self):
        self.world.failure = "nonzero"
        report = self.step()
        self.assertEqual(report["actuation"]["status"], "uncertain")
        self.assertEqual(report["occupied_with_reservations"], 3)
        self.assertEqual(report["actions_executed"], 0)
        self.world.advance(120)
        self.memory = {}
        again = self.step(self.new_actuator())
        self.assertEqual(again["actuation"]["reserved_slots"], 1)
        self.assertEqual(len(self.world.up_commands), 1)

    def test_timeout_is_journaled_before_the_request_and_survives_restart(self):
        self.world.failure = "timeout"
        self.step()
        self.assertEqual(self.journal()[1]["pending"]["phase"], "uncertain")
        self.memory = {}
        self.world.advance(10)
        self.step(self.new_actuator())
        self.assertEqual(len(self.world.up_commands), 1)

    def test_creation_is_reserved_on_disk_before_compose_runs(self):
        def up(arguments):
            state = self.journal()[1]
            self.assertEqual(state["pending"]["phase"], "reserved")
            self.assertEqual(state["pending"]["target"], 2)
        self.world.on_up = up
        report = self.step()
        self.assertEqual(report["actuation"]["status"], "pending")

    def test_code_zero_without_new_id_is_not_ready(self):
        self.world.on_up = lambda command: None
        report = self.step()
        self.assertEqual(report["actions_executed"], 1)
        self.assertFalse(report["actuation"]["ready"])
        self.assertEqual(report["actuation"]["reserved_slots"], 1)

    def test_created_but_not_started_is_counted_once(self):
        self.world.on_up = lambda command: self.world.add(command[-1], "created")
        report = self.step()
        self.assertEqual(report["pools"]["heavy"]["replicas"]["starting"], 1)
        self.assertEqual(report["occupied_with_reservations"], 3)
        self.assertEqual(report["actuation"]["reserved_slots"], 0)
        self.step()
        self.assertEqual(len(self.world.up_commands), 1)

    def test_running_without_consumer_stays_pending_until_real_consumer_appears(self):
        self.world.on_up = lambda command: self.world.add(command[-1])
        report = self.step()
        self.assertEqual(report["actuation"]["status"], "pending")
        self.assertFalse(report["actuation"]["ready"])
        self.world.advance(61)
        report = self.step(self.new_actuator())
        self.assertEqual(report["actuation"]["status"], "uncertain")
        self.world.queues["heavy"] = QueueMetrics(10, 0, 2)
        report = self.step(self.new_actuator())
        self.assertTrue(report["actuation"]["ready"])
        self.assertEqual(len(self.world.up_commands), 1)

    def test_delayed_container_after_timeout_can_be_reconciled(self):
        self.world.failure = "timeout"
        self.step()
        self.world.add("video_heavy_tool")
        self.world.queues["heavy"] = QueueMetrics(10, 0, 2)
        report = self.step(self.new_actuator())
        self.assertTrue(report["actuation"]["ready"])
        self.assertIsNone(self.journal()[1]["pending"])

    def test_partial_creation_with_timeout_uses_actual_id(self):
        original = self.world.command
        def command(arguments, **kwargs):
            if "up" in arguments:
                self.world.add(arguments[-1], "created")
                self.world.up_commands.append(arguments)
                raise subprocess.TimeoutExpired(arguments, kwargs["timeout"])
            return original(arguments, **kwargs)
        actuator = Actuator(self.config, command, lambda: self.world.wall, lambda: self.world.tick)
        report = self.step(actuator)
        self.assertIsNotNone(report["actuation"]["container_id"])
        self.assertEqual(report["occupied_with_reservations"], 3)

    def test_failure_after_creation_that_exits_does_not_free_the_reservation(self):
        self.world.on_up = lambda command: self.world.add(command[-1], "exited")
        report = self.step()
        self.assertEqual(report["observed_total"], 2)
        self.assertEqual(report["occupied_with_reservations"], 3)
        self.step()
        self.assertEqual(len(self.world.up_commands), 1)

    def test_pending_operation_cannot_be_released_by_invalid_metrics(self):
        self.world.failure = "timeout"
        self.step()
        self.world.invalid = "rabbit"
        report = self.step(self.new_actuator())
        self.assertEqual(report["actuation"]["status"], "uncertain")
        self.assertIsNotNone(self.journal()[1]["pending"])

    def test_starting_replica_is_not_double_counted_when_rabbit_metrics_fail(self):
        self.world.on_up = lambda command: self.world.add(command[-1], "created")
        self.step()
        self.world.invalid = "rabbit"
        report = self.step(self.new_actuator())
        self.assertEqual(report["observed_total"], 3)
        self.assertEqual(report["occupied_with_reservations"], 3)
        self.assertEqual(report["actuation"]["reserved_slots"], 0)
        self.assertFalse(report["actuation"]["ready"])

    def test_crash_after_reservation_retains_journal_and_releases_os_lock(self):
        def up(command):
            raise KeyboardInterrupt()
        self.world.on_up = up
        with self.assertRaises(KeyboardInterrupt):
            self.step()
        self.assertEqual(self.journal()[1]["pending"]["phase"], "reserved")
        report = self.step(self.new_actuator())
        self.assertEqual(report["actuation"]["status"], "pending")
        self.assertEqual(len(self.world.up_commands), 1)

    def test_failure_to_save_result_after_docker_still_reports_attempt_and_reservation(self):
        save = self.actuator._save
        counter = [0]
        def fail_on_result(*args):
            counter[0] += 1
            if counter[0] == 2:
                raise OSError("disk full after request")
            return save(*args)
        with patch.object(self.actuator, "_save", side_effect=fail_on_result):
            report = self.step()
        self.assertEqual(report["actions_attempted"], 1)
        self.assertEqual(report["actions_executed"], 1)
        self.assertEqual(self.journal()[1]["pending"]["phase"], "reserved")
        self.assertTrue(self.step(self.new_actuator())["actuation"]["ready"])
        self.assertEqual(len(self.world.up_commands), 1)

    def test_no_temporary_journal_files_remain_after_success_or_write_error(self):
        self.step()
        self.assertEqual(list(Path(self.directory.name).glob("*.tmp")), [])
        path, state = self.journal()
        with patch("fase2.autoscaler.actuator.os.replace", side_effect=OSError("replace failed")):
            with self.assertRaises(OSError):
                self.actuator._save(path, state)
        self.assertEqual(list(Path(self.directory.name).glob("*.tmp")), [])

    def test_unexpected_extra_capacity_is_not_accepted_as_operation_success(self):
        self.world.failure = "timeout"
        self.step()
        self.world.add("video_tool")
        report = self.step(self.new_actuator())
        self.assertEqual(report["actuation"]["status"], "uncertain")
        self.assertFalse(report["actuation"]["ready"])
        self.assertEqual(len(self.world.up_commands), 1)

    def test_invalid_journal_shapes_fail_closed(self):
        scope = self.actuator._scope(self.world)
        lock, path = self.actuator._paths(scope)
        path.parent.mkdir(exist_ok=True)
        for state in ([], {"version": 1, "scope": scope, "cooldowns": {}, "pending": []},
                      {"version": 1, "scope": scope, "cooldowns": {"heavy": -1}, "pending": None}):
            with self.subTest(state=state):
                path.write_text(json.dumps(state), encoding="utf-8")
                self.assertEqual(self.step()["actuation"]["status"], "blocked")
                self.assertEqual(self.world.up_commands, [])

    def test_existing_id_disappearance_is_not_mistaken_for_success(self):
        self.world.failure = "timeout"
        self.step()
        self.world.documents.pop()
        report = self.step(self.new_actuator())
        self.assertEqual(report["actuation"]["status"], "uncertain")
        self.assertFalse(report["actuation"]["ready"])

    def test_failed_launch_is_known_not_to_have_sent_a_request(self):
        self.world.failure = "launch"
        report = self.step()
        self.assertEqual(report["actuation"]["status"], "failed")
        self.assertIsNone(self.journal()[1]["pending"])
        self.assertEqual(report["actions_executed"], 0)

    def test_os_error_after_partial_creation_keeps_reservation(self):
        def up(command):
            self.world.add(command[-1], "created")
            raise OSError("I/O failure after process launch")
        self.world.on_up = up
        report = self.step()
        self.assertIsNotNone(self.journal()[1]["pending"])
        self.assertEqual(report["actuation"]["status"], "uncertain")
        self.assertEqual(report["occupied_with_reservations"], 3)
        self.assertEqual(report["actions_executed"], 0)
        self.memory = {}
        self.world.advance(120)
        self.step(self.new_actuator())
        self.assertEqual(len(self.world.up_commands), 1)

    def test_os_error_without_visible_container_does_not_authorize_a_retry(self):
        def up(command):
            raise OSError("I/O failure; request outcome unknown")
        self.world.on_up = up
        report = self.step()
        self.assertEqual(report["actuation"]["status"], "uncertain")
        self.assertEqual(report["actuation"]["reserved_slots"], 1)
        self.memory = {}
        self.world.advance(120)
        self.step(self.new_actuator())
        self.assertEqual(len(self.world.up_commands), 1)

    def test_journal_write_failure_prevents_docker_mutation(self):
        with patch.object(self.actuator, "_save", side_effect=OSError("disk full")):
            report = self.step()
        self.assertEqual(report["actuation"]["status"], "blocked")
        self.assertEqual(self.world.up_commands, [])

    def test_corrupt_journal_is_preserved_and_blocks_creation(self):
        self.world.failure = "timeout"
        self.step()
        path, _ = self.journal()
        path.write_text("not json", encoding="utf-8")
        report = self.step(self.new_actuator())
        self.assertEqual(report["actuation"]["status"], "blocked")
        self.assertEqual(path.read_text(encoding="utf-8"), "not json")
        self.assertEqual(len(self.world.up_commands), 1)

    def test_pending_reservation_before_process_death_stays_blocked_without_id(self):
        self.world.failure = "timeout"
        self.step()
        path, state = self.journal()
        state["pending"]["phase"] = "reserved"
        path.write_text(json.dumps(state), encoding="utf-8")
        self.world.advance(3600)
        report = self.step(self.new_actuator())
        self.assertFalse(report["actuation"]["ready"])
        self.assertEqual(report["actuation"]["reserved_slots"], 1)
        self.assertEqual(len(self.world.up_commands), 1)

    def test_wall_clock_rollback_blocks_mutations(self):
        self.world.failure = "timeout"
        self.step()
        self.world.wall -= 10
        report = self.step(self.new_actuator())
        self.assertEqual(report["actuation"]["status"], "blocked")
        self.assertEqual(len(self.world.up_commands), 1)

    def test_same_host_two_actuators_share_the_lock(self):
        scope = self.actuator._scope(self.world)
        lock, _ = self.actuator._paths(scope)
        with exclusive_lock(lock):
            report = self.step(self.new_actuator())
        self.assertEqual(report["actuation"]["status"], "blocked")
        self.assertEqual(self.world.up_commands, [])

    def test_real_second_process_holds_lock_and_releases_it_on_exit(self):
        scope = self.actuator._scope(self.world)
        lock, _ = self.actuator._paths(scope)
        context = multiprocessing.get_context("spawn")
        ready, release = context.Event(), context.Event()
        process = context.Process(target=hold_lock, args=(str(lock), ready, release))
        process.start()
        try:
            self.assertTrue(ready.wait(10))
            self.assertEqual(self.step()["actuation"]["status"], "blocked")
            self.assertEqual(self.world.up_commands, [])
        finally:
            release.set()
            process.join(10)
            if process.is_alive():
                process.terminate(); process.join()
        self.assertEqual(process.exitcode, 0)
        self.assertTrue(self.step()["actuation"]["ready"])

    def test_scale_in_proposal_is_never_executed(self):
        self.world.queues["heavy"] = QueueMetrics(0, 0, 1)
        self.memory = {"heavy": PoolMemory(idle_since=0, last_total=1)}
        report = self.step()
        self.assertEqual(report["pools"]["heavy"]["decision"]["intent"], "scale_in")
        self.assertEqual(report["actuation"]["status"], "idle")
        self.assertEqual(self.world.up_commands, [])

    def test_mutating_policy_limits_or_services_is_rejected(self):
        for config in (replace(self.config, policy=replace(self.config.policy, max_total=4)),
                       replace(self.config, policy=replace(self.config.policy, pools=(
                           replace(self.config.policy.pools[0], service="other"), self.config.policy.pools[1])))):
            with self.subTest(config=config), self.assertRaises(ValueError):
                self.new_actuator(config)


if __name__ == "__main__":
    unittest.main()
