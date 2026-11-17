"""Functional regression suite of phase 2, run against the live stack through the public API.

  python regression.py --capture   # on the base: run every case twice, store golden.json
  python regression.py             # after a change: run every case, compare with golden.json

Every image tool, every video effect, a mixed project and a few behaviours (preview,
upload rejections, share link) are covered. Outputs are compared by SHA-256; a case whose
output was not byte-identical between the two capture runs is compared by its metadata
instead (dimensions, duration, frame count, streams), and the report says so.
Exit code 0 = everything matches the golden outputs.
"""
import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "bench", "loadgen"))
from client import API, Client  # noqa: E402

GEN = os.path.join(ROOT, "bench", "data", "generated")
SAMPLES = os.path.join(ROOT, "picturas-27", "samples", "video")
TOOLS = os.path.join(ROOT, "picturas-27", "Tools")
GOLDEN = os.path.join(HERE, "golden", "golden.json")
FILES = os.path.join(HERE, "golden", "files")

IMG = os.path.join(GEN, "img_01.png")
PHOTO = os.path.join(TOOLS, "people_ai", "image.png")
TEXT = os.path.join(TOOLS, "text_ai", "easy_test.png")
VID = os.path.join(GEN, "short_10s_720p.mp4")
SPEECH = os.path.join(GEN, "speech_60s_720p.mp4")


def c(name, media, tools, user="premium"):
    return {"name": name, "kind": "process", "media": media, "tools": tools, "user": user}


CASES = [
    # one case per image tool
    c("img-binarization", [IMG], [("binarization", {"threshold": 128})]),
    c("img-border", [IMG], [("border", {"borderWidth": 20, "r": 255, "g": 0, "b": 0})]),
    c("img-brightness", [IMG], [("brightness", {"brightness": 1.3})]),
    c("img-contrast", [IMG], [("contrast", {"contrastFactor": 1.4})]),
    c("img-cut", [IMG], [("cut", {"left": 100, "top": 50, "right": 900, "bottom": 600})]),
    c("img-resize", [IMG], [("resize", {"width": 640, "height": 360})]),
    c("img-rotate", [IMG], [("rotate", {"degrees": 90})]),
    c("img-saturation", [IMG], [("saturation", {"saturationFactor": 1.5})]),
    c("img-watermark", [IMG], [("watermark", {})]),
    c("img-bg_remove_ai", [PHOTO], [("bg_remove_ai", {})]),
    c("img-cut_ai", [PHOTO], [("cut_ai", {})]),
    c("img-upgrade_ai", [PHOTO], [("upgrade_ai", {})]),
    c("img-obj_ai", [PHOTO], [("obj_ai", {})]),
    c("img-people_ai", [PHOTO], [("people_ai", {})]),
    c("img-text_ai", [TEXT], [("text_ai", {})]),
    c("img-expand_ai", [IMG], [("expand_ai", {"percent": 20, "mode": "reflect",
                                               "top": 0, "right": 0, "bottom": 0, "left": 0})]),
    # pipelines
    c("img-pipeline-3-filters-3-images", [IMG, os.path.join(GEN, "img_02.png"), os.path.join(GEN, "img_03.png")],
      [("brightness", {"brightness": 1.3}), ("contrast", {"contrastFactor": 1.4}),
       ("saturation", {"saturationFactor": 1.5})]),
    # video
    c("vid-trim", [VID], [("trim", {"start": 1, "end": 4, "imgId": "$VID"})]),
    c("vid-speed", [VID], [("speed", {"factor": 2, "imgId": "$VID"})]),
    c("vid-filters", [VID], [("brightness", {"brightness": 1.3}), ("contrast", {"contrastFactor": 1.4}),
                             ("saturation", {"saturationFactor": 1.5}), ("binarization", {"threshold": 128})]),
    c("vid-geometry", [VID], [("rotate", {"degrees": 90}), ("resize", {"width": 640, "height": 360}),
                              ("cut", {"left": 100, "top": 50, "right": 900, "bottom": 600}),
                              ("border", {"borderWidth": 20, "r": 0, "g": 0, "b": 255})]),
    c("vid-trim-speed-filter", [VID], [("trim", {"start": 2, "end": 8, "imgId": "$VID"}),
                                       ("speed", {"factor": 0.5, "imgId": "$VID"}),
                                       ("brightness", {"brightness": 0.8})]),
    c("vid-subtitles", [SPEECH], [("subtitles", {})]),
    c("vid-extract_frames", [VID], [("extract_frames", {"mode": "count", "count": 5, "interval": 1,
                                                        "format": "png"})]),
    c("mixed-image-and-video", [IMG, VID], [("brightness", {"brightness": 1.3}),
                                            ("trim", {"start": 1, "end": 4, "imgId": "$VID"})]),
    # behaviours
    {"name": "preview-image", "kind": "preview", "media": [IMG], "tools": [("rotate", {"degrees": 90})]},
    {"name": "upload-free-too-long", "kind": "upload", "user": "free",
     "media": [os.path.join(SAMPLES, "too_long_90s.mp4")]},
    {"name": "upload-corrupted", "kind": "upload", "user": "premium",
     "media": [os.path.join(SAMPLES, "corrupted.mp4")]},
    {"name": "upload-anonymous-video", "kind": "upload", "user": "anonymous", "media": [VID]},
    {"name": "share-link-read", "kind": "share", "media": [IMG]},
]


def sha(data):
    return hashlib.sha256(data).hexdigest()


def probe(data, name):
    """Metadata used when bytes are not reproducible."""
    with tempfile.NamedTemporaryFile(suffix=os.path.splitext(name)[1] or ".bin") as f:
        f.write(data)
        f.flush()
        out = subprocess.run(["ffprobe", "-v", "error", "-count_frames", "-show_entries",
                              "stream=codec_type,codec_name,width,height,nb_read_frames:format=duration",
                              "-of", "json", f.name], capture_output=True, text=True).stdout
    try:
        j = json.loads(out)
    except json.JSONDecodeError:
        return {"size": len(data)}
    dur = j.get("format", {}).get("duration")
    return {"streams": [{k: s.get(k) for k in ("codec_type", "codec_name", "width", "height", "nb_read_frames")}
                        for s in j.get("streams", [])],
            "duration": round(float(dur), 1) if dur else None}


def new_client(kind):
    cl = Client(lambda *a, **k: None)
    if kind == "anonymous":
        r = cl.s.post(f"{API}/users/", json={"type": "anonymous"})
        r.raise_for_status()
        d = r.json()
        cl.uid, cl.token = d["user"]["_id"], d["jwt"]
        cl.s.headers["Authorization"] = f"Bearer {cl.token}"
        return cl
    return cl.register(kind)


def setup(cl, case):
    pid, v = cl.create_project(case["name"])
    for m in case["media"]:
        v = cl.upload(pid, v, m)
    p = cl.get_project(pid)
    v = p["version"]
    vid = next((i["_id"] for i in p["imgs"] if i.get("media_type") == "video"), None)
    for pos, (proc, params) in enumerate(case.get("tools", [])):
        params = {k: (vid if val == "$VID" else val) for k, val in params.items()}
        v = cl.add_tool(pid, v, pos, proc, params)
    return pid, v, p


def run_process(case, timeout):
    cl = new_client(case.get("user", "premium"))
    pid, v, _ = setup(cl, case)
    r = cl.process(pid, v)
    if r.status_code >= 300:
        return {"error": f"process HTTP {r.status_code}: {r.text[:100]}"}
    deadline = time.time() + timeout
    while time.time() < deadline:
        time.sleep(1.5)
        res = cl.s.get(f"{API}/projects/{cl.uid}/{pid}/process/url").json()
        items = res.get("imgs", []) + res.get("texts", [])
        if items:
            outs = []
            for it in items:
                data = cl.s.get(it["url"]).content
                outs.append({"name": it["name"], "type": it.get("type", "text"), "data": data})
            return {"outputs": sorted(outs, key=lambda o: o["name"])}
    return {"error": "no result before timeout"}


def run_preview(case, timeout):
    events = []
    cl = Client(lambda ev, **k: events.append((ev, k.get("data")))).register().connect_socket()
    try:
        pid, v, p = setup(cl, case)
        img = p["imgs"][0]["_id"]
        r = cl.s.post(f"{API}/projects/{cl.uid}/{pid}/preview/{img}", headers={"X-Project-Version": str(v)})
        deadline = time.time() + timeout
        while time.time() < deadline and not any(e[0] in ("preview-ready", "preview-error") for e in events):
            time.sleep(0.5)
        kinds = sorted({e[0] for e in events if e[0].startswith("preview")})
        return {"behaviour": {"http": r.status_code, "events": kinds}}
    finally:
        cl.close()


def run_upload(case, _timeout):
    cl = new_client(case["user"])
    pid, v = cl.create_project(case["name"])
    m = case["media"][0]
    with open(m, "rb") as f:
        r = cl.s.post(f"{API}/projects/{cl.uid}/{pid}/video", files={"video": (os.path.basename(m), f)},
                      headers={"X-Project-Version": str(v)})
    return {"behaviour": {"http": r.status_code, "accepted": r.status_code < 300}}


def run_share(case, _timeout):
    cl = new_client("premium")
    pid, v, _ = setup(cl, case)
    r = cl.s.post(f"{API}/projects/{cl.uid}/{pid}/share", json={"permission": "read"},
                  headers={"X-Project-Version": str(v)})
    body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
    sid = body.get("id") or body.get("shareId") or (body.get("link") or {}).get("id")
    g = cl.s.get(f"{API}/projects/share/{sid}") if sid else None
    return {"behaviour": {"create_http": r.status_code, "resolve_http": g.status_code if g else None}}


RUNNERS = {"process": run_process, "preview": run_preview, "upload": run_upload, "share": run_share}


def summarize(result):
    if "outputs" in result:
        return {"outputs": [{"name": re.sub(r"[0-9a-f]{24}", "<id>", o["name"]), "type": o["type"], "sha256": sha(o["data"]),
                             "meta": probe(o["data"], o["name"])} for o in result["outputs"]]}
    return result


def run_case(case, timeout):
    t = time.time()
    try:
        r = RUNNERS[case["kind"]](case, timeout)
    except Exception as e:  # a crash in setup is a regression too
        r = {"error": f"{type(e).__name__}: {e}"[:200]}
    r["seconds"] = round(time.time() - t, 1)
    return r


def capture(cases, timeout):
    golden = {}
    os.makedirs(FILES, exist_ok=True)
    for case in cases:
        a, b = run_case(case, timeout), run_case(case, timeout)
        sa, sb = summarize(a), summarize(b)
        if "error" in sa or "error" in sb:
            print(f"  !! {case['name']}: {sa.get('error') or sb.get('error')}")
            golden[case["name"]] = {"error": sa.get("error") or sb.get("error")}
            continue
        entry = dict(sa)
        if "outputs" in sa:
            same = [o["sha256"] for o in sa["outputs"]] == [o["sha256"] for o in sb["outputs"]]
            entry["compare"] = "sha256" if same else "meta"
            for o in a["outputs"]:
                if not o["type"].startswith("video") and len(o["data"]) < 2_000_000:
                    with open(os.path.join(FILES, f"{case['name']}__{o['name']}"), "wb") as f:
                        f.write(o["data"])
        else:
            entry["compare"] = "behaviour" if sa == sb else "behaviour-unstable"
        golden[case["name"]] = entry
        print(f"  {case['name']:34} {entry['compare']:10} {a['seconds']:6.1f}s")
    os.makedirs(os.path.dirname(GOLDEN), exist_ok=True)
    json.dump(golden, open(GOLDEN, "w"), indent=1)
    print(f"golden written: {GOLDEN}")


def strip(e):
    return {k: v for k, v in e.items() if k not in ("seconds", "compare")}


def check(cases, timeout):
    golden = json.load(open(GOLDEN))
    failed = 0
    for case in cases:
        g = golden.get(case["name"])
        r = summarize(run_case(case, timeout))
        if g is None:
            verdict = "NEW"
        elif "error" in g:
            verdict = "SKIP (failed on the base)"
        elif "error" in r:
            verdict, failed = f"FAIL {r['error']}", failed + 1
        elif g["compare"] == "sha256":
            ok = [o["sha256"] for o in r["outputs"]] == [o["sha256"] for o in g["outputs"]]
            verdict = "ok" if ok else "FAIL output differs"
        elif g["compare"] == "meta":
            ok = [(o["name"], o["meta"]) for o in r["outputs"]] == [(o["name"], o["meta"]) for o in g["outputs"]]
            verdict = "ok (metadata)" if ok else "FAIL metadata differs"
        else:
            ok = strip(r) == strip(g)
            verdict = "ok" if ok else f"FAIL {strip(r)} != {strip(g)}"
        if verdict.startswith("FAIL") and "error" not in r:
            failed += 1
        print(f"  {case['name']:34} {verdict}")
    print(f"{len(cases) - failed}/{len(cases)} passed")
    return failed == 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--capture", action="store_true", help="store golden outputs (base only)")
    ap.add_argument("--only", nargs="*", help="run only these case names")
    ap.add_argument("--timeout", type=float, default=300)
    a = ap.parse_args()
    cases = [x for x in CASES if not a.only or x["name"] in a.only]
    if a.capture:
        capture(cases, a.timeout)
    else:
        sys.exit(0 if check(cases, a.timeout) else 1)


if __name__ == "__main__":
    main()
