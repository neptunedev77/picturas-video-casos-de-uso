# Regression suite — functional preservation (phase 2)

Proves that the refactoring did not change what PictuRAS produces. It runs against the live
stack through the public API, like a user would.

```bash
fase2/tests/run-all.sh                                  # everything: unit tests + this suite
fase2/bench/.venv/bin/python fase2/tests/regression/regression.py            # only this suite
fase2/bench/.venv/bin/python fase2/tests/regression/regression.py --only vid-trim img-rotate
```

Needs the stack running and the bench venv (`fase2/bench/README.md`, "Reproduce").

## What is covered (30 cases)

- Every image tool, one case each (binarization, border, brightness, contrast, cut, resize,
  rotate, saturation, watermark, bg_remove_ai, cut_ai, upgrade_ai, obj_ai, people_ai, text_ai,
  expand_ai) and a 3-image × 3-filter pipeline.
- Video: trim, speed, colour filters, geometry, trim+speed+filter, subtitles, frame extraction,
  and a mixed image+video project.
- Behaviours: image preview (`preview-ready` event), upload rejections (free user > 60 s,
  corrupted file, anonymous user with video) and a read share link.

## Golden outputs

`golden/golden.json` was captured on the base (commit `a2c0772`, tag `baseline`) by running
every case twice. Outputs are compared by SHA-256; `img-watermark` was not byte-identical
between the two runs, so it is compared by metadata (dimensions, streams). `golden/files/`
keeps the image and text outputs for visual inspection.

**Platform.** The golden outputs were captured on the reference machine (Ubuntu, x86-64).
On another CPU architecture, e.g. a Mac with Apple Silicon (arm64), ffmpeg encodes and the AI
models produce slightly different bytes, so the video cases, the mixed project and
`bg_remove_ai`, `upgrade_ai` and `obj_ai` fail even on the untouched base (19/30 on arm64).
There, compare a branch with `main` run on the same machine: the same cases must pass. Only a
run on the reference machine can show 30/30. The suite also needs `ffprobe` on the host.

**Never re-capture the golden outputs after a change** (`--capture` is only for the base):
a failing case means the change altered a result, which must be fixed or justified.
