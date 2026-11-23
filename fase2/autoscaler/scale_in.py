"""ID-specific SIGTERM, stopped-state confirmation and non-forced removal."""

from dataclasses import replace
import math
import re
import subprocess


PHASES = {"stop_reserved", "stop_sent", "stop_uncertain",
          "remove_reserved", "remove_sent", "remove_uncertain"}


def stop_seconds(value):
    """Round a positive Compose duration up to Docker stop's integer seconds."""
    if not isinstance(value, str) or not value:
        raise ValueError("Compose must define an explicit stop_grace_period")
    tokens = re.findall(r"(\d+(?:\.\d+)?)(ms|us|ns|h|m|s)", value)
    if "".join(number + unit for number, unit in tokens) != value:
        raise ValueError("Invalid Compose stop_grace_period")
    units = {"h": 3600, "m": 60, "s": 1, "ms": .001, "us": .000001, "ns": .000000001}
    seconds = sum(float(number) * units[unit] for number, unit in tokens)
    if not math.isfinite(seconds) or seconds <= 0:
        raise ValueError("Compose stop_grace_period must be finite and positive")
    return math.ceil(seconds)


def validate_pending(pending, config):
    """The common journal reader has already validated every baseline ID."""
    pool = next(p for p in config.policy.pools if p.name == pending["pool"])
    before = pending["before"][pool.service]
    target = pending["target"]
    if (pending["phase"] not in PHASES or type(target) is not int or
            target != len(before) - 1 or target < pool.minimum or
            len(before) > pool.maximum or
            sum(map(len, pending["before"].values())) > config.policy.max_total or
            pending["container_id"] not in before or
            type(pending["stop_timeout_s"]) is not int or pending["stop_timeout_s"] <= 0 or
            type(pending["consumers_before"]) is not int or
            pending["consumers_before"] != len(before)):
        raise ValueError("Invalid pending scale-in target, grace or phase")
    for name in ("last_stop_at", "last_remove_at"):
        if name in pending and (type(pending[name]) not in (int, float) or
                                not math.isfinite(pending[name]) or pending[name] < 0):
            raise ValueError("Invalid pending scale-in attempt time")


class ScaleIn:
    def __init__(self, actor, observer):
        self.actor, self.observer = actor, observer
        self.attempted = self.executed = 0
        self.operations = set()

    @staticmethod
    def reserved_slots(pending, inventory):
        if inventory is not None:
            for container in inventory:
                if container["Id"] == pending["container_id"]:
                    return int(container["State"]["Status"] in ("exited", "dead"))
        return 1  # Do not release a removed-looking slot until reconciliation.

    def _action(self, state, inventory, status="pending", **extra):
        pending = state["pending"]
        return {"direction": "scale_in", "status": status, "ready": False,
                "pool": pending["pool"], "target": pending["target"],
                "container_id": pending["container_id"],
                "reserved_slots": self.reserved_slots(pending, inventory), **extra}

    def _observe(self, runtime, memory):
        self.latest_report, self.latest_memory = self.observer(self.actor.config, runtime, memory)
        return self.latest_report, self.latest_memory

    def _mutate(self, state, path, operation):
        actor, pending = self.actor, state["pending"]
        pending["phase"] = f"{operation}_reserved"
        pending[f"last_{operation}_at"] = actor._wall()
        state["scale_in_cooldowns"][pending["pool"]] = actor._wall()
        pending.pop("error", None)
        actor._save(path, state)
        identifier = pending["container_id"]
        if operation == "stop":
            arguments = ["stop", "--signal", "SIGTERM", "--timeout",
                         str(pending["stop_timeout_s"]), identifier]
            timeout = max(actor.config.actuation_timeout_s,
                          pending["stop_timeout_s"] + actor.config.timeout_s)
        else:
            arguments = ["rm", identifier]  # Never force, never remove volumes.
            timeout = actor.config.actuation_timeout_s
        self.attempted += 1
        self.operations.add(operation)
        try:
            result = actor._command(["--context", actor.context, *arguments], timeout)
        except (OSError, subprocess.SubprocessError) as error:
            pending.update(phase=f"{operation}_uncertain", error=f"Docker {operation}: {type(error).__name__}")
        else:
            success = result.returncode == 0
            self.executed += int(success)
            pending["phase"] = f"{operation}_sent" if success else f"{operation}_uncertain"
            if not success:
                pending["error"] = f"Docker {operation} exited with code {result.returncode}"
        actor._save(path, state)

    def _retry_due(self, pending, operation):
        if operation in self.operations:
            return False  # A slow/timed-out call must not recurse into another attempt.
        elapsed = self.actor._wall() - pending.get(f"last_{operation}_at", pending["requested_at"])
        delay = self.actor.config.policy.scale_in_cooldown_s
        if operation == "stop":
            delay = max(delay, pending["stop_timeout_s"] + self.actor.config.timeout_s)
        return elapsed >= delay

    def _can_retry_stop(self, report, pending, victim):
        pool = report["pools"][pending["pool"]]
        metrics, replicas, current = pool["metrics"], pool["replicas"], victim["State"]
        return (pending["phase"].startswith("stop_") and self._retry_due(pending, "stop") and
                current["Status"] == "running" and current["Running"] is True and
                not current.get("Paused") and not current.get("Restarting") and
                current.get("Health", {}).get("Status") not in ("starting", "unhealthy") and
                not any(replicas[k] for k in ("starting", "stopping", "paused", "stopped")) and
                replicas["running"] == pending["target"] + 1 and
                metrics["consumers"] == replicas["running"] and
                metrics["ready"] == metrics["unacked"] == 0 and pool["idle_for_s"] is not None and
                pool["idle_for_s"] >= self.actor.config.policy.scale_in_idle_s)

    def _snapshot(self, runtime, report, state):
        """Require the exact survivors, a valid snapshot and the configured minimum."""
        if report["status"] != "ok" or runtime.inventory is None:
            raise ValueError("Scale-in requires fresh Docker and RabbitMQ metrics")
        pending = state["pending"]
        identifier = pending["container_id"]
        expected = {name: set(ids) - {identifier} for name, ids in pending["before"].items()}
        actual = {name: set() for name in expected}
        victim = None
        for container in runtime.inventory:
            service = container["Config"]["Labels"]["com.docker.compose.service"]
            if container["Id"] == identifier:
                victim = container
                continue
            actual[service].add(container["Id"])
            current = container["State"]
            if (current["Status"] != "running" or current["Running"] is not True or
                    current.get("Paused") or current.get("Restarting") or
                    current.get("Health", {}).get("Status") in ("starting", "unhealthy")):
                raise ValueError("A surviving replica is not stable")
        if actual != expected:
            raise ValueError("Unexpected container addition or survivor disappearance during scale-in")
        for pool in self.actor.config.policy.pools:
            if len(actual[pool.service]) < pool.minimum:
                raise ValueError("Scale-in would violate a configured pool minimum")
        return victim

    def _reconcile(self, runtime, report, memory, state, path):
        actor, pending = self.actor, state["pending"]
        if actor.mode != "scale":
            return report, memory, self._action(
                state, runtime.inventory, "blocked", error="Resume scale-in with --mode scale")
        victim = self._snapshot(runtime, report, state)
        if victim is None:
            if not pending["phase"].startswith("remove_"):
                raise ValueError("Scale-in target disappeared before removal was authorized")
            pool = report["pools"][pending["pool"]]
            if pool["replicas"]["running"] != pending["target"] or pool["metrics"]["consumers"] != pending["target"]:
                raise ValueError("Waiting for the surviving capacity and RabbitMQ consumers")
            action = self._action(state, runtime.inventory, "removed", ready=True, reserved_slots=0)
            # Start the real cooldown at completion, including after a restart.
            state["scale_in_cooldowns"][pending["pool"]] = actor._wall()
            previous = memory[pending["pool"]]
            now = actor._monotonic()
            metrics = pool["metrics"]
            memory = {**memory, pending["pool"]: replace(
                previous, idle_since=now if metrics["ready"] == metrics["unacked"] == 0 else None,
                last_scale_in=now, last_total=pending["target"])}
            state["pending"] = None
            actor._save(path, state)
            return report, memory, action
        current = victim["State"]
        if (current["Status"] not in ("exited", "dead") or current["Running"] is not False or
                current.get("Paused") or current.get("Restarting")):
            if self._can_retry_stop(report, pending, victim):
                report, memory = self._observe(runtime, memory)
                victim = self._snapshot(runtime, report, state)
                if victim is not None and self._can_retry_stop(report, pending, victim):
                    # Resume the same operation/ID, never a new reduction. A fresh
                    # idle window and the previous stop deadline must have elapsed.
                    self._mutate(state, path, "stop")
                    report, memory = self._observe(runtime, memory)
                    return self._reconcile(runtime, report, memory, state, path)
            return report, memory, self._action(state, runtime.inventory,
                "uncertain" if pending["phase"].endswith("uncertain") else "pending")
        if pending["phase"].startswith("remove_") and not self._retry_due(pending, "remove"):
            return report, memory, self._action(state, runtime.inventory, "uncertain",
                error="Removal not confirmed; retain the slot until a guarded retry is due")
        pool = report["pools"][pending["pool"]]
        metrics = pool["metrics"]
        if metrics["consumers"] != pending["target"]:
            return report, memory, self._action(state, runtime.inventory,
                error="Waiting for the disconnected target consumer")
        # Reobserve immediately before rm as well as before SIGTERM. A late job
        # belongs to ReliableConsumer's existing drain/requeue, not a new protocol.
        report, memory = self._observe(runtime, memory)
        victim = self._snapshot(runtime, report, state)
        pool = report["pools"][pending["pool"]]
        metrics = pool["metrics"]
        if (victim is None or victim["State"]["Status"] not in ("exited", "dead") or
                victim["State"]["Running"] is not False or victim["State"].get("Paused") or
                victim["State"].get("Restarting") or
                metrics["consumers"] != pending["target"]):
            return report, memory, self._action(state, runtime.inventory,
                error="Removal cancelled by the final observation")
        # Removal of a confirmed stopped ID does not reduce live processing
        # capacity. Late jobs stay on RabbitMQ/the survivors; completing cleanup
        # unlocks scale-out, especially when this was the last heavy replica.
        self._mutate(state, path, "remove")
        report, memory = self._observe(runtime, memory)
        return self._reconcile(runtime, report, memory, state, path)

    def _run(self, runtime, report, memory, state, path, prepare=None):
        self.latest_report, self.latest_memory = report, memory
        try:
            if prepare is not None:
                prepare()
                self._mutate(state, path, "stop")
                report, memory = self._observe(runtime, memory)
            report, memory, action = self._reconcile(runtime, report, memory, state, path)
        except (OSError, ValueError) as error:
            report, memory = self.latest_report, self.latest_memory
            action = self._action(state, runtime.inventory, "uncertain", error=str(error)) \
                if state["pending"] is not None else {"status": "blocked", "ready": False, "error": str(error)}
        report = self.actor._finish(report, action, self.attempted, self.executed)
        if runtime.inventory is None:
            # Cached counts may already include the victim. Without a fresh
            # inventory we cannot safely add its retained slot to those counts.
            report["occupied_with_reservations"] = None
        return report, memory

    def start(self, runtime, report, memory, state, path, compose, pool_name):
        actor = self.actor
        def prepare():
            pool = next(p for p in actor.config.policy.pools if p.name == pool_name)
            details = report["pools"][pool_name]
            metrics, decision = details["metrics"], details["decision"]
            ids = {p.service: sorted(c["Id"] for c in runtime.inventory
                    if c["Config"]["Labels"]["com.docker.compose.service"] == p.service)
                   for p in actor.config.policy.pools}
            if (decision["intent"] != "scale_in" or metrics["ready"] or metrics["unacked"] or
                    decision["desired"] != len(ids[pool.service]) - 1 or
                    decision["desired"] < pool.minimum or details["idle_for_s"] is None or
                    details["idle_for_s"] < actor.config.policy.scale_in_idle_s):
                raise ValueError("Scale-in is no longer safe")
            spec = compose["services"][pool.service]
            if spec.get("stop_signal", "SIGTERM") not in ("SIGTERM", "15"):
                raise ValueError("The worker stop signal must remain SIGTERM")
            grace = stop_seconds(spec.get("stop_grace_period"))
            worker_grace = float(spec.get("environment", {}).get("WORKER_SHUTDOWN_GRACE_S", "8"))
            if not math.isfinite(worker_grace) or worker_grace <= 0 or grace < worker_grace:
                raise ValueError("Docker grace must cover the worker's internal grace")
            state["pending"] = {"direction": "scale_in", "pool": pool_name,
                "target": decision["desired"], "before": ids, "container_id": ids[pool.service][-1],
                "consumers_before": metrics["consumers"], "stop_timeout_s": grace,
                "phase": "stop_reserved", "requested_at": actor._wall()}
            state.setdefault("scale_in_cooldowns", {})[pool_name] = actor._wall()
        return self._run(runtime, report, memory, state, path, prepare)

    def resume(self, runtime, report, memory, state, path):
        return self._run(runtime, report, memory, state, path)
