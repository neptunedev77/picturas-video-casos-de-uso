"""Read-only RabbitMQ management API and Docker CLI observations."""

import base64
from dataclasses import replace
import json
import re
import subprocess
from urllib.parse import quote
from urllib.request import Request, urlopen

if __package__:
    from .policy import Observation, QueueMetrics, ReplicaCounts
else:
    from policy import Observation, QueueMetrics, ReplicaCounts


class ReadError(Exception):
    """A complete, valid observation could not be obtained."""


def parse_queues(payload, pools, vhost):
    if not isinstance(payload, list):
        raise ReadError("RabbitMQ queue response is not a list")
    result = {}
    for pool in pools:
        matches = [q for q in payload if isinstance(q, dict) and
                   q.get("name") == pool.queue and q.get("vhost") == vhost]
        if len(matches) != 1:
            raise ReadError(f"Expected one {pool.queue} in vhost {vhost}")
        queue = matches[0]
        try:
            metrics = QueueMetrics(queue["messages_ready"], queue["messages_unacknowledged"], queue["consumers"])
        except KeyError as error:
            raise ReadError(f"Missing metric {error.args[0]} on {pool.queue}") from error
        if not metrics.valid() or queue.get("state", "running") != "running":
            raise ReadError(f"Invalid metrics or unavailable queue: {pool.queue}")
        result[pool.name] = metrics
    return result


def parse_containers(payload, project, pools):
    if not isinstance(payload, list):
        raise ReadError("Docker inspect response is not a list")
    by_service = {pool.service: pool.name for pool in pools}
    counts = {pool.name: ReplicaCounts() for pool in pools}
    seen = set()
    for container in payload:
        if not isinstance(container, dict):
            raise ReadError("Malformed Docker container")
        try:
            identifier = container["Id"]
            labels = container["Config"]["Labels"]
            state = container["State"]
        except (KeyError, TypeError) as error:
            raise ReadError("Incomplete Docker container state") from error
        if not isinstance(identifier, str) or identifier in seen or not isinstance(labels, dict):
            raise ReadError("Invalid or duplicate Docker container identity")
        seen.add(identifier)
        name = by_service.get(labels.get("com.docker.compose.service"))
        if labels.get("com.docker.compose.project") != project or name is None:
            continue
        if str(labels.get("com.docker.compose.oneoff", "false")).lower() == "true":
            continue
        if not isinstance(state, dict):
            raise ReadError("Invalid Docker state")
        if type(state.get("Running")) is not bool:
            raise ReadError("Missing or invalid Docker running flag")
        status = state.get("Status")
        health = state.get("Health", {})
        if not isinstance(health, dict):
            raise ReadError("Invalid Docker health state")
        if status == "running" and state.get("Paused") is True:
            field = "paused"
        elif status == "running":
            if state.get("Running") is not True:
                raise ReadError("Inconsistent Docker running state")
            if health.get("Status") == "unhealthy":
                raise ReadError("Unhealthy video container")
            field = "starting" if health.get("Status") == "starting" else "running"
        elif status in ("created", "restarting"):
            field = "starting"
        elif status in ("stopping", "removing"):
            field = "stopping"
        elif status == "paused":
            field = "paused"
        elif status in ("exited", "dead"):
            if state["Running"]:
                raise ReadError("Inconsistent Docker stopped state")
            field = "stopped"
        else:
            raise ReadError(f"Unknown Docker state: {status}")
        counts[name] = replace(counts[name], **{field: getattr(counts[name], field) + 1})
    return counts


def fetch_json(url, headers, timeout):
    request = Request(url, headers=headers, method="GET")
    with urlopen(request, timeout=timeout) as response:
        return json.load(response)


class Runtime:
    def __init__(self, config, username="user", password=None,
                 command_runner=subprocess.run, http_get=fetch_json):
        self.config = config
        self.username, self.password = username, password
        self._run, self._http_get = command_runner, http_get
        self._last_replicas = None

    def _docker(self, arguments):
        # This adapter exposes only the two read operations needed by this block.
        if not arguments or arguments[0] not in ("ps", "inspect"):
            raise ReadError("Only Docker ps and inspect are allowed")
        try:
            result = self._run(
                ["docker", *arguments], capture_output=True, text=True,
                encoding="utf-8", timeout=self.config.timeout_s, check=False,
            )
        except (OSError, subprocess.SubprocessError) as error:
            raise ReadError(f"Docker {arguments[0]} failed: {error}") from error
        if result.returncode != 0:
            raise ReadError(f"Docker {arguments[0]} failed: {result.stderr.strip()}")
        return result.stdout

    def read_replicas(self):
        identifiers, services = [], {}
        for pool in self.config.policy.pools:
            output = self._docker([
                "ps", "--all", "--quiet", "--no-trunc",
                "--filter", f"label=com.docker.compose.project={self.config.project}",
                "--filter", f"label=com.docker.compose.service={pool.service}",
            ])
            for identifier in output.splitlines():
                if not re.fullmatch(r"[0-9a-f]{64}", identifier):
                    raise ReadError("Invalid Docker container ID")
                identifiers.append(identifier)
                services[identifier] = pool.service
        if len(set(identifiers)) != len(identifiers):
            raise ReadError("Duplicate containers returned for distinct pools")
        if not identifiers:
            return {pool.name: ReplicaCounts() for pool in self.config.policy.pools}
        try:
            payload = json.loads(self._docker(["inspect", *identifiers]))
        except (ValueError, TypeError) as error:
            raise ReadError("Invalid Docker inspect JSON") from error
        if not isinstance(payload, list) or any(not isinstance(c, dict) for c in payload):
            raise ReadError("Invalid Docker inspect response")
        if any(not isinstance(c.get("Id"), str) for c in payload):
            raise ReadError("Invalid Docker inspect container ID")
        if len(payload) != len(identifiers) or {c.get("Id") for c in payload} != set(identifiers):
            raise ReadError("Docker inspect returned an incomplete container snapshot")
        for container in payload:
            container_config = container.get("Config")
            if not isinstance(container_config, dict):
                raise ReadError("Invalid Docker inspect configuration")
            labels = container_config.get("Labels")
            if not isinstance(labels, dict) or labels.get("com.docker.compose.project") != self.config.project \
                    or labels.get("com.docker.compose.service") != services[container["Id"]]:
                raise ReadError("Docker inspect labels do not match the requested pools")
        return parse_containers(payload, self.config.project, self.config.policy.pools)

    def read_queues(self):
        if not self.password:
            raise ReadError("RABBIT_PASS is not set")
        token = base64.b64encode(f"{self.username}:{self.password}".encode()).decode("ascii")
        url = f"{self.config.rabbit_api.rstrip('/')}/queues/{quote(self.config.rabbit_vhost, safe='')}"
        try:
            payload = self._http_get(url, {"Authorization": f"Basic {token}"}, self.config.timeout_s)
            return parse_queues(payload, self.config.policy.pools, self.config.rabbit_vhost)
        except (OSError, ValueError, TypeError) as error:
            raise ReadError(f"RabbitMQ read failed: {error}") from error

    def collect(self):
        errors, queues = [], {}
        try:
            queues = self.read_queues()
        except ReadError as error:
            errors.append(f"rabbitmq: {error}")
        try:
            replicas = self.read_replicas()
            self._last_replicas = replicas
        except ReadError as error:
            errors.append(f"docker: {error}")
            replicas = self._last_replicas or {}
        return {
            pool.name: Observation(replicas.get(pool.name), queues.get(pool.name), tuple(errors))
            for pool in self.config.policy.pools
        }
