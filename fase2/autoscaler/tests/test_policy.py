from dataclasses import replace
import itertools
import unittest

from fase2.autoscaler.policy import (
    Observation, PolicyConfig, PoolConfig, PoolMemory, QueueMetrics, ReplicaCounts, evaluate,
)


CONFIG = PolicyConfig((
    PoolConfig("normal", "video_tool", "video_queue", 1, 2),
    PoolConfig("heavy", "video_heavy_tool", "video_heavy_queue", 0, 2),
))


def snapshot(normal=1, heavy=1, normal_ready=0, heavy_ready=0,
             normal_unacked=0, heavy_unacked=0):
    return {
        "normal": Observation(ReplicaCounts(running=normal), QueueMetrics(normal_ready, normal_unacked, normal)),
        "heavy": Observation(ReplicaCounts(running=heavy), QueueMetrics(heavy_ready, heavy_unacked, heavy)),
    }


def idle_memory(normal=1, heavy=1, since=0):
    return {
        "normal": PoolMemory(idle_since=since, last_total=normal),
        "heavy": PoolMemory(idle_since=since, last_total=heavy),
    }


def decisions(result):
    return {decision.pool: decision for decision in result.decisions}


class PolicyTests(unittest.TestCase):
    def test_missing_normal_replica_is_restored_before_optional_capacity(self):
        result = evaluate(CONFIG, snapshot(normal=0, heavy=2, heavy_ready=10), {}, 0)
        self.assertEqual(decisions(result)["normal"].desired, 1)
        self.assertEqual(decisions(result)["normal"].reason, "restore_minimum")
        self.assertEqual(result.proposed_total, 3)

    def test_idle_heavy_pool_can_stay_at_zero(self):
        result = evaluate(CONFIG, snapshot(heavy=0), {}, 0)
        self.assertEqual(decisions(result)["heavy"].desired, 0)
        self.assertEqual(decisions(result)["heavy"].intent, "hold")

    def test_backlog_starts_a_zero_replica_heavy_pool(self):
        result = evaluate(CONFIG, snapshot(heavy=0, heavy_ready=1), {}, 0)
        self.assertEqual(decisions(result)["heavy"].desired, 1)
        self.assertEqual(decisions(result)["heavy"].intent, "scale_out")

    def test_backlog_adds_only_one_replica(self):
        result = evaluate(CONFIG, snapshot(heavy_ready=100, heavy_unacked=1), {}, 0)
        self.assertEqual(decisions(result)["heavy"].desired, 2)
        self.assertEqual(result.proposed_total, 3)

    def test_a_free_worker_can_handle_one_ready_message_without_scaling(self):
        result = evaluate(CONFIG, snapshot(heavy_ready=1), {}, 0)
        self.assertEqual(decisions(result)["heavy"].intent, "hold")

    def test_pool_maximum_blocks_further_scale_out(self):
        result = evaluate(CONFIG, snapshot(normal=2, heavy=0, normal_ready=100), {}, 0)
        self.assertEqual(decisions(result)["normal"].desired, 2)
        self.assertEqual(decisions(result)["normal"].reason, "pool_maximum")

    def test_global_budget_blocks_scale_out(self):
        result = evaluate(CONFIG, snapshot(heavy=2, normal_ready=10), {}, 0)
        self.assertEqual(decisions(result)["normal"].desired, 1)
        self.assertEqual(result.proposed_total, 3)

    def test_normal_minimum_remains_reserved_during_its_cooldown(self):
        # A wider heavy maximum proves reservation independently of its initial max=2.
        config = replace(CONFIG, pools=(CONFIG.pools[0], replace(CONFIG.pools[1], maximum=3)))
        memory = {"normal": PoolMemory(last_scale_out=0)}
        result = evaluate(config, snapshot(normal=0, heavy=2, heavy_ready=10), memory, 1)
        self.assertEqual(decisions(result)["normal"].reason, "scale_out_cooldown")
        self.assertEqual(decisions(result)["heavy"].desired, 2)
        self.assertEqual(decisions(result)["heavy"].reason, "global_budget_or_reserved_minimum")

    def test_scale_out_cooldown_includes_an_intention_at_time_zero(self):
        observations = snapshot(heavy_ready=2, heavy_unacked=1)
        first = evaluate(CONFIG, observations, {}, 0)
        blocked = evaluate(CONFIG, observations, first.memory, 4)
        allowed = evaluate(CONFIG, observations, blocked.memory, 5)
        self.assertEqual(decisions(blocked)["heavy"].reason, "scale_out_cooldown")
        self.assertEqual(decisions(allowed)["heavy"].intent, "scale_out")

    def test_scale_in_requires_sixty_seconds_of_observed_idle(self):
        observations = snapshot()
        first = evaluate(CONFIG, observations, {}, 0)
        early = evaluate(CONFIG, observations, first.memory, 59)
        ready = evaluate(CONFIG, observations, early.memory, 60)
        self.assertEqual(decisions(early)["heavy"].desired, 1)
        self.assertEqual(decisions(ready)["heavy"].desired, 0)
        self.assertEqual(decisions(ready)["heavy"].intent, "scale_in")

    def test_scale_in_removes_only_one_from_a_two_replica_pool(self):
        result = evaluate(CONFIG, snapshot(heavy=2), idle_memory(heavy=2), 60)
        self.assertEqual(decisions(result)["heavy"].desired, 1)

    def test_no_more_than_one_scale_in_is_proposed_per_observation(self):
        result = evaluate(CONFIG, snapshot(normal=2), idle_memory(normal=2), 60)
        self.assertEqual(sum(d.intent == "scale_in" for d in result.decisions), 1)
        self.assertEqual(result.observed_total - result.proposed_total, 1)

    def test_normal_never_scales_in_below_one(self):
        result = evaluate(CONFIG, snapshot(heavy=0), idle_memory(heavy=0), 100)
        self.assertEqual(decisions(result)["normal"].desired, 1)
        self.assertEqual(decisions(result)["normal"].intent, "hold")

    def test_scale_in_respects_thirty_second_cooldown(self):
        memory = idle_memory(heavy=2)
        memory["heavy"] = replace(memory["heavy"], last_scale_in=50)
        blocked = evaluate(CONFIG, snapshot(heavy=2), memory, 60)
        allowed = evaluate(CONFIG, snapshot(heavy=2), blocked.memory, 80)
        self.assertEqual(decisions(blocked)["heavy"].reason, "scale_in_cooldown")
        self.assertEqual(decisions(allowed)["heavy"].desired, 1)

    def test_ready_or_unacked_work_resets_the_idle_clock(self):
        for ready, unacked in ((1, 0), (0, 1)):
            with self.subTest(ready=ready, unacked=unacked):
                busy = evaluate(CONFIG, snapshot(heavy_ready=ready, heavy_unacked=unacked), idle_memory(), 30)
                empty = evaluate(CONFIG, snapshot(), busy.memory, 60)
                early = evaluate(CONFIG, snapshot(), empty.memory, 119)
                self.assertIsNone(busy.memory["heavy"].idle_since)
                self.assertEqual(decisions(early)["heavy"].intent, "hold")

    def test_capacity_changes_restart_the_idle_window(self):
        result = evaluate(CONFIG, snapshot(heavy=2), idle_memory(heavy=1), 100)
        self.assertEqual(decisions(result)["heavy"].intent, "hold")
        self.assertEqual(result.memory["heavy"].idle_since, 100)

    def test_invalid_or_missing_metrics_hold_both_pools_and_clear_idle_time(self):
        for queue in (None, QueueMetrics(-1, 0, 1), QueueMetrics(True, 0, 1),
                      QueueMetrics("0", 0, 1), QueueMetrics(0, float("nan"), 1)):
            with self.subTest(queue=queue):
                observations = snapshot(normal_ready=100)
                observations["heavy"] = Observation(ReplicaCounts(running=1), queue)
                result = evaluate(CONFIG, observations, idle_memory(), 100)
                self.assertTrue(result.degraded)
                self.assertTrue(all(d.intent == "hold" and d.desired == d.current for d in result.decisions))
                self.assertTrue(all(s.idle_since is None for s in result.memory.values()))

    def test_unknown_docker_capacity_is_not_zero(self):
        observations = snapshot(normal_ready=100)
        observations["heavy"] = Observation(None, QueueMetrics(0, 0, 0), ("docker unavailable",))
        result = evaluate(CONFIG, observations, {}, 0)
        self.assertTrue(result.degraded)
        self.assertIsNone(result.observed_total)
        self.assertIsNone(decisions(result)["heavy"].desired)
        self.assertEqual(decisions(result)["normal"].intent, "hold")

    def test_invalid_replica_counts_are_not_zero_or_available_capacity(self):
        for value in (-1, "1", True, float("nan")):
            with self.subTest(value=value):
                observations = snapshot(normal_ready=100)
                observations["heavy"] = replace(observations["heavy"], replicas=ReplicaCounts(running=value))
                result = evaluate(CONFIG, observations, {}, 0)
                self.assertTrue(result.degraded)
                self.assertIsNone(result.observed_total)
                self.assertTrue(all(d.intent == "hold" for d in result.decisions))

    def test_stale_docker_counts_are_for_reporting_only(self):
        observations = snapshot(heavy_ready=100)
        observations["heavy"] = replace(observations["heavy"], errors=("docker unavailable",))
        result = evaluate(CONFIG, observations, {}, 0)
        self.assertTrue(result.degraded)
        self.assertEqual(decisions(result)["heavy"].desired, 1)

    def test_starting_stopping_and_paused_replicas_occupy_budget(self):
        for state in ("starting", "stopping", "paused"):
            with self.subTest(state=state):
                observations = snapshot(normal_ready=100)
                observations["heavy"] = replace(observations["heavy"], replicas=ReplicaCounts(running=1, **{state: 1}))
                result = evaluate(CONFIG, observations, {}, 0)
                self.assertEqual(result.observed_total, 3)
                self.assertEqual(decisions(result)["normal"].desired, 1)
                self.assertEqual(decisions(result)["heavy"].intent, "hold")

    def test_scale_in_intention_does_not_free_real_budget(self):
        result = evaluate(CONFIG, snapshot(heavy=2, normal_ready=100), idle_memory(heavy=2), 60)
        self.assertEqual(decisions(result)["heavy"].intent, "scale_in")
        self.assertEqual(decisions(result)["normal"].intent, "hold")

    def test_a_missing_consumer_prevents_scale_in_and_duplicate_startup(self):
        observations = snapshot(heavy_ready=100)
        observations["heavy"] = replace(observations["heavy"], queue=QueueMetrics(100, 0, 0))
        result = evaluate(CONFIG, observations, idle_memory(), 100)
        self.assertEqual(decisions(result)["heavy"].intent, "hold")
        self.assertIsNone(result.memory["heavy"].idle_since)

    def test_preexisting_excess_capacity_is_reported_without_fabricating_a_reduction(self):
        result = evaluate(CONFIG, snapshot(normal=2, heavy=2), {}, 0)
        self.assertTrue(result.degraded)
        self.assertEqual(result.observed_total, 4)
        self.assertTrue(all(d.intent == "hold" for d in result.decisions))

    def test_unknown_observation_or_invalid_time_is_degraded(self):
        self.assertTrue(evaluate(CONFIG, {}, {}, 0).degraded)
        self.assertTrue(evaluate(CONFIG, snapshot(), {}, float("nan")).degraded)
        self.assertTrue(evaluate(CONFIG, snapshot(), idle_memory(since=10), 9).degraded)

    def test_decisions_are_deterministic_and_do_not_mutate_inputs(self):
        observations, memory = snapshot(heavy_ready=100), idle_memory()
        before = dict(memory)
        self.assertEqual(evaluate(CONFIG, observations, memory, 0), evaluate(CONFIG, observations, memory, 0))
        self.assertEqual(memory, before)

    def test_limits_hold_across_valid_load_and_capacity_combinations(self):
        for normal, heavy, normal_ready, heavy_ready in itertools.product(range(3), range(3), (0, 1, 100), (0, 1, 100)):
            if normal + heavy > 3:
                continue
            with self.subTest(normal=normal, heavy=heavy, normal_ready=normal_ready, heavy_ready=heavy_ready):
                observations = snapshot(normal, heavy, normal_ready, heavy_ready, normal, heavy)
                result = evaluate(CONFIG, observations, idle_memory(normal, heavy), 60)
                proposed = decisions(result)
                self.assertFalse(result.degraded)
                self.assertLessEqual(result.proposed_total, 3)
                self.assertGreaterEqual(proposed["normal"].desired, 1)
                for decision in result.decisions:
                    self.assertLessEqual(decision.desired, 2)
                    self.assertLessEqual(abs(decision.desired - decision.current), 1)


if __name__ == "__main__":
    unittest.main()
