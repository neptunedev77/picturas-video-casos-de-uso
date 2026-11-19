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


if __name__ == "__main__":
    unittest.main()
