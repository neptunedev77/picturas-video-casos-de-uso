"""Single-host, journaled Compose scale-out. No stop/remove/recreate operations."""

from contextlib import contextmanager
from dataclasses import replace
from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import re
import subprocess
import tempfile
import time

if __package__:
    from .policy import PoolMemory
else:
    from policy import PoolMemory


POOLS = {
    "normal": ("video_tool", "video_queue", 1, 2),
    "heavy": ("video_heavy_tool", "video_heavy_queue", 0, 2),
}
SERVICES = {value[0] for value in POOLS.values()}


class SafetyError(Exception):
    """Hold capacity until the problem is reconciled; never guess a free slot."""


@contextmanager
def exclusive_lock(path):
    """OS-owned lock, released on process death. Never unlink its inode."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a+b") as handle:
        if handle.seek(0, os.SEEK_END) == 0:
            handle.write(b"\0")
            handle.flush()
        handle.seek(0)
        try:
            if os.name == "nt":
                import msvcrt
                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as error:
            raise SafetyError("Another actuator holds this project's lock") from error
        try:
            yield
        finally:
            handle.seek(0)
            if os.name == "nt":
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def finite_number(value):
    return type(value) in (int, float) and math.isfinite(value) and value >= 0


def inventory_ids(inventory):
    return {
        service: sorted(c["Id"] for c in inventory
                        if c["Config"]["Labels"]["com.docker.compose.service"] == service)
        for service in SERVICES
    }


class Actuator:
    def __init__(self, config, command_runner=subprocess.run,
                 wall_clock=time.time, monotonic=time.monotonic):
        configured = {p.name: (p.service, p.queue, p.minimum, p.maximum)
                      for p in config.policy.pools}
        if configured != POOLS or config.policy.max_total != 3:
            raise ValueError("Scale-out requires the approved two pools and global budget 3")
        if config.compose_file is None or not config.compose_file.is_file():
            raise ValueError("Scale-out requires an existing explicit compose_file")
        self.config = config
        self._run, self._wall, self._monotonic = command_runner, wall_clock, monotonic
        self.context = self.daemon = None
        root = Path(os.environ.get("LOCALAPPDATA", str(Path.home() / ".local" / "state")))
        self.state_dir = config.state_dir or root / "picturas-autoscaler"

    def _command(self, arguments, timeout):
        # Compose can enable orphan removal through the environment even when
        # --remove-orphans is absent. Shell values must not widen our actions.
        environment = {**os.environ, "COMPOSE_REMOVE_ORPHANS": "0"}
        return self._run(["docker", *arguments], capture_output=True, text=True,
                         encoding="utf-8", check=False, timeout=timeout, env=environment)

    def _read(self, arguments, timeout=None):
        try:
            result = self._command(arguments, timeout or self.config.timeout_s)
        except (OSError, subprocess.SubprocessError) as error:
            raise SafetyError(f"Docker preflight unavailable ({type(error).__name__})") from error
        if result.returncode:
            raise SafetyError("Docker preflight failed; no capacity change authorized")
        return result.stdout.strip()

    def _scope(self, runtime):
        if self.context is None:
            self.context = self._read(["context", "show"])
            if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_.-]*", self.context):
                raise SafetyError("Invalid Docker context")
        daemon = self._read(["--context", self.context, "info", "--format", "{{.ID}}"])
        if not daemon or (self.daemon is not None and daemon != self.daemon):
            raise SafetyError("Docker daemon identity changed or is unavailable")
        self.daemon = daemon
        runtime.docker_context = self.context
        return {"daemon": daemon, "project": self.config.project}

    def _paths(self, scope):
        key = hashlib.sha256(json.dumps(scope, sort_keys=True).encode()).hexdigest()
        return self.state_dir / f"{key}.lock", self.state_dir / f"{key}.json"

    def _load(self, path, scope):
        if not path.exists():
            return {"version": 1, "scope": scope, "cooldowns": {}, "pending": None}
        try:
            state = json.loads(path.read_text(encoding="utf-8"))
            if not isinstance(state, dict):
                raise ValueError("journal object")
            if state["version"] != 1 or state["scope"] != scope:
                raise ValueError("scope/version")
            cooldowns = state["cooldowns"]
            if not isinstance(cooldowns, dict) or any(
                name not in POOLS or not finite_number(value) for name, value in cooldowns.items()
            ):
                raise ValueError("cooldowns")
            pending = state["pending"]
            if pending is not None:
                if not isinstance(pending, dict):
                    raise ValueError("pending object")
                if pending["pool"] not in POOLS or pending["phase"] not in (
                    "reserved", "returned", "uncertain",
                ):
                    raise ValueError("pending operation")
                if not finite_number(pending["requested_at"]):
                    raise ValueError("pending time")
                before = pending["before"]
                if not isinstance(before, dict) or set(before) != SERVICES or any(
                    not isinstance(ids, list) or len(set(ids)) != len(ids) or any(
                        not isinstance(identifier, str) or not re.fullmatch(r"[0-9a-f]{64}", identifier)
                        for identifier in ids
                    ) for ids in before.values()
                ):
                    raise ValueError("container identities")
                service = POOLS[pending["pool"]][0]
                target = pending["target"]
                if type(target) is not int or target != len(before[service]) + 1 or target > 2:
                    raise ValueError("pending target")
                if sum(map(len, before.values())) + 1 > 3:
                    raise ValueError("pending budget")
                if type(pending["consumers_before"]) is not int or pending["consumers_before"] != target - 1:
                    raise ValueError("consumer baseline")
            return state
        except (ValueError, KeyError, TypeError) as error:
            raise SafetyError("Invalid actuator journal; preserve it and reconcile manually") from error

    def _save(self, path, state):
        # The reservation must reach disk before any mutating Docker call.
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent,
                                             prefix=path.name, suffix=".tmp", delete=False) as handle:
                temporary = Path(handle.name)
                json.dump(state, handle, allow_nan=False, sort_keys=True)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary, path)
            if os.name != "nt":
                descriptor = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
                try:
                    os.fsync(descriptor)
                finally:
                    os.close(descriptor)
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)

    def _compose(self, *arguments):
        return ["--context", self.context, "compose", "--project-name", self.config.project,
                "--project-directory", str(self.config.compose_file.parent),
                "--file", str(self.config.compose_file), *arguments]

    def _validate_compose(self):
        try:
            document = json.loads(self._read(self._compose("config", "--format", "json"),
                                             self.config.actuation_timeout_s))
            if document["name"] != self.config.project:
                raise ValueError("project")
            for service, queue, _, _ in POOLS.values():
                spec = document["services"][service]
                volumes = {(v["source"], v["target"]) for v in spec["volumes"]}
                if (spec.get("container_name") or spec.get("ports") or
                        spec["environment"]["VIDEO_QUEUE"] != queue or
                        spec["image"] != "picturas-video_tool" or
                        float(spec["cpus"]) != 2 or int(spec["mem_limit"]) != 3 * 2**30 or
                        set(spec["networks"]) != {"elk"} or
                        volumes != {("image_data", "/app/images"), ("whisper_models", "/models/whisper")} or
                        spec["restart"] != "on-failure" or
                        spec["depends_on"]["rabbitmq"]["condition"] != "service_healthy"):
                    raise ValueError("worker configuration")
        except (ValueError, KeyError, TypeError) as error:
            raise SafetyError("Compose does not match the approved video services") from error

    def _validate_inventory(self, report, inventory):
        if inventory is None or report["status"] != "ok":
            raise SafetyError("A fresh, complete Docker/RabbitMQ observation is required")
        for pool in report["pools"].values():
            counts = pool["replicas"]
            if any(counts[key] for key in ("starting", "stopping", "paused", "stopped")):
                # In particular, Compose must never reconcile an excess stopped
                # container by removing it or restart it outside this reservation.
                raise SafetyError("Existing video containers must be running and stable before scale-out")
        for container in inventory:
            labels = container["Config"]["Labels"]
            directory = labels.get("com.docker.compose.project.working_dir")
            files = labels.get("com.docker.compose.project.config_files", "").split(",")
            if (not directory or Path(directory).resolve() != self.config.compose_file.parent or
                    len(files) != 1 or Path(files[0]).resolve() != self.config.compose_file):
                raise SafetyError("Existing video container belongs to a different Compose configuration")

    def _with_cooldowns(self, memory, state):
        memory = dict(memory)
        wall, now = self._wall(), self._monotonic()
        for pool, attempted in state["cooldowns"].items():
            if wall < attempted:
                raise SafetyError("Wall clock moved backwards; keep capacity on hold")
            elapsed = wall - attempted
            if elapsed < self.config.policy.scale_out_cooldown_s:
                previous = memory.get(pool, PoolMemory())
                memory[pool] = replace(previous, last_scale_out=now - elapsed)
        return memory

    def _reconcile(self, state, report, inventory):
        pending = state["pending"]
        service = POOLS[pending["pool"]][0]
        action = {"status": "pending", "pool": pending["pool"], "target": pending["target"],
                  "ready": False, "reserved_slots": self._reserved_slots(pending, inventory),
                  "container_id": None}
        if report["status"] != "ok" or inventory is None:
            action["status"] = "uncertain"
            return action
        ids = inventory_ids(inventory)
        if any(not set(before).issubset(ids[name]) for name, before in pending["before"].items()):
            action.update(status="uncertain", error="An existing video container disappeared")
            return action
        added = {name: set(ids[name]) - set(pending["before"][name]) for name in SERVICES}
        if len(added[service]) > 1 or any(added[name] for name in SERVICES - {service}):
            action.update(status="uncertain", error="Unexpected concurrent capacity change")
            return action
        if added[service]:
            identifier = next(iter(added[service]))
            container = next(c for c in inventory if c["Id"] == identifier)
            action["container_id"] = identifier
            if container["State"]["Status"] not in ("exited", "dead"):
                action["reserved_slots"] = 0  # Already included in occupied capacity.
            pool = report["pools"][pending["pool"]]
            replicas, metrics = pool["replicas"], pool["metrics"]
            if (container["State"]["Status"] == "running" and
                    replicas["running"] == pending["target"] and
                    not any(replicas[k] for k in ("starting", "stopping", "paused", "stopped")) and
                    metrics["consumers"] == replicas["running"] and
                    metrics["consumers"] == pending["consumers_before"] + 1):
                state["pending"] = None
                action.update(status="ready", ready=True, reserved_slots=0)
                return action
        if (pending["phase"] == "uncertain" or
                self._wall() - pending["requested_at"] >= self.config.readiness_timeout_s):
            action["status"] = "uncertain"
        if "error" in pending:
            action["error"] = pending["error"]
        return action

    @staticmethod
    def _reserved_slots(pending, inventory):
        if inventory is not None:
            ids = inventory_ids(inventory)
            service = POOLS[pending["pool"]][0]
            added = set(ids[service]) - set(pending["before"][service])
            if len(added) == 1 and all(set(before).issubset(ids[name])
                                       for name, before in pending["before"].items()):
                container = next(c for c in inventory if c["Id"] in added)
                if container["State"]["Status"] not in ("exited", "dead"):
                    return 0
        return 1

    @staticmethod
    def _finish(report, action, attempted=0, executed=0):
        report.update(mode="scale-out", actions_attempted=attempted, actions_executed=executed,
                      actuation=action)
        if action["status"] in ("blocked", "uncertain", "failed"):
            report["status"] = "degraded"
        total = report["observed_total"]
        report["occupied_with_reservations"] = None if total is None else total + action.get("reserved_slots", 0)
        return report

    def step(self, runtime, memory, observer):
        """One serialized reconciliation; at most one +1 Compose request."""
        report = {"mode": "scale-out", "status": "degraded", "actions_executed": 0,
                  "timestamp": datetime.now(timezone.utc).isoformat(),
                  "budget": 3, "observed_total": None, "proposed_total": None,
                  "errors": [], "pools": {}}
        state = None
        attempted = executed = 0
        try:
            scope = self._scope(runtime)
            lock_path, journal_path = self._paths(scope)
            with exclusive_lock(lock_path):
                state = self._load(journal_path, scope)
                memory = self._with_cooldowns(memory, state)
                report, next_memory = observer(self.config, runtime, memory)
                if state["pending"] is not None:
                    action = self._reconcile(state, report, runtime.inventory)
                    self._save(journal_path, state)
                    return self._finish(report, action), next_memory
                candidates = [p for p in report["pools"].values()
                              if p["decision"]["intent"] == "scale_out"]
                if report["status"] != "ok" or not candidates:
                    return self._finish(report, {"status": "idle", "ready": False}), next_memory
                pool_name = candidates[0]["decision"]["pool"]
                self._validate_compose()
                # Do not reuse the proposal's updated memory: that would apply
                # its new intention cooldown to the very action being checked.
                report, next_memory = observer(self.config, runtime, memory)
                self._validate_inventory(report, runtime.inventory)
                pool = report["pools"][pool_name]
                decision = pool["decision"]
                if decision["intent"] != "scale_out":
                    return self._finish(report, {"status": "idle", "ready": False,
                                                 "reason": "Decision changed on refresh"}), next_memory
                target = decision["desired"]
                service = POOLS[pool_name][0]
                before = inventory_ids(runtime.inventory)
                if (target != len(before[service]) + 1 or target > 2 or
                        report["observed_total"] + 1 > 3):
                    raise SafetyError("Scale-out target violates actual capacity limits")
                state["pending"] = {"pool": pool_name, "target": target, "before": before,
                                    "consumers_before": pool["metrics"]["consumers"],
                                    "phase": "reserved", "requested_at": self._wall()}
                state["cooldowns"][pool_name] = self._wall()
                self._save(journal_path, state)
                attempted = 1
                try:
                    result = self._command(self._compose(
                        "up", "-d", "--no-deps", "--no-recreate", "--no-build", "--pull", "never",
                        "--scale", f"{service}={target}", service,
                    ), self.config.actuation_timeout_s)
                except FileNotFoundError:
                    # The executable could not be found: no request was sent.
                    state["pending"] = None
                    self._save(journal_path, state)
                    return self._finish(report, {"status": "failed", "ready": False,
                                                 "error": "Could not launch Docker CLI"}, 1), next_memory
                except (OSError, subprocess.SubprocessError) as error:
                    # Other I/O errors may occur after launch. Do not release a
                    # reservation while the outcome of the request is unknown.
                    state["pending"].update(phase="uncertain", error=f"Compose {type(error).__name__}")
                else:
                    executed = int(result.returncode == 0)
                    state["pending"].update(
                        phase="returned" if executed else "uncertain",
                        **({} if executed else {"error": f"Compose exited with code {result.returncode}"}),
                    )
                self._save(journal_path, state)
                report, next_memory = observer(self.config, runtime, next_memory)
                action = self._reconcile(state, report, runtime.inventory)
                self._save(journal_path, state)
                return self._finish(report, action, 1, executed), next_memory
        except (SafetyError, OSError, ValueError) as error:
            report["errors"].append(str(error))
            # Keep the reservation visible even if persisting/reconciling the
            # result failed after Docker had already received the request.
            reserved = self._reserved_slots(state["pending"], runtime.inventory) \
                if state is not None and state["pending"] is not None else 0
            return self._finish(report, {"status": "blocked", "ready": False,
                                         "reserved_slots": reserved}, attempted, executed), memory
