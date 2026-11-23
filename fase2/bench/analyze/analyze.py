"""Computes E-1..E-5 and R-1..R-5 from bench/results/<phase>/ and writes summary.md + summary.json.

Usage: python analyze.py bench/results/baseline
Reports median, p95 and standard deviation over the repetitions.
"""
import csv
import glob
import json
import os
import statistics as st
import sys

ROOT = sys.argv[1]
FINAL = {"done", "error_reported"}


def reps(scn):
    out = []
    for d in sorted(glob.glob(f"{ROOT}/{scn}/rep*")):
        f = f"{d}/jobs.csv"
        if os.path.exists(f):
            rows = list(csv.DictReader(open(f)))
            for r in rows:
                for k in ("t_submit", "t_first_event", "t_end", "at"):
                    r[k] = float(r[k]) if r[k] else None
                for k in ("n_media", "n_updates", "n_errors", "n_results"):
                    r[k] = int(r[k])
            out.append({"dir": d, "jobs": rows, "meta": json.load(open(f"{d}/meta.json"))})
    return out


def p95(xs):
    xs = sorted(xs)
    return xs[min(len(xs) - 1, round(0.95 * (len(xs) - 1)))] if xs else None


def agg(xs):
    xs = [x for x in xs if x is not None]
    if not xs:
        return {"n": 0}
    return {"n": len(xs), "median": round(st.median(xs), 2), "p95": round(p95(xs), 2),
            "stdev": round(st.stdev(xs), 2) if len(xs) > 1 else 0.0,
            "min": round(min(xs), 2), "max": round(max(xs), 2)}


def makespan(rep, pred=lambda j: True):
    js = [j for j in rep["jobs"] if pred(j) and j["t_submit"]]
    if not js or any(j["t_end"] is None for j in js):
        return None
    return max(j["t_end"] for j in js) - min(j["t_submit"] for j in js)


def mem_window(d, t0, t1):
    """Average total memory (MB) of picturas-* containers sampled in [t0, t1]."""
    f = f"{d}/docker.csv"
    if not os.path.exists(f):
        return None
    by_t = {}
    for r in csv.DictReader(open(f)):
        t = float(r["t"])
        if t0 <= t <= t1 and r["container"].startswith("picturas-") and r["mem_bytes"].isdigit():
            by_t.setdefault(r["t"], 0)
            by_t[r["t"]] += int(r["mem_bytes"])
    return st.mean(by_t.values()) / 2**20 if by_t else None


def consumers_series(d, queue):
    f = f"{d}/queues.csv"
    if not os.path.exists(f):
        return []
    return [int(r["consumers"]) for r in csv.DictReader(open(f)) if r["queue"] == queue and r["consumers"].isdigit()]


# Video queues: the normal one (baseline and final) and the heavy one (captioning, final only).
VIDEO_QUEUES = ("video_queue", "video_heavy_queue")


def queue_series(d, queue, t_from=0.0):
    """[(t, ready, unacked, consumers)] of one queue, sampled every second by the sampler."""
    f = f"{d}/queues.csv"
    if not os.path.exists(f):
        return []
    rows = []
    for r in csv.DictReader(open(f)):
        if r["queue"] == queue and r["consumers"].isdigit() and float(r["t"]) >= t_from:
            rows.append((float(r["t"]), int(r["ready"]), int(r["unacked"]), int(r["consumers"])))
    return rows


def scale_out_time(rows):
    """E-3: from the first sample with jobs waiting (ready > 0) to the first sample with
    one more consumer than at that moment. None = no job ever waited, or no new consumer."""
    start = next((i for i, x in enumerate(rows) if x[1] > 0), None)
    if start is None:
        return None
    t0, c0 = rows[start][0], rows[start][3]
    return next((t - t0 for t, _, _, c in rows[start:] if c > c0), None)


def scale_in_times(rows, rest):
    """E-4: from the moment the queue is empty for good (last sample with ready + unacked > 0)
    to (a) the first consumer removed and (b) the queue back at `rest` consumers.
    None = the queue never had work, or the consumers never went down."""
    busy = [i for i, x in enumerate(rows) if x[1] + x[2] > 0]
    if not busy:
        return None, None
    i = busy[-1]
    t_e, c_e = rows[i][0], rows[i][3]
    first = next((t - t_e for t, _, _, c in rows[i:] if c < c_e), None)
    back = next((t - t_e for t, _, _, c in rows[i:] if c <= rest), None) if c_e > rest else None
    return first, back


res = {}
# --- references
for ref in ("REF-trim", "REF-subs", "REF-img10", "REF-mixed", "REF-f4mix"):
    res[ref + " duration (s)"] = agg([makespan(r) for r in reps(ref)])

# --- E-1: wait until first progress of the short cuts in S1
s1 = reps("S1")
res["E-1 S1 wait of cuts (s)"] = agg([j["t_first_event"] - j["t_submit"] for r in s1 for j in r["jobs"]
                                       if j["name"].startswith("cut") and j["t_first_event"]])
res["E-1 S1 total time of cuts (s)"] = agg([j["t_end"] - j["t_submit"] for r in s1 for j in r["jobs"]
                                             if j["name"].startswith("cut") and j["t_end"]])
# --- E-2 / E-5
s2 = reps("S2")
res["E-2 S2 makespan (s)"] = agg([makespan(r) for r in s2])
thr = []
for r in s2:
    m = makespan(r, lambda j: j["kind"] == "image")
    n = sum(1 for j in r["jobs"] if j["kind"] == "image" and j["status"] == "done")
    thr.append(n / (m / 60) if m else None)
res["E-5 S2 image throughput (jobs/min)"] = agg(thr)
res["S2 video wait p95 per rep (s)"] = agg([p95([j["t_first_event"] - j["t_submit"] for j in r["jobs"]
                                                  if j["kind"].startswith("video") and j["t_first_event"]]) for r in s2])
# --- E-3 / E-4
s3 = reps("S3")
res["E-3 S3 max video_queue consumers"] = agg([max(consumers_series(r["dir"], "video_queue") or [0]) for r in s3])
# Scale-out / scale-in times, per video queue, from the sampler's queues.csv (added after the
# baseline: on the baseline data they are n/a because the number of consumers never changes).
for q in VIDEO_QUEUES:
    if not any(queue_series(r["dir"], q) for r in s3 + s1):
        continue  # the heavy queue does not exist in the baseline
    res[f"E-3 S3 max {q} consumers"] = agg([max(consumers_series(r["dir"], q) or [0]) for r in s3])
    for name, runs in (("S1", s1), ("S3", s3)):
        times = [scale_out_time(queue_series(r["dir"], q, r["meta"]["t_zero"])) for r in runs]
        res[f"E-3 {name} {q} scale-out time (s)"] = agg(times)
        res[f"E-3 {name} {q} reps without scale-out"] = sum(1 for x in times if x is None)
    firsts, backs = [], []
    for r in s3:
        rows = queue_series(r["dir"], q, r["meta"]["t_zero"])
        rest = rows[0][3] if rows else 0          # consumers when the scenario started
        first, back = scale_in_times(rows, rest)
        firsts.append(first)
        backs.append(back)
    res[f"E-4 S3 {q} scale-in time, first replica removed (s)"] = agg(firsts)
    res[f"E-4 S3 {q} time back to the starting replicas (s)"] = agg(backs)
    res[f"E-4 S3 {q} reps without scale-in"] = sum(1 for x in firsts if x is None)
idle = [mem_window(d, 0, 1e12) for d in sorted(glob.glob(f"{ROOT}/IDLE/rep*"))]
res["E-4 idle memory, picturas-* (MB)"] = agg(idle)
res["E-4 S3 memory before burst (MB)"] = agg([mem_window(r["dir"], r["meta"]["t_zero"], r["meta"]["t_zero"] + 55) for r in s3])
res["E-4 S3 memory during burst (MB)"] = agg([mem_window(r["dir"], r["meta"]["t_zero"] + 60,
                                                         r["meta"]["t_finish"] - r["meta"]["idle_after"]) for r in s3])
res["E-4 S3 memory after burst, last 60 s (MB)"] = agg([mem_window(r["dir"], r["meta"]["t_finish"] - 60,
                                                                   r["meta"]["t_finish"]) for r in s3])

# --- reliability
ref_for = {"F1": "REF-img10", "F2": "REF-subs", "F3": "REF-mixed", "F4": "REF-f4mix", "F6": "REF-subs"}
for f in ("F1", "F2", "F3", "F4", "F5", "F6"):
    rs = reps(f)
    jobs = [j for r in rs for j in r["jobs"]]
    if not jobs:
        continue
    n = len(jobs)
    res[f"{f} jobs"] = {"n": n, **{s: sum(1 for j in jobs if j["status"] == s)
                                   for s in sorted({j["status"] for j in jobs})}}
    res[f"R-1 {f} % final state"] = round(100 * sum(j["status"] in FINAL for j in jobs) / n, 1)
    if f in ref_for:
        res[f"R-2 {f} % done"] = round(100 * sum(j["status"] == "done" for j in jobs) / n, 1)
        ref = agg([makespan(r) for r in reps(ref_for[f])]).get("median")
        ms = [makespan(r) for r in rs]
        res[f"R-3 {f} delay vs {ref_for[f]} (s)"] = agg([m - ref for m in ms if m is not None and ref]) \
            if ref else "missing reference"
        res[f"R-3 {f} reps that never finished"] = sum(1 for m in ms if m is None)
    res[f"R-5 {f} jobs with duplicate results"] = sum(1 for j in jobs if j["n_results"] > j["n_media"])
for f in ("F5", "F6"):
    jobs = [j for r in reps(f) for j in r["jobs"]]
    if jobs:
        ok = sum(1 for j in jobs if j["status"] == "error_reported" and j["t_end"] - j["t_submit"] <= 10)
        res[f"R-4 {f} % errors reported <= 10 s"] = round(100 * ok / len(jobs), 1)
# R-4 for F6 as the plan defines it ("within the watchdog deadline + 10 s"), added after the
# baseline. Only the image jobs: the 60 s freeze is below the video deadline (120 s), so the
# captioning job is expected to finish, not to fail. Limit 50 s = image deadline (30 s)
# + the watchdog check interval (10 s) + 10 s.
f6_images = [j for r in reps("F6") for j in r["jobs"] if j["kind"] == "image"]
if f6_images:
    ok = sum(1 for j in f6_images if j["status"] == "error_reported" and j["t_end"] - j["t_submit"] <= 50)
    res["R-4 F6 % frozen image jobs reported <= 50 s (watchdog 30 + check 10 + 10)"] = \
        round(100 * ok / len(f6_images), 1)

json.dump(res, open(f"{ROOT}/summary.json", "w"), indent=2)
with open(f"{ROOT}/summary.md", "w") as out:
    out.write(f"# Summary — {os.path.basename(ROOT.rstrip('/'))}\n\n| Metric | Value |\n|---|---|\n")
    for k, v in res.items():
        out.write(f"| {k} | {json.dumps(v) if isinstance(v, dict) else v} |\n")
print(open(f"{ROOT}/summary.md").read())
