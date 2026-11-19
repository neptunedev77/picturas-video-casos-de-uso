"""Deterministic scale-in tests; Docker and RabbitMQ are simulated, not contacted."""

from dataclasses import replace
import json
from pathlib import Path
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from fase2.autoscaler.actuator import Actuator, exclusive_lock
from fase2.autoscaler.autoscaler import load_config, observe
from fase2.autoscaler.policy import PoolMemory, QueueMetrics
from fase2.autoscaler.scale_in import stop_seconds
from fase2.autoscaler.tests.test_actuator import World, CONFIG_PATH


class ScaleWorld(World):
    def __init__(self, config, normal=1, heavy=1):
        super().__init__(config, normal, heavy)
        self.queues = {"normal": QueueMetrics(0, 0, normal), "heavy": QueueMetrics(0, 0, heavy)}
        self.stops, self.removes = [], []
        self.stop_behavior = self.remove_behavior = "success"
        self.on_stop = self.on_remove = None
        for spec in self.spec["services"].values():
            spec["stop_grace_period"] = "45s"
            spec["environment"]["WORKER_SHUTDOWN_GRACE_S"] = "8"

    def stopped(self, identifier):
        container = next(c for c in self.documents if c["Id"] == identifier)
        if container["State"]["Running"]:
            service = container["Config"]["Labels"]["com.docker.compose.service"]
            name = "normal" if service == "video_tool" else "heavy"
            self.queues[name] = replace(self.queues[name], consumers=self.queues[name].consumers - 1)
        container["State"] = {"Status": "exited", "Running": False}

    def command(self, arguments, **kwargs):
        operation = arguments[3] if len(arguments) > 3 else None
        if operation not in ("stop", "rm"):
            return super().command(arguments, **kwargs)
        self.commands.append(arguments)
        assert arguments[:3] == ["docker", "--context", "test-context"]
        captured = {**kwargs, "env": {"COMPOSE_REMOVE_ORPHANS":
                                     kwargs.get("env", {}).get("COMPOSE_REMOVE_ORPHANS")}}
        if operation == "stop":
            self.stops.append((arguments, captured))
            if self.on_stop:
                self.on_stop(arguments)
            behavior = self.stop_behavior
            if behavior == "crash":
                raise KeyboardInterrupt()
            if behavior in ("timeout", "timeout_stopped"):
                if behavior == "timeout_stopped":
                    self.stopped(arguments[-1])
                raise subprocess.TimeoutExpired(arguments, kwargs["timeout"])
            if behavior == "io":
                raise OSError("stop I/O error")
            if behavior == "failed":
                return SimpleNamespace(returncode=1, stdout="")
            if behavior != "deferred":
                self.stopped(arguments[-1])
        else:
            self.removes.append((arguments, captured))
            if self.on_remove:
                self.on_remove(arguments)
            behavior = self.remove_behavior
            if behavior == "crash":
                raise KeyboardInterrupt()
            if behavior == "io":
                raise OSError("remove I/O error")
            if behavior == "timeout":
                raise subprocess.TimeoutExpired(arguments, kwargs["timeout"])
            if behavior == "failed":
                return SimpleNamespace(returncode=1, stdout="")
            if behavior != "deferred":
                self.documents = [c for c in self.documents if c["Id"] != arguments[-1]]
            if behavior == "timeout_removed":
                raise subprocess.TimeoutExpired(arguments, kwargs["timeout"])
        return SimpleNamespace(returncode=0, stdout="")


class ScaleInTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.config = replace(load_config(CONFIG_PATH), state_dir=Path(self.directory.name))
        self.reset()

    def reset(self, normal=1, heavy=1):
        self.world = ScaleWorld(self.config, normal, heavy)
        self.memory = {"normal": PoolMemory(idle_since=40, last_total=normal),
                       "heavy": PoolMemory(idle_since=40, last_total=heavy)}
        self.actor = self.new_actor()

    def new_actor(self, mode="scale"):
        return Actuator(self.config, self.world.command,
                        lambda: self.world.wall, lambda: self.world.tick, mode=mode)

    def step(self, actor=None):
        report, self.memory = (actor or self.actor).step(self.world, self.memory,
            lambda config, runtime, memory: observe(config, runtime, memory, self.world.tick))
        return report

    def journal(self):
        paths = list(Path(self.directory.name).glob("*.json"))
        self.assertEqual(len(paths), 1)
        return paths[0], json.loads(paths[0].read_text(encoding="utf-8"))

    def assert_no_removal(self):
        self.assertEqual(self.world.stops, [])
        self.assertEqual(self.world.removes, [])

    def test_normal_two_to_one_preserves_other_ids(self):
        self.reset(normal=2)
        before = {c["Id"] for c in self.world.documents}
        report = self.step()
        self.assertEqual(report["actuation"]["status"], "removed")
        self.assertEqual(report["pools"]["normal"]["replicas"]["running"], 1)
        removed = report["actuation"]["container_id"]
        self.assertEqual({c["Id"] for c in self.world.documents}, before - {removed})
        self.assertEqual(len(self.world.stops), 1)
        self.assertEqual(len(self.world.removes), 1)
        self.assertEqual(report["occupied_with_reservations"], 2)

    def test_normal_one_never_scales_to_zero(self):
        self.reset(heavy=0)
        self.step()
        self.assert_no_removal()
        self.assertEqual(len(self.world.documents), 1)

    def test_heavy_two_to_one(self):
        self.reset(heavy=2)
        report = self.step()
        self.assertEqual(report["actuation"]["pool"], "heavy")
        self.assertEqual(report["pools"]["heavy"]["replicas"]["running"], 1)

    def test_heavy_one_to_zero(self):
        report = self.step()
        self.assertTrue(report["actuation"]["ready"])
        self.assertEqual(report["pools"]["heavy"]["replicas"]["running"], 0)
        self.assertEqual(report["occupied_with_reservations"], 1)
        self.assertIsNone(self.journal()[1]["pending"])

    def test_fewer_than_sixty_idle_seconds(self):
        self.memory["heavy"] = PoolMemory(idle_since=41, last_total=1)
        self.step()
        self.assert_no_removal()

    def test_fresh_process_starts_a_new_idle_window(self):
        self.memory = {}
        self.step()
        self.assert_no_removal()
        self.world.advance(59)
        self.step()
        self.assert_no_removal()
        self.world.advance(1)
        self.assertEqual(self.step()["actuation"]["status"], "removed")

    def test_cooldown_in_policy_memory(self):
        self.memory["heavy"] = PoolMemory(idle_since=0, last_total=1, last_scale_in=90)
        self.step()
        self.assert_no_removal()

    def test_persistent_cooldown_starts_at_completion_and_survives_restart(self):
        # Isolate the 30-second cooldown from the separate idle-window guard.
        self.config = replace(self.config, policy=replace(self.config.policy, scale_in_idle_s=0))
        self.reset(heavy=2)
        self.step()
        self.memory = {}
        self.world.advance(29)
        report = self.step(self.new_actor())
        self.assertEqual(report["pools"]["heavy"]["decision"]["reason"], "scale_in_cooldown")
        self.assertEqual(len(self.world.stops), 1)
        self.world.advance(1)
        self.assertEqual(self.step(self.new_actor())["actuation"]["status"], "removed")
        self.assertEqual(len(self.world.stops), 2)

    def test_ready_or_unacked_prevent_scale_in(self):
        for ready, unacked in ((1, 0), (0, 1)):
            with self.subTest(ready=ready, unacked=unacked):
                self.world.queues["heavy"] = QueueMetrics(ready, unacked, 1)
                self.step()
                self.assert_no_removal()

    def test_new_work_in_final_observation_prevents_sigterm(self):
        def collect(number):
            if number == 2:
                self.world.queues["heavy"] = QueueMetrics(0, 1, 1)
        self.world.on_collect = collect
        self.step()
        self.assert_no_removal()

    def test_invalid_or_unknown_metrics_hold_capacity(self):
        for failure in ("rabbit", "docker"):
            with self.subTest(failure=failure):
                self.world.invalid = failure
                self.assertEqual(self.step()["status"], "degraded")
                self.assert_no_removal()

    def test_starting_stopping_paused_or_stopped_block_scale_in(self):
        for status in ("created", "restarting", "stopping", "paused", "exited"):
            with self.subTest(status=status):
                self.reset(heavy=2)
                self.world.documents[-1]["State"] = {"Status": status, "Running": status == "paused"}
                self.step()
                self.assert_no_removal()

    def test_pending_scale_out_blocks_stop_and_remove(self):
        self.world.queues["heavy"] = QueueMetrics(10, 0, 1)
        self.world.failure = "timeout"
        self.step(self.new_actor("scale-out"))
        self.world.queues["heavy"] = QueueMetrics(0, 0, 1)
        self.world.advance(100)
        self.step()
        self.assert_no_removal()
        self.assertIsNotNone(self.journal()[1]["pending"])

    def test_stop_uses_sigterm_and_compose_grace_for_the_exact_id(self):
        self.step()
        arguments, kwargs = self.world.stops[0]
        identifier = self.world.removes[0][0][-1]
        self.assertEqual(arguments[3:], ["stop", "--signal", "SIGTERM", "--timeout", "45", identifier])
        self.assertGreaterEqual(kwargs["timeout"], 45)
        self.assertEqual(self.world.removes[0][0][3:], ["rm", identifier])
        self.assertEqual(kwargs["env"]["COMPOSE_REMOVE_ORPHANS"], "0")

    def test_changed_compose_grace_is_honored(self):
        self.world.spec["services"]["video_heavy_tool"]["stop_grace_period"] = "1m15s"
        self.step()
        arguments, kwargs = self.world.stops[0]
        self.assertIn("75", arguments)
        self.assertGreaterEqual(kwargs["timeout"], 75)

    def test_invalid_grace_or_stop_signal_blocks_mutation(self):
        for grace, signal in (("7s", "SIGTERM"), ("0s", "SIGTERM"), ("bad", "SIGTERM"),
                              ("45s", "SIGKILL"), (None, "SIGTERM")):
            with self.subTest(grace=grace, signal=signal):
                self.reset()
                spec = self.world.spec["services"]["video_heavy_tool"]
                spec.update(stop_grace_period=grace, stop_signal=signal)
                self.step()
                self.assert_no_removal()

    def test_failed_sigterm_is_pending_and_never_removes_running_container(self):
        self.world.stop_behavior = "failed"
        report = self.step()
        self.assertEqual(report["actuation"]["status"], "uncertain")
        self.assertEqual(report["occupied_with_reservations"], 2)
        self.assertEqual(self.world.removes, [])
        self.step(self.new_actor())
        self.assertEqual(len(self.world.stops), 1)

    def test_stop_timeout_does_not_free_capacity_or_remove(self):
        self.world.stop_behavior = "timeout"
        report = self.step()
        self.assertEqual(report["actuation"]["status"], "uncertain")
        self.assertEqual(report["occupied_with_reservations"], 2)
        self.assertEqual(self.world.removes, [])

    def test_stop_io_failure_keeps_journal(self):
        self.world.stop_behavior = "io"
        self.step()
        self.assertEqual(self.journal()[1]["pending"]["phase"], "stop_uncertain")
        self.assertEqual(self.world.removes, [])

    def test_partial_stop_timeout_can_be_reconciled_from_actual_stopped_state(self):
        self.world.stop_behavior = "timeout_stopped"
        self.assertEqual(self.step()["actuation"]["status"], "removed")
        self.assertEqual(len(self.world.removes), 1)

    def test_zero_stop_result_without_stopped_state_never_authorizes_remove(self):
        self.world.stop_behavior = "deferred"
        report = self.step()
        self.assertFalse(report["actuation"]["ready"])
        self.assertEqual(self.world.removes, [])

    def test_stopped_container_occupies_budget_until_removal_confirmed(self):
        self.world.remove_behavior = "failed"
        report = self.step()
        self.assertEqual(report["observed_total"], 1)
        self.assertEqual(report["actuation"]["reserved_slots"], 1)
        self.assertEqual(report["occupied_with_reservations"], 2)
        self.assertEqual(report["actuation"]["status"], "uncertain")
        self.step(self.new_actor())
        self.assertEqual(len(self.world.removes), 1)

    def test_remove_timeout_keeps_slot_until_actual_absence(self):
        self.world.remove_behavior = "timeout"
        report = self.step()
        self.assertEqual(report["occupied_with_reservations"], 2)
        identifier = report["actuation"]["container_id"]
        self.world.documents = [c for c in self.world.documents if c["Id"] != identifier]
        self.assertEqual(self.step(self.new_actor())["actuation"]["status"], "removed")
        self.assertEqual(len(self.world.removes), 1)

    def test_remove_io_failure_retains_the_slot_and_never_uses_force(self):
        self.world.remove_behavior = "io"
        report = self.step()
        self.assertEqual(report["actuation"]["status"], "uncertain")
        self.assertEqual(report["occupied_with_reservations"], 2)
        self.assertEqual(self.journal()[1]["pending"]["phase"], "remove_uncertain")
        self.assertEqual(self.world.removes[0][0][3:], ["rm", report["actuation"]["container_id"]])

    def test_remove_timeout_after_real_removal_can_complete(self):
        self.world.remove_behavior = "timeout_removed"
        report = self.step()
        self.assertEqual(report["actuation"]["status"], "removed")
        self.assertEqual(report["occupied_with_reservations"], 1)

    def test_remove_zero_without_absence_is_not_completion(self):
        self.world.remove_behavior = "deferred"
        report = self.step()
        self.assertEqual(report["actuation"]["status"], "uncertain")
        self.assertEqual(report["occupied_with_reservations"], 2)

    def test_restart_between_stop_and_remove_resumes_the_same_id(self):
        self.world.stop_behavior = "deferred"
        first = self.step()
        identifier = first["actuation"]["container_id"]
        self.world.stopped(identifier)
        self.memory = {}
        second = self.step(self.new_actor())
        self.assertEqual(second["actuation"]["status"], "removed")
        self.assertEqual(second["actuation"]["container_id"], identifier)
        self.assertEqual(len(self.world.stops), 1)

    def test_restart_after_crash_with_stop_reserved_keeps_capacity(self):
        self.world.stop_behavior = "crash"
        with self.assertRaises(KeyboardInterrupt):
            self.step()
        self.assertEqual(self.journal()[1]["pending"]["phase"], "stop_reserved")
        report = self.step(self.new_actor())
        self.assertFalse(report["actuation"]["ready"])
        self.assertEqual(report["occupied_with_reservations"], 2)
        self.assertEqual(len(self.world.stops), 1)

    def test_restart_after_crash_with_remove_reserved_keeps_slot(self):
        self.world.remove_behavior = "crash"
        with self.assertRaises(KeyboardInterrupt):
            self.step()
        self.assertEqual(self.journal()[1]["pending"]["phase"], "remove_reserved")
        report = self.step(self.new_actor())
        self.assertEqual(report["occupied_with_reservations"], 2)
        self.assertEqual(len(self.world.removes), 1)

    def test_repeat_decisions_do_not_remove_an_extra_replica(self):
        self.reset(heavy=2)
        self.step()
        for _ in range(5):
            self.step(self.new_actor())
        self.assertEqual(len(self.world.stops), 1)
        self.assertEqual(len(self.world.removes), 1)

    def test_new_idle_window_is_required_after_a_reduction(self):
        self.reset(heavy=2)
        self.step()
        self.world.advance(59)
        self.step()
        self.assertEqual(len(self.world.stops), 1)
        self.world.advance(1)
        self.step()
        self.assertEqual(len(self.world.stops), 2)

    def test_other_actuator_holding_the_shared_lock_blocks_scale_in(self):
        scope = self.actor._scope(self.world)
        lock, _ = self.actor._paths(scope)
        with exclusive_lock(lock):
            self.assertEqual(self.step(self.new_actor())["actuation"]["status"], "blocked")
        self.assert_no_removal()

    def test_scale_out_only_mode_never_executes_scale_in(self):
        report = self.step(self.new_actor("scale-out"))
        self.assertEqual(report["mode"], "scale-out")
        self.assert_no_removal()

    def test_scale_out_only_mode_cannot_resume_pending_removal(self):
        self.world.remove_behavior = "failed"
        self.step()
        report = self.step(self.new_actor("scale-out"))
        self.assertEqual(report["actuation"]["status"], "blocked")
        self.assertEqual(len(self.world.stops), 1)
        self.assertEqual(len(self.world.removes), 1)
        self.assertEqual(report["occupied_with_reservations"], 2)

    def test_observe_does_not_resume_or_modify_a_pending_removal(self):
        self.world.remove_behavior = "failed"
        self.step()
        path, _ = self.journal()
        before = path.read_bytes()
        report, _ = observe(self.config, self.world, self.memory, self.world.tick)
        self.assertEqual(report["mode"], "observe")
        self.assertEqual(report["actions_executed"], 0)
        self.assertEqual(path.read_bytes(), before)
        self.assertEqual(len(self.world.stops), 1)
        self.assertEqual(len(self.world.removes), 1)

    def test_bidirectional_mode_preserves_scale_out(self):
        self.world.queues["heavy"] = QueueMetrics(100, 0, 1)
        report = self.step()
        self.assertEqual(report["mode"], "scale")
        self.assertTrue(report["actuation"]["ready"])
        self.assertEqual(len(self.world.up_commands), 1)
        self.assert_no_removal()

    def test_scale_out_has_priority_without_simultaneous_scale_in(self):
        self.reset(normal=2, heavy=0)
        self.world.queues["heavy"] = QueueMetrics(100, 0, 0)
        report = self.step()
        self.assertEqual(report["actuation"]["pool"], "heavy")
        self.assertEqual(len(self.world.up_commands), 1)
        self.assert_no_removal()

    def test_late_work_does_not_block_cleanup_of_an_already_stopped_id(self):
        for iteration, (ready, unacked) in enumerate(((1, 0), (0, 1))):
            with self.subTest(ready=ready, unacked=unacked):
                self.reset(heavy=2)
                self.world.advance(60 * iteration)
                def collect(number):
                    if number == 4:
                        self.world.queues["heavy"] = QueueMetrics(ready, unacked, 1)
                self.world.on_collect = collect
                report = self.step()
                self.assertEqual(report["actuation"]["status"], "removed")
                self.assertEqual(len(self.world.removes), 1)
                self.assertEqual(report["occupied_with_reservations"], 2)
                self.assertEqual(self.world.queues["heavy"], QueueMetrics(ready, unacked, 1))

    def test_invalid_metrics_after_stop_do_not_authorize_remove(self):
        self.world.on_stop = lambda command: setattr(self.world, "invalid", "rabbit")
        report = self.step()
        self.assertEqual(report["actuation"]["status"], "uncertain")
        self.assertEqual(report["occupied_with_reservations"], 2)
        self.assertEqual(self.world.removes, [])

    def test_final_invalid_observation_is_reported_instead_of_older_valid_metrics(self):
        def collect(number):
            if number == 4:
                self.world.invalid = "rabbit"
        self.world.on_collect = collect
        report = self.step()
        self.assertIsNone(report["pools"]["heavy"]["metrics"])
        self.assertEqual(report["actuation"]["status"], "uncertain")
        self.assertEqual(self.world.removes, [])

    def test_docker_failure_after_remove_reports_unknown_capacity(self):
        def collect(number):
            if number == 5:
                self.world.invalid = "docker"
        self.world.on_collect = collect
        report = self.step()
        self.assertIsNone(report["observed_total"])
        self.assertIsNone(report["occupied_with_reservations"])
        self.assertIsNotNone(self.journal()[1]["pending"])
        self.world.invalid = None
        self.assertEqual(self.step(self.new_actor())["actuation"]["status"], "removed")
        self.assertEqual(len(self.world.removes), 1)

    def test_unknown_docker_state_during_scale_in_keeps_reservation_without_fictitious_total(self):
        self.world.stop_behavior = "deferred"
        self.step()
        self.world.invalid = "docker"
        report = self.step(self.new_actor())
        self.assertIsNone(report["occupied_with_reservations"])
        self.assertEqual(report["actuation"]["reserved_slots"], 1)
        self.assertIsNotNone(self.journal()[1]["pending"])
        self.assertEqual(self.world.removes, [])

    def test_removed_container_with_invalid_rabbit_metrics_is_reconciled_after_restart(self):
        self.world.on_remove = lambda command: setattr(self.world, "invalid", "rabbit")
        report = self.step()
        self.assertEqual(report["occupied_with_reservations"], 2)
        self.assertEqual(self.journal()[1]["pending"]["phase"], "remove_sent")
        self.world.invalid = None
        self.assertEqual(self.step(self.new_actor())["actuation"]["status"], "removed")
        self.assertEqual(len(self.world.removes), 1)

    def test_new_work_after_confirmed_removal_can_trigger_scale_out_on_next_step(self):
        def collect(number):
            if number == 5:
                self.world.queues["heavy"] = QueueMetrics(1, 0, 0)
        self.world.on_collect = collect
        self.assertEqual(self.step()["actuation"]["status"], "removed")
        self.world.advance(self.config.policy.scale_out_cooldown_s)
        self.assertTrue(self.step()["actuation"]["ready"])
        self.assertEqual(len(self.world.up_commands), 1)

    def test_last_heavy_new_work_during_stop_recovers_without_operator(self):
        original_id = self.world.documents[-1]["Id"]
        self.world.on_stop = lambda command: self.world.queues.update(heavy=QueueMetrics(1, 0, 1))
        report = self.step()
        self.assertEqual(report["actuation"]["status"], "removed")
        self.assertEqual(self.world.queues["heavy"], QueueMetrics(1, 0, 0))
        self.assertIsNone(self.journal()[1]["pending"])
        self.world.advance(self.config.policy.scale_out_cooldown_s)
        report = self.step(self.new_actor())
        self.assertTrue(report["actuation"]["ready"])
        self.assertEqual(report["pools"]["heavy"]["replicas"]["running"], 1)
        self.assertEqual(self.world.queues["heavy"].ready, 1)  # No controller-side discard/ack.
        self.assertNotEqual(report["actuation"]["container_id"], original_id)
        self.assertLessEqual(report["occupied_with_reservations"], 3)

    def test_last_heavy_zero_then_a_new_job_returns_to_one_replica(self):
        original_id = self.world.documents[-1]["Id"]
        first = self.step()
        self.assertEqual(first["pools"]["heavy"]["replicas"]["running"], 0)
        self.assertIsNone(self.journal()[1]["pending"])
        self.world.advance(10)
        self.world.queues["heavy"] = QueueMetrics(1, 0, 0)
        self.memory = {}
        report = self.step(self.new_actor())
        self.assertTrue(report["actuation"]["ready"])
        self.assertEqual(report["pools"]["heavy"]["replicas"]["running"], 1)
        self.assertNotEqual(report["actuation"]["container_id"], original_id)
        self.assertEqual(len(self.world.up_commands), 1)
        self.assertEqual(len(self.world.removes), 1)

    def test_stop_retry_waits_for_previous_compose_grace_and_new_idle_window(self):
        self.world.spec["services"]["video_heavy_tool"]["stop_grace_period"] = "1m15s"
        self.world.stop_behavior = "deferred"
        self.step()
        self.memory = {}
        self.step(self.new_actor())
        self.world.advance(60)
        self.step(self.new_actor())
        self.assertEqual(len(self.world.stops), 1)
        self.world.stop_behavior = "success"
        self.world.advance(17)  # 75 s grace + the existing 2 s read timeout.
        self.assertEqual(self.step(self.new_actor())["actuation"]["status"], "removed")
        self.assertEqual(len(self.world.stops), 2)

    def test_remove_retry_requires_valid_fresh_metrics(self):
        self.world.remove_behavior = "failed"
        self.step()
        self.world.remove_behavior = "success"
        self.world.advance(30)
        self.world.invalid = "rabbit"
        self.assertEqual(self.step(self.new_actor())["actuation"]["status"], "uncertain")
        self.assertEqual(len(self.world.removes), 1)
        self.world.invalid = None
        self.assertEqual(self.step(self.new_actor())["actuation"]["status"], "removed")

    def test_unexpected_restart_after_stop_keeps_removal_blocked(self):
        self.world.remove_behavior = "failed"
        self.step()
        self.world.documents[-1]["State"] = {"Status": "running", "Running": True}
        self.world.queues["heavy"] = QueueMetrics(0, 0, 1)
        self.world.advance(120)
        self.step(self.new_actor())
        self.assertEqual(len(self.world.removes), 1)
        self.assertEqual(len(self.world.stops), 1)
        self.assertIsNotNone(self.journal()[1]["pending"])

    def test_crash_before_stop_retries_same_id_after_a_new_idle_window(self):
        self.world.stop_behavior = "crash"
        with self.assertRaises(KeyboardInterrupt):
            self.step()
        identifier = self.journal()[1]["pending"]["container_id"]
        self.world.stop_behavior = "success"
        self.memory = {}
        self.step(self.new_actor())
        self.world.advance(59)
        self.step(self.new_actor())
        self.assertEqual(len(self.world.stops), 1)
        self.world.advance(1)
        report = self.step(self.new_actor())
        self.assertEqual(report["actuation"]["status"], "removed")
        self.assertEqual([args[-1] for args, _ in self.world.stops], [identifier, identifier])
        self.assertEqual(len(self.world.removes), 1)

    def test_crash_before_remove_retries_same_stopped_id_after_cooldown(self):
        self.world.remove_behavior = "crash"
        with self.assertRaises(KeyboardInterrupt):
            self.step()
        identifier = self.journal()[1]["pending"]["container_id"]
        self.world.remove_behavior = "success"
        self.memory = {}
        self.world.advance(29)
        self.step(self.new_actor())
        self.assertEqual(len(self.world.removes), 1)
        self.world.advance(1)
        report = self.step(self.new_actor())
        self.assertEqual(report["actuation"]["status"], "removed")
        self.assertEqual([args[-1] for args, _ in self.world.removes], [identifier, identifier])
        self.assertEqual(len(self.world.stops), 1)

    def test_transient_remove_failure_recovers_without_releasing_slot_early(self):
        self.world.remove_behavior = "failed"
        self.assertEqual(self.step()["occupied_with_reservations"], 2)
        self.world.remove_behavior = "success"
        self.world.queues["heavy"] = QueueMetrics(1, 0, 0)
        self.world.advance(29)
        report = self.step(self.new_actor())
        self.assertEqual(report["occupied_with_reservations"], 2)
        self.assertEqual(len(self.world.removes), 1)
        self.world.advance(1)
        report = self.step(self.new_actor())
        self.assertEqual(report["actuation"]["status"], "removed")
        self.assertEqual(report["occupied_with_reservations"], 1)
        self.assertEqual(self.world.queues["heavy"], QueueMetrics(1, 0, 0))

    def test_transient_stop_failure_retries_only_after_work_and_idle_guards(self):
        self.world.stop_behavior = "failed"
        self.step()
        self.world.stop_behavior = "success"
        self.world.queues["heavy"] = QueueMetrics(1, 0, 1)
        self.world.advance(120)
        self.memory = {}
        self.step(self.new_actor())
        self.assertEqual(len(self.world.stops), 1)
        self.world.queues["heavy"] = QueueMetrics(0, 0, 1)
        self.step(self.new_actor())
        self.world.advance(60)
        self.assertEqual(self.step(self.new_actor())["actuation"]["status"], "removed")
        self.assertEqual(len(self.world.stops), 2)

    def test_invalid_pending_victim_id_or_target_never_authorizes_removal(self):
        self.world.stop_behavior = "deferred"
        self.step()
        path, state = self.journal()
        state["pending"]["container_id"] = "a" * 64
        path.write_text(json.dumps(state), encoding="utf-8")
        report = self.step(self.new_actor())
        self.assertEqual(report["actuation"]["status"], "blocked")
        self.assertEqual(self.world.removes, [])

    def test_stricter_pool_maximum_and_global_budget_are_respected_by_scale_out(self):
        self.config = replace(self.config, policy=replace(self.config.policy, max_total=2, pools=(
            replace(self.config.policy.pools[0], maximum=1), self.config.policy.pools[1])))
        self.reset()
        self.world.queues["heavy"] = QueueMetrics(100, 0, 1)
        self.step()
        self.assertEqual(self.world.up_commands, [])
        self.assert_no_removal()

    def test_disappearing_survivor_blocks_removal(self):
        self.world.on_stop = lambda command: self.world.documents.pop(0)
        report = self.step()
        self.assertEqual(report["actuation"]["status"], "uncertain")
        self.assertEqual(self.world.removes, [])

    def test_target_restarting_before_remove_is_not_forced(self):
        def collect(number):
            if number == 4:
                self.world.documents[-1]["State"] = {"Status": "restarting", "Running": False}
        self.world.on_collect = collect
        report = self.step()
        self.assertFalse(report["actuation"]["ready"])
        self.assertEqual(self.world.removes, [])

    def test_consumer_disconnection_must_be_observed_before_removal(self):
        def collect(number):
            if number == 3:
                self.world.queues["heavy"] = QueueMetrics(0, 0, 1)
        self.world.on_collect = collect
        self.step()
        self.assertEqual(self.world.removes, [])
        self.world.queues["heavy"] = QueueMetrics(0, 0, 0)
        self.assertEqual(self.step()["actuation"]["status"], "removed")

    def test_journal_precedes_stop_and_remove_requests(self):
        def stop(command):
            pending = self.journal()[1]["pending"]
            self.assertEqual(pending["phase"], "stop_reserved")
            self.assertEqual(pending["container_id"], command[-1])
        def remove(command):
            pending = self.journal()[1]["pending"]
            self.assertEqual(pending["phase"], "remove_reserved")
            self.assertEqual(pending["container_id"], command[-1])
        self.world.on_stop, self.world.on_remove = stop, remove
        self.step()

    def test_remove_reservation_write_failure_never_sends_rm(self):
        original = self.actor._save
        calls = [0]
        def save(*args):
            calls[0] += 1
            if calls[0] == 3:
                raise OSError("disk full before rm")
            return original(*args)
        with patch.object(self.actor, "_save", side_effect=save):
            self.step()
        self.assertEqual(self.world.removes, [])
        self.assertEqual(self.step(self.new_actor())["actuation"]["status"], "removed")

    def test_stricter_configured_minimum_is_preserved(self):
        self.config = replace(self.config, policy=replace(self.config.policy, pools=(
            self.config.policy.pools[0], replace(self.config.policy.pools[1], minimum=1))))
        self.reset()
        self.step()
        self.assert_no_removal()

    def test_custom_idle_and_cooldown_periods_are_used(self):
        self.config = replace(self.config, policy=replace(
            self.config.policy, scale_in_idle_s=90, scale_in_cooldown_s=45))
        self.reset()
        self.step()
        self.assert_no_removal()
        self.world.advance(30)
        self.assertEqual(self.step()["actuation"]["status"], "removed")

    def test_compose_duration_conversion(self):
        self.assertEqual(stop_seconds("45s"), 45)
        self.assertEqual(stop_seconds("1m15s"), 75)
        self.assertEqual(stop_seconds("45001ms"), 46)
        for value in ("", "0s", "-1s", "nonsense", None):
            with self.subTest(value=value), self.assertRaises(ValueError):
                stop_seconds(value)


if __name__ == "__main__":
    unittest.main()
