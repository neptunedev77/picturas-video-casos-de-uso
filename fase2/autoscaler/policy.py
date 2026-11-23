"""Deterministic capacity intentions. This module performs no external I/O."""

from dataclasses import dataclass, replace
import math
from typing import Mapping


def nonnegative_int(value):
    return type(value) is int and value >= 0


def valid_time(value):
    return type(value) in (int, float) and math.isfinite(value) and value >= 0


@dataclass(frozen=True)
class PoolConfig:
    name: str
    service: str
    queue: str
    minimum: int
    maximum: int


@dataclass(frozen=True)
class PolicyConfig:
    pools: tuple[PoolConfig, ...]
    max_total: int = 3
    scale_out_cooldown_s: float = 5
    scale_in_idle_s: float = 60
    scale_in_cooldown_s: float = 30

    def __post_init__(self):
        if {pool.name for pool in self.pools} != {"normal", "heavy"} or len(self.pools) != 2:
            raise ValueError("Exactly the normal and heavy pools must be configured")
        for pool in self.pools:
            if not all(isinstance(value, str) and value for value in (pool.service, pool.queue)):
                raise ValueError("Pool service and queue must be nonempty strings")
            if not all(nonnegative_int(n) for n in (pool.minimum, pool.maximum)):
                raise ValueError("Replica limits must be nonnegative integers")
            if pool.maximum < pool.minimum:
                raise ValueError("A pool maximum cannot be below its minimum")
        normal = next(pool for pool in self.pools if pool.name == "normal")
        if normal.minimum < 1:
            raise ValueError("At least one normal replica must be reserved")
        if len({pool.service for pool in self.pools}) != 2 or len({pool.queue for pool in self.pools}) != 2:
            raise ValueError("Pools must use distinct services and queues")
        if not nonnegative_int(self.max_total) or self.max_total < sum(p.minimum for p in self.pools):
            raise ValueError("The total budget must cover the pool minima")
        for value in (self.scale_out_cooldown_s, self.scale_in_idle_s, self.scale_in_cooldown_s):
            if not valid_time(value):
                raise ValueError("Policy periods must be finite nonnegative numbers")


@dataclass(frozen=True)
class QueueMetrics:
    ready: int
    unacked: int
    consumers: int

    def valid(self):
        return all(nonnegative_int(n) for n in (self.ready, self.unacked, self.consumers))


@dataclass(frozen=True)
class ReplicaCounts:
    running: int = 0
    starting: int = 0
    stopping: int = 0
    paused: int = 0
    stopped: int = 0

    def valid(self):
        return all(nonnegative_int(n) for n in (
            self.running, self.starting, self.stopping, self.paused, self.stopped,
        ))

    @property
    def occupied(self):
        return self.running + self.starting + self.stopping + self.paused

    @property
    def transitioning(self):
        return bool(self.starting or self.stopping or self.paused)


@dataclass(frozen=True)
class Observation:
    replicas: ReplicaCounts | None
    queue: QueueMetrics | None
    errors: tuple[str, ...] = ()


@dataclass(frozen=True)
class PoolMemory:
    idle_since: float | None = None
    last_scale_out: float | None = None
    last_scale_in: float | None = None
    last_total: int | None = None


@dataclass(frozen=True)
class Decision:
    pool: str
    current: int | None
    desired: int | None
    intent: str
    reason: str


@dataclass(frozen=True)
class Evaluation:
    decisions: tuple[Decision, ...]
    memory: Mapping[str, PoolMemory]
    observed_total: int | None
    proposed_total: int | None
    degraded: bool = False
    errors: tuple[str, ...] = ()


def evaluate(config, observations, memory, now):
    """Plan from actual occupied slots; a scale-in intention never frees a slot."""
    pools = sorted(config.pools, key=lambda pool: (pool.name != "normal", pool.name))
    counts, errors, states = {}, [], {}
    for pool in pools:
        observation = observations.get(pool.name)
        previous = memory.get(pool.name, PoolMemory())
        states[pool.name] = previous
        replicas = observation.replicas if observation else None
        counts[pool.name] = replicas.occupied if isinstance(replicas, ReplicaCounts) and replicas.valid() else None
        if not observation:
            errors.append(f"{pool.name}: missing observation")
            continue
        errors.extend(f"{pool.name}: {error}" for error in observation.errors)
        if counts[pool.name] is None:
            errors.append(f"{pool.name}: replica state unavailable or invalid")
        if not isinstance(observation.queue, QueueMetrics) or not observation.queue.valid():
            errors.append(f"{pool.name}: queue metrics unavailable or invalid")
        if valid_time(now) and any(t is not None and now < t for t in (
            previous.idle_since, previous.last_scale_out, previous.last_scale_in,
        )):
            errors.append(f"{pool.name}: clock moved backwards")
    if not valid_time(now):
        errors.append("Invalid observation time")
    total = sum(counts.values()) if all(n is not None for n in counts.values()) else None
    if total is not None and total > config.max_total:
        errors.append("Observed capacity already exceeds the global budget")
    for pool in pools:
        if counts[pool.name] is not None and counts[pool.name] > pool.maximum:
            errors.append(f"{pool.name}: observed capacity already exceeds the pool maximum")
    if errors:
        return Evaluation(
            tuple(Decision(p.name, counts[p.name], counts[p.name], "hold", "degraded") for p in pools),
            {name: replace(state, idle_since=None, last_total=counts[name]) for name, state in states.items()},
            total, total, True, tuple(dict.fromkeys(errors)),
        )

    decisions, planned_additions, planned_scale_in = [], {}, False
    free_slots = config.max_total - total
    for pool in pools:
        observation = observations[pool.name]
        replicas, queue = observation.replicas, observation.queue
        current, state = counts[pool.name], states[pool.name]
        if state.last_total != current:
            state = replace(state, idle_since=None)
        state = replace(state, last_total=current)
        desired, intent, reason = current, "hold", "stable"
        if replicas.transitioning or queue.consumers != replicas.running:
            reason = "transitioning_or_consumers_not_ready"
            state = replace(state, idle_since=None)
        else:
            idle = queue.ready == 0 and queue.unacked == 0
            state = replace(state, idle_since=(state.idle_since if state.idle_since is not None else now) if idle else None)
            below_minimum = current < pool.minimum
            demand = queue.ready + queue.unacked
            needs_capacity = below_minimum or (queue.ready > 0 and demand > replicas.running)
            if needs_capacity:
                # Reserve unfilled minima, even when another pool is on cooldown.
                reserved = sum(max(0, other.minimum -
                    (observations[other.name].replicas.running + observations[other.name].replicas.starting) -
                    planned_additions.get(other.name, 0)) for other in pools if other.name != pool.name)
                if current >= pool.maximum:
                    reason = "pool_maximum"
                elif state.last_scale_out is not None and now - state.last_scale_out < config.scale_out_cooldown_s:
                    reason = "scale_out_cooldown"
                elif free_slots <= reserved:
                    reason = "global_budget_or_reserved_minimum"
                else:
                    desired, intent = current + 1, "scale_out"
                    reason = "restore_minimum" if below_minimum else "backlog"
                    free_slots -= 1
                    planned_additions[pool.name] = 1
                    state = replace(state, last_scale_out=now)
            elif idle and current > pool.minimum:
                if now - state.idle_since < config.scale_in_idle_s:
                    reason = "idle_window"
                elif state.last_scale_in is not None and now - state.last_scale_in < config.scale_in_cooldown_s:
                    reason = "scale_in_cooldown"
                elif planned_scale_in:
                    reason = "one_scale_in_per_observation"
                else:
                    desired, intent, reason = current - 1, "scale_in", "idle"
                    planned_scale_in = True
                    state = replace(state, last_scale_in=now)
        states[pool.name] = state
        decisions.append(Decision(pool.name, current, desired, intent, reason))
    return Evaluation(tuple(decisions), states, total, sum(d.desired for d in decisions))
