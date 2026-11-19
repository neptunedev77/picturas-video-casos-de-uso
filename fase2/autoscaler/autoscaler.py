"""Observe the video pools and print intentions; no Docker actions are implemented."""

import argparse
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import time
from urllib.parse import urlsplit

if __package__:
    from .policy import PolicyConfig, PoolConfig, QueueMetrics, ReplicaCounts, evaluate
    from .runtime import Runtime
else:
    from policy import PolicyConfig, PoolConfig, QueueMetrics, ReplicaCounts, evaluate
    from runtime import Runtime


@dataclass(frozen=True)
class Config:
    mode: str
    project: str
    rabbit_api: str
    rabbit_vhost: str
    timeout_s: float
    interval_s: float
    policy: PolicyConfig


def load_config(path):
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    policy_data = dict(data["policy"])
    policy_data["pools"] = tuple(PoolConfig(**pool) for pool in policy_data["pools"])
    config = Config(**{**data, "policy": PolicyConfig(**policy_data)})
    if config.mode != "observe":
        raise ValueError("Only observe mode is implemented")
    if not isinstance(config.project, str) or not config.project:
        raise ValueError("The Compose project name is required")
    if not isinstance(config.rabbit_vhost, str) or not config.rabbit_vhost:
        raise ValueError("The RabbitMQ vhost is required")
    for period in (config.interval_s, config.timeout_s):
        if type(period) not in (int, float) or not 0 < period < float("inf"):
            raise ValueError("Observation interval and timeout must be finite positive numbers")
    url = urlsplit(config.rabbit_api)
    if url.scheme not in ("http", "https") or not url.netloc or url.username or url.password:
        raise ValueError("Use an HTTP(S) RabbitMQ API URL without embedded credentials")
    return config


def observe(config, runtime, memory, now=None):
    observations = runtime.collect()
    if now is None:
        now = time.monotonic()
    result = evaluate(config.policy, observations, memory, now)
    report = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "mode": "observe",
        "actions_executed": 0,
        "status": "degraded" if result.degraded else "ok",
        "budget": config.policy.max_total,
        "observed_total": result.observed_total,
        "proposed_total": result.proposed_total,
        "errors": list(result.errors),
        "pools": {},
    }
    for decision in result.decisions:
        observation = observations.get(decision.pool)
        state = result.memory[decision.pool]
        report["pools"][decision.pool] = {
            "metrics": asdict(observation.queue) if observation and
                isinstance(observation.queue, QueueMetrics) and observation.queue.valid() else None,
            "replicas": asdict(observation.replicas) if observation and
                isinstance(observation.replicas, ReplicaCounts) and observation.replicas.valid() else None,
            "idle_for_s": round(now - state.idle_since, 3) if state.idle_since is not None else None,
            "decision": asdict(decision),
        }
    return report, result.memory


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=Path(__file__).with_name("config.json"))
    parser.add_argument("--mode", choices=("observe",), default="observe")
    parser.add_argument("--once", action="store_true", help="print one observation and exit")
    args = parser.parse_args(argv)
    try:
        config = load_config(args.config)
    except (OSError, ValueError, KeyError, TypeError) as error:
        parser.error(str(error))
    runtime = Runtime(config, os.getenv("RABBIT_USER", "user"), os.getenv("RABBIT_PASS"))
    memory = {}
    try:
        while True:
            started = time.monotonic()
            report, memory = observe(config, runtime, memory)
            print(json.dumps(report, allow_nan=False), flush=True)
            if args.once:
                return 1 if report["status"] == "degraded" else 0
            time.sleep(max(0, config.interval_s - (time.monotonic() - started)))
    except KeyboardInterrupt:
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
