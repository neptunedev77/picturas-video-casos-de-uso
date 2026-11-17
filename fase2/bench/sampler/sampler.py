"""Samples RabbitMQ queues and docker stats every second into two CSV files.

Usage: python sampler.py <out-dir> [--interval 1]
Stops on Ctrl+C / SIGTERM. Only external observation: RabbitMQ management API and docker CLI.
"""
import argparse
import csv
import json
import os
import signal
import subprocess
import threading
import time

import requests

RABBIT = os.environ.get("RABBIT_API", "http://localhost:15672/api")
AUTH = (os.environ.get("RABBIT_USER", "user"), os.environ.get("RABBIT_PASS", "password"))
stop = threading.Event()


def sample_queues(path, interval):
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["t", "queue", "ready", "unacked", "consumers"])
        while not stop.is_set():
            t = time.time()
            try:
                qs = requests.get(f"{RABBIT}/queues", auth=AUTH, timeout=2).json()
                for q in qs:
                    w.writerow([f"{t:.3f}", q["name"], q.get("messages_ready", 0),
                                q.get("messages_unacknowledged", 0), q.get("consumers", 0)])
            except Exception as e:  # broker down during F3 is expected
                w.writerow([f"{t:.3f}", "_error", "", "", str(e)[:80]])
            f.flush()
            stop.wait(max(0, interval - (time.time() - t)))


def sample_docker(path, interval):
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["t", "container", "cpu_pct", "mem_bytes"])
        while not stop.is_set():
            t = time.time()
            out = subprocess.run(
                ["docker", "stats", "--no-stream", "--format", "{{json .}}"],
                capture_output=True, text=True).stdout
            for line in out.splitlines():
                s = json.loads(line)
                w.writerow([f"{t:.3f}", s["Name"], s["CPUPerc"].rstrip("%"),
                            parse_mem(s["MemUsage"].split("/")[0])])
            f.flush()
            stop.wait(max(0, interval - (time.time() - t)))


def parse_mem(v):
    v = v.strip()
    units = {"KiB": 2**10, "MiB": 2**20, "GiB": 2**30, "kB": 1e3, "MB": 1e6, "GB": 1e9, "B": 1}
    for u in sorted(units, key=len, reverse=True):
        if v.endswith(u):
            return int(float(v[: -len(u)]) * units[u])
    return v


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("--interval", type=float, default=1.0)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    signal.signal(signal.SIGTERM, lambda *_: stop.set())
    ts = [threading.Thread(target=sample_queues, args=(f"{a.out}/queues.csv", a.interval)),
          threading.Thread(target=sample_docker, args=(f"{a.out}/docker.csv", a.interval))]
    for t in ts:
        t.start()
    try:
        while not stop.is_set():
            time.sleep(0.5)
    except KeyboardInterrupt:
        stop.set()
    for t in ts:
        t.join()


if __name__ == "__main__":
    main()
