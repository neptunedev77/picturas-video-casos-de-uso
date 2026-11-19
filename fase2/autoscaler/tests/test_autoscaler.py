from contextlib import redirect_stderr, redirect_stdout
from dataclasses import replace
import io
import json
from pathlib import Path
import unittest
from unittest.mock import Mock, patch

from fase2.autoscaler import autoscaler
from fase2.autoscaler.policy import Observation, QueueMetrics, ReplicaCounts


CONFIG_PATH = Path(__file__).resolve().parents[1] / "config.json"


def observations(heavy_ready=0):
    return {
        "normal": Observation(ReplicaCounts(running=1), QueueMetrics(0, 0, 1)),
        "heavy": Observation(ReplicaCounts(running=1), QueueMetrics(heavy_ready, 0, 1)),
    }


class ObserverTests(unittest.TestCase):
    def test_default_configuration_matches_the_requested_policy(self):
        config = autoscaler.load_config(CONFIG_PATH)
        self.assertEqual((config.mode, config.project, config.interval_s), ("observe", "picturas", 1))
        self.assertEqual(config.policy.max_total, 3)
        self.assertEqual((config.policy.scale_out_cooldown_s, config.policy.scale_in_idle_s,
                          config.policy.scale_in_cooldown_s), (5, 60, 30))
        self.assertEqual([(p.name, p.service, p.queue, p.minimum, p.maximum) for p in config.policy.pools], [
            ("normal", "video_tool", "video_queue", 1, 2),
            ("heavy", "video_heavy_tool", "video_heavy_queue", 0, 2),
        ])

    def test_configuration_rejects_unsafe_or_invalid_values(self):
        original = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        variants = []
        for key, value in (("mode", "apply"), ("interval_s", 0), ("timeout_s", -1),
                           ("interval_s", float("nan")), ("project", ""),
                           ("rabbit_api", "ftp://localhost/api")):
            data = json.loads(json.dumps(original))
            data[key] = value
            variants.append(data)
        for key, value in (("minimum", 0), ("maximum", 0), ("maximum", True)):
            data = json.loads(json.dumps(original))
            data["policy"]["pools"][0][key] = value
            variants.append(data)
        data = json.loads(json.dumps(original))
        data["policy"]["max_total"] = 0
        variants.append(data)
        for data in variants:
            with self.subTest(data=data), patch.object(Path, "read_text", return_value=json.dumps(data)):
                with self.assertRaises((ValueError, TypeError)):
                    autoscaler.load_config(CONFIG_PATH)

    def test_once_prints_one_observation_and_performs_no_actions(self):
        runtime = Mock(spec=["collect"])
        runtime.collect.return_value = observations(heavy_ready=2)
        output = io.StringIO()
        with patch.object(autoscaler, "Runtime", return_value=runtime), \
                patch.object(autoscaler.time, "sleep") as sleep, redirect_stdout(output):
            result = autoscaler.main(["--once"])
        report = json.loads(output.getvalue())
        self.assertEqual(result, 0)
        self.assertEqual((report["mode"], report["actions_executed"]), ("observe", 0))
        self.assertEqual(report["pools"]["heavy"]["decision"]["desired"], 2)
        runtime.collect.assert_called_once()
        sleep.assert_not_called()

    def test_default_loop_is_observe_and_can_be_interrupted(self):
        runtime = Mock(spec=["collect"])
        runtime.collect.side_effect = [observations(), KeyboardInterrupt()]
        output = io.StringIO()
        with patch.object(autoscaler, "Runtime", return_value=runtime), \
                patch.object(autoscaler.time, "monotonic", return_value=100), \
                patch.object(autoscaler.time, "sleep") as sleep, redirect_stdout(output):
            self.assertEqual(autoscaler.main([]), 0)
        self.assertEqual(json.loads(output.getvalue())["actions_executed"], 0)
        sleep.assert_called_once_with(1)

    def test_unknown_capacity_is_logged_as_degraded_not_zero(self):
        runtime = Mock(spec=["collect"])
        runtime.collect.return_value = {name: replace(obs, replicas=None, errors=("docker failed",))
                                       for name, obs in observations().items()}
        output = io.StringIO()
        with patch.object(autoscaler, "Runtime", return_value=runtime), redirect_stdout(output):
            self.assertEqual(autoscaler.main(["--once"]), 1)
        report = json.loads(output.getvalue())
        self.assertEqual(report["status"], "degraded")
        self.assertIsNone(report["observed_total"])
        self.assertIsNone(report["pools"]["heavy"]["decision"]["desired"])

    def test_dry_run_never_counts_proposed_replicas_as_real_capacity(self):
        config = autoscaler.load_config(CONFIG_PATH)
        runtime = Mock(spec=["collect"])
        runtime.collect.return_value = observations(heavy_ready=100)
        first, memory = autoscaler.observe(config, runtime, {}, 0)
        second, _ = autoscaler.observe(config, runtime, memory, 5)
        self.assertEqual(first["observed_total"], 2)
        self.assertEqual(second["observed_total"], 2)
        self.assertEqual(first["pools"]["heavy"]["decision"]["desired"], 2)
        self.assertEqual(second["pools"]["heavy"]["decision"]["desired"], 2)

    def test_idle_time_starts_after_metric_collection(self):
        config = autoscaler.load_config(CONFIG_PATH)
        runtime = Mock(spec=["collect"])
        clock = [0]
        def collect():
            clock[0] = 10
            return observations()
        runtime.collect.side_effect = collect
        with patch.object(autoscaler.time, "monotonic", side_effect=lambda: clock[0]):
            report, memory = autoscaler.observe(config, runtime, {})
        self.assertEqual(memory["heavy"].idle_since, 10)
        self.assertEqual(report["pools"]["heavy"]["idle_for_s"], 0)

    def test_invalid_metrics_are_reported_as_degraded_without_invalid_json(self):
        config = autoscaler.load_config(CONFIG_PATH)
        runtime = Mock(spec=["collect"])
        samples = observations()
        samples["heavy"] = replace(samples["heavy"], queue=QueueMetrics(float("nan"), 0, 1))
        runtime.collect.return_value = samples
        report, _ = autoscaler.observe(config, runtime, {}, 0)
        self.assertEqual(report["status"], "degraded")
        self.assertIsNone(report["pools"]["heavy"]["metrics"])
        json.dumps(report, allow_nan=False)

    def test_unimplemented_modes_are_rejected_before_reading_the_stack(self):
        with patch.object(autoscaler, "Runtime") as runtime, redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit) as error:
                autoscaler.main(["--mode", "apply", "--once"])
        self.assertEqual(error.exception.code, 2)
        runtime.assert_not_called()

    def test_observe_never_constructs_an_actuator_or_writes_state(self):
        runtime = Mock(spec=["collect"])
        runtime.collect.return_value = observations(heavy_ready=10)
        with patch.object(autoscaler, "Runtime", return_value=runtime), \
                patch("fase2.autoscaler.actuator.Actuator") as actuator, redirect_stdout(io.StringIO()):
            self.assertEqual(autoscaler.main(["--mode", "observe", "--once"]), 0)
        actuator.assert_not_called()

    def test_scale_out_requires_cli_opt_in_and_uses_the_separate_actuator(self):
        runtime = Mock()
        report = {"mode": "scale-out", "status": "ok", "actions_executed": 1,
                  "actuation": {"status": "ready", "ready": True}}
        output = io.StringIO()
        with patch.object(autoscaler, "Runtime", return_value=runtime), \
                patch("fase2.autoscaler.actuator.Actuator") as actuator, redirect_stdout(output):
            actuator.return_value.step.return_value = (report, {})
            self.assertEqual(autoscaler.main(["--mode", "scale-out", "--once"]), 0)
        actuator.return_value.step.assert_called_once()
        self.assertEqual(json.loads(output.getvalue())["mode"], "scale-out")

    def test_active_degraded_once_returns_nonzero(self):
        with patch.object(autoscaler, "Runtime"), \
                patch("fase2.autoscaler.actuator.Actuator") as actuator, redirect_stdout(io.StringIO()):
            actuator.return_value.step.return_value = ({"status": "degraded"}, {})
            self.assertEqual(autoscaler.main(["--mode", "scale-out", "--once"]), 1)

    def test_scale_mode_requires_explicit_cli_opt_in(self):
        with patch.object(autoscaler, "Runtime"), \
                patch("fase2.autoscaler.actuator.Actuator") as actuator, redirect_stdout(io.StringIO()):
            actuator.return_value.step.return_value = ({"status": "ok", "mode": "scale"}, {})
            self.assertEqual(autoscaler.main(["--mode", "scale", "--once"]), 0)
        self.assertEqual(actuator.call_args.kwargs["mode"], "scale")

    def test_scale_out_cli_keeps_the_exclusive_mode(self):
        with patch.object(autoscaler, "Runtime"), \
                patch("fase2.autoscaler.actuator.Actuator") as actuator, redirect_stdout(io.StringIO()):
            actuator.return_value.step.return_value = ({"status": "ok", "mode": "scale-out"}, {})
            self.assertEqual(autoscaler.main(["--mode", "scale-out", "--once"]), 0)
        self.assertEqual(actuator.call_args.kwargs["mode"], "scale-out")

    def test_configuration_cannot_enable_bidirectional_scaling(self):
        data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        data["mode"] = "scale"
        with patch.object(Path, "read_text", return_value=json.dumps(data)), self.assertRaises(ValueError):
            autoscaler.load_config(CONFIG_PATH)

    def test_configuration_cannot_silently_enable_actuation(self):
        data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        data["mode"] = "scale-out"
        with patch.object(Path, "read_text", return_value=json.dumps(data)), self.assertRaises(ValueError):
            autoscaler.load_config(CONFIG_PATH)

    def test_compose_path_is_resolved_against_the_config_file(self):
        config = autoscaler.load_config(CONFIG_PATH)
        self.assertEqual(config.compose_file, CONFIG_PATH.parents[1] / "picturas-27" / "docker-compose.yaml")

    def test_invalid_actuation_timeouts_are_rejected(self):
        data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        for name, value in (("actuation_timeout_s", 0), ("readiness_timeout_s", float("nan")),
                            ("readiness_timeout_s", True), ("compose_file", ""), ("state_dir", 3)):
            with self.subTest(name=name):
                variant = {**data, name: value}
                with patch.object(Path, "read_text", return_value=json.dumps(variant)), self.assertRaises(ValueError):
                    autoscaler.load_config(CONFIG_PATH)


if __name__ == "__main__":
    unittest.main()
