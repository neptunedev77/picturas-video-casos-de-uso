"""Load and fault scenarios of the phase 2 plan (S1-S3, F1-F6, solo references).

A job is one project of one fresh premium user. `at` is the submit offset (s) from the
scenario start; `media` are files in bench/data/generated; tools use "$VID" for the
per-video imgId. `chaos` lists (offset_s, shell command) run in parallel with the load.
"""

IMG_FILTERS = [("brightness", {"brightness": 1.3}),
               ("contrast", {"contrastFactor": 1.4}),
               ("saturation", {"saturationFactor": 1.5})]
SUBS = [("subtitles", {})]
TRIM = [("trim", {"start": 1, "end": 4, "imgId": "$VID"})]
SPEED = [("speed", {"factor": 2, "imgId": "$VID"})]
SPEECH = "speech_60s_720p.mp4"
SHORT = "short_10s_720p.mp4"
IMGS10 = [f"img_{i:02d}.png" for i in range(1, 11)]


# Faults target every container of a service (all replicas), matched by name, so the same
# scenario keeps its meaning after the elasticity work adds replicas or a heavy video pool.
# In the baseline each service has one container, so this is the same as naming it.
VIDEO = "^picturas-video"                      # video_tool and any other video pool
CONTRAST = "^picturas-contrast_tool-[0-9]+$"
BRIGHTNESS = "^picturas-brightness_tool-[0-9]+$"
PROJECTS = "^picturas-projects-[0-9]+$"


def _each(pattern, action, status):
    return (f"docker ps -aq --filter 'name={pattern}' --filter status={status}"
            f" | xargs -r docker {action}")


def kill(p): return _each(p, "kill", "running") + " ; " + _each(p, "kill", "paused")
def pause(p): return _each(p, "pause", "running")
def unpause(p): return _each(p, "unpause", "paused")
def start(p): return _each(p, "start", "exited")


def job(name, kind, at, media, tools):
    return {"name": name, "kind": kind, "at": at, "media": media, "tools": tools}


def burst(t0=0.0):
    """S2 mix: 2 captions, 6 short video edits and 20 image projects spread over 30 s."""
    jobs = [job(f"subs{i}", "video_subs", t0 + i * 15, [SPEECH], SUBS) for i in range(2)]
    jobs += [job(f"edit{i}", "video_short", t0 + 2 + i * 4.5, [SHORT], TRIM if i % 2 == 0 else SPEED)
             for i in range(6)]
    jobs += [job(f"img{i:02d}", "image", t0 + i * 1.5, [IMGS10[i % 10]], IMG_FILTERS) for i in range(20)]
    return jobs


def mixed():
    """Mixed batch used by F3/F4: one 5-image project and two short video edits."""
    return [job("imgbatch", "image", 0, IMGS10[:5], IMG_FILTERS),
            job("edit0", "video_short", 0.5, [SHORT], TRIM),
            job("edit1", "video_short", 1.0, [SHORT], SPEED)]


def f4mix():
    """F4 batch: submitted together so every run is still in flight when projects freezes."""
    return [job("imgbatch", "image", 0, IMGS10, IMG_FILTERS),
            job("edit0", "video_short", 0.05, [SHORT], TRIM),
            job("edit1", "video_short", 0.1, [SHORT], SPEED)]


SCENARIOS = {
    # references without load (targets of E-1 and R-3)
    "REF-trim": {"jobs": [job("trim", "video_short", 0, [SHORT], TRIM)]},
    "REF-subs": {"jobs": [job("subs", "video_subs", 0, [SPEECH], SUBS)]},
    "REF-img10": {"jobs": [job("imgbatch", "image", 0, IMGS10, IMG_FILTERS)]},
    "REF-mixed": {"jobs": mixed()},
    "REF-f4mix": {"jobs": f4mix()},
    # elasticity
    "S1": {"jobs": [job("subs", "video_subs", 0, [SPEECH], SUBS)]
                   + [job(f"cut{i}", "video_short", 5, [SHORT], TRIM) for i in range(3)]},
    "S2": {"jobs": burst()},
    "S3": {"jobs": burst(t0=60), "idle_after": 180},
    # reliability (fault injection at fixed instants)
    # The image pipeline finishes in < 1 s, so a kill "midway" would race with it. Freezing
    # the tool first makes sure it holds messages when it is killed (deterministic).
    "F1": {"jobs": [job("imgbatch", "image", 2.0, IMGS10, IMG_FILTERS)],
           "chaos": [(0.5, pause(CONTRAST)),
                     (4.0, kill(CONTRAST)),
                     (6.0, start(CONTRAST))]},
    "F2": {"jobs": [job("subs", "video_subs", 0, [SPEECH], SUBS)],
           "chaos": [(15.0, kill(VIDEO)),
                     (25.0, start(VIDEO))]},
    "F3": {"jobs": mixed(),
           "chaos": [(1.0, "docker restart picturas-rabbitmq-1")]},
    # Same idea: projects is frozen while the runs are in flight, then killed and restarted.
    "F4": {"jobs": f4mix(),
           "chaos": [(0.3, pause(PROJECTS)),
                     (4.0, kill(PROJECTS)),
                     (6.0, start(PROJECTS))]},
    "F5": {"jobs": [job("badimg", "image", 0, [IMGS10[0]], [("resize", {"width": 0, "height": 0})]),
                    job("badvid", "video_short", 0.5, [SHORT], [("trim", {"start": 8, "end": 4, "imgId": "$VID"})])]},
    "F6": {"jobs": [job("subs", "video_subs", 0, [SPEECH], SUBS),
                    job("imgbatch", "image", 3.0, IMGS10[:5], IMG_FILTERS)],
           "chaos": [(2.0, pause(VIDEO) + " ; " + pause(BRIGHTNESS)),
                     (62.0, unpause(VIDEO) + " ; " + unpause(BRIGHTNESS))]},
}
