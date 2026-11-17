"""Runs one scenario repetition and writes jobs.csv, events.jsonl, chaos.csv, meta.json
(+ queues.csv / docker.csv from the sampler) into the output directory.

Usage: python run.py <scenario> <out-dir> [--timeout 900] [--no-sampler]

Each job: fresh premium user + socket -> create project -> upload -> add tools (setup,
not timed) -> wait for its offset -> POST /process (t_submit). The job ends when
GET /process/url lists one result per input (status=done), when a process-error arrives
(status=error_reported), or at the timeout (status=hung).
"""
import argparse
import csv
import json
import os
import subprocess
import sys
import threading
import time

sys.path.insert(0, os.path.dirname(__file__))
from client import API, Client  # noqa: E402
from scenarios import SCENARIOS  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data", "generated")
lock = threading.Lock()


class Job:
    def __init__(self, spec, events_file, t_zero_ref):
        self.spec = spec
        self.ev = events_file
        self.t_zero = t_zero_ref
        self.r = {"name": spec["name"], "kind": spec["kind"], "at": spec["at"],
                  "n_media": len(spec["media"]), "t_submit": "", "http": "", "t_first_event": "",
                  "t_last_update": "", "t_first_error": "", "t_end": "", "n_updates": 0,
                  "n_errors": 0, "n_results": 0, "status": "setup", "detail": ""}

    def log(self, event, data=None):
        t = time.time()
        if event in ("video-progress", "process-update", "process-error"):
            if not self.r["t_first_event"]:
                self.r["t_first_event"] = t
        if event == "process-update":
            self.r["n_updates"] += 1
            self.r["t_last_update"] = t
        if event == "process-error":
            self.r["n_errors"] += 1
            self.r["t_first_error"] = self.r["t_first_error"] or t
        if event == "video-progress" and data and data.get("percent") not in (0, 100):
            return  # keep the log small: only first/last progress ticks
        with lock:
            self.ev.write(json.dumps({"t": t, "job": self.spec["name"], "event": event,
                                      "data": data}, default=str) + "\n")
            self.ev.flush()

    def setup(self):
        c = self.c = Client(self.log).register().connect_socket()
        pid, v = c.create_project(f"bench-{self.spec['name']}")
        for m in self.spec["media"]:
            v = c.upload(pid, v, os.path.join(DATA, m))
        p = c.get_project(pid)
        v = p["version"]
        vid = next((i["_id"] for i in p["imgs"] if i.get("media_type") == "video"), None)
        for pos, (proc, params) in enumerate(self.spec["tools"]):
            params = {k: (vid if val == "$VID" else val) for k, val in params.items()}
            v = c.add_tool(pid, v, pos, proc, params)
        self.pid, self.version = pid, v
        self.r["status"] = "ready"

    def run(self, timeout):
        time.sleep(max(0, self.t_zero[0] + self.spec["at"] - time.time()))
        self.r["t_submit"] = time.time()
        try:
            resp = self.c.process(self.pid, self.version)
            self.r["http"] = resp.status_code
            if resp.status_code >= 300:
                self.r.update(status="rejected", detail=resp.text[:120], t_end=time.time())
                return
        except Exception as e:  # projects down (F4) counts as a failed submit
            self.r.update(status="submit_failed", detail=str(e)[:120], t_end=time.time())
            return
        deadline = self.r["t_submit"] + timeout
        while time.time() < deadline:
            time.sleep(2)
            try:
                res = self.c.s.get(f"{API}/projects/{self.c.uid}/{self.pid}/process/url", timeout=5)
                if res.status_code == 200:
                    n = len(res.json().get("imgs", []))
                    self.r["n_results"] = n
                    if n >= self.r["n_media"]:
                        self.r.update(status="done", t_end=self.r["t_last_update"] or time.time())
                        return
            except Exception:
                pass
            if self.r["n_errors"]:
                self.r.update(status="error_reported", t_end=self.r["t_first_error"])
                return
        self.r.update(status="hung", detail="no final state before timeout")


def run_chaos(actions, t_zero, out):
    with open(out, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["t", "offset", "cmd", "rc", "output"])
        for at, cmd in actions:
            time.sleep(max(0, t_zero + at - time.time()))
            p = subprocess.run(cmd, shell=True, capture_output=True, text=True)
            w.writerow([f"{time.time():.3f}", at, cmd, p.returncode, (p.stdout + p.stderr).strip()[:200]])
            f.flush()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("scenario", choices=SCENARIOS)
    ap.add_argument("out")
    ap.add_argument("--timeout", type=float, default=900)
    ap.add_argument("--no-sampler", action="store_true")
    a = ap.parse_args()
    sc = SCENARIOS[a.scenario]
    os.makedirs(a.out, exist_ok=True)

    sampler = None
    if not a.no_sampler:
        sampler = subprocess.Popen([sys.executable, os.path.join(HERE, "..", "sampler", "sampler.py"), a.out])

    t_zero = [0.0]
    ev = open(os.path.join(a.out, "events.jsonl"), "w")
    jobs = [Job(s, ev, t_zero) for s in sc["jobs"]]
    print(f"[{a.scenario}] setting up {len(jobs)} jobs...", flush=True)
    ts = [threading.Thread(target=j.setup) for j in jobs]
    for t in ts:
        t.start()
    for t in ts:
        t.join()
    bad = [j.spec["name"] for j in jobs if j.r["status"] != "ready"]
    if bad:
        print(f"setup failed for {bad}", flush=True)

    time.sleep(3)  # let the sampler record a quiet baseline
    t_zero[0] = time.time()
    meta = {"scenario": a.scenario, "t_zero": t_zero[0], "timeout": a.timeout,
            "jobs": len(jobs), "chaos": sc.get("chaos", []), "idle_after": sc.get("idle_after", 0)}
    print(f"[{a.scenario}] t0 — submitting", flush=True)
    ts = [threading.Thread(target=j.run, args=(a.timeout,)) for j in jobs if j.r["status"] == "ready"]
    if sc.get("chaos"):
        ts.append(threading.Thread(target=run_chaos, args=(sc["chaos"], t_zero[0],
                                                             os.path.join(a.out, "chaos.csv"))))
    for t in ts:
        t.start()
    for t in ts:
        t.join()
    if sc.get("idle_after"):
        print(f"[{a.scenario}] idle {sc['idle_after']} s (scale-in window)", flush=True)
        time.sleep(sc["idle_after"])
    meta["t_finish"] = time.time()

    with open(os.path.join(a.out, "jobs.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(jobs[0].r))
        w.writeheader()
        for j in jobs:
            w.writerow(j.r)
    json.dump(meta, open(os.path.join(a.out, "meta.json"), "w"), indent=2)
    for j in jobs:
        try:
            j.c.close()
        except Exception:
            pass
    ev.close()
    if sampler:
        sampler.terminate()
        sampler.wait()
    summary = {}
    for j in jobs:
        summary[j.r["status"]] = summary.get(j.r["status"], 0) + 1
    print(f"[{a.scenario}] finished: {summary}", flush=True)


if __name__ == "__main__":
    main()
