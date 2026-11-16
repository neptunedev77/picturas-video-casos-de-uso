"""UC-VID-005: key-frame masks with interpolation, time limit and FFmpeg cleanup.
Needs OpenCV, NumPy and FFmpeg (run inside the service image, from /app):
    python -m unittest discover -s tests -v
"""
import os
import subprocess
import sys
import tempfile
import time
import types
import unittest
from unittest.mock import MagicMock, patch

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# No AI model and no RabbitMQ: the fake mask is the frame's own grey level.
fake_rembg = types.ModuleType("rembg")
fake_rembg.calls = []
def fake_remove(rgb, session=None, only_mask=True, post_process_mask=True):
    fake_rembg.calls.append(int(rgb[0, 0, 0]))
    return np.full(rgb.shape[:2], rgb[0, 0, 0], dtype=np.uint8)
fake_rembg.remove = fake_remove
fake_rembg.new_session = lambda name: object()
sys.modules["rembg"] = fake_rembg
fake_msg = types.ModuleType("utils.tool_msg")
fake_msg.ToolMSG = MagicMock()
sys.modules["utils.tool_msg"] = fake_msg
fake_env = types.ModuleType("utils.env")
for name in ("RABBITMQ_HOST", "RABBITMQ_PORT", "RABBITMQ_USERNAME", "RABBITMQ_PASSWORD"):
    setattr(fake_env, name, "x")
sys.modules["utils.env"] = fake_env
sys.modules.setdefault("utils", types.ModuleType("utils"))

import video_bg_remove  # noqa: E402

W, H, FPS = 64, 48, 10


def make_video(path, levels):
    writer = cv2.VideoWriter(path, cv2.VideoWriter_fourcc(*"mp4v"), FPS, (W, H))
    for level in levels:
        writer.write(np.full((H, W, 3), level, dtype=np.uint8))
    writer.release()


def frame_count(path):
    cap = cv2.VideoCapture(path)
    n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    cap.release()
    return n


class KeyframeTests(unittest.TestCase):
    def setUp(self):
        fake_rembg.calls.clear()
        self.dir = tempfile.mkdtemp()
        self.src = os.path.join(self.dir, "in.mp4")
        self.out = os.path.join(self.dir, "out", "result.mp4")
        self.tool = video_bg_remove.VideoBgRemove()

    def test_the_model_runs_on_one_frame_in_three_and_every_frame_is_written(self):
        make_video(self.src, [200] * 30)
        self.tool.process_video(self.src, self.out)
        self.assertEqual(len(fake_rembg.calls), 10)  # frames 0, 3, ..., 27
        self.assertEqual(frame_count(self.out), 30)

    def test_intermediate_masks_are_interpolated_between_key_masks(self):
        written = []
        tool = self.tool
        make_video(self.src, [0] * 30)
        calls = iter([0.0, 0.9] + [0.9] * 20)
        def mask(frame, *a, **k):
            return np.full((H, W), int(next(calls) * 255), dtype=np.uint8)
        with patch.object(video_bg_remove, "remove", side_effect=mask), \
             patch.object(np, "dstack", wraps=np.dstack) as dstack:
            tool.process_video(self.src, self.out, bg_mode="solid", solid_color="#000000")
        means = [float(c.args[0][0].mean()) for c in dstack.call_args_list][:4]
        self.assertAlmostEqual(means[0], 0.0, places=2)
        self.assertAlmostEqual(means[1], 0.3, delta=0.02)
        self.assertAlmostEqual(means[2], 0.6, delta=0.02)
        self.assertAlmostEqual(means[3], 0.9, delta=0.02)

    def test_frames_outside_the_interval_are_copied_without_inference(self):
        make_video(self.src, [100] * 30)  # 3 s at 10 fps
        self.tool.process_video(self.src, self.out, time_intervals=[{"start": 1.0, "end": 1.9}])
        self.assertEqual(len(fake_rembg.calls), 4)  # frames 10, 13, 16, 19
        self.assertEqual(frame_count(self.out), 30)

    def test_a_timeout_stops_and_reaps_ffmpeg_and_removes_the_partial_output(self):
        make_video(self.src, [100] * 30)
        started = []
        real_popen = subprocess.Popen
        def popen(*args, **kwargs):
            started.append(real_popen(*args, **kwargs))
            return started[-1]
        clock = iter([0.0] + [0.0] * 3 + [10_000.0] * 100)
        with patch.object(video_bg_remove.subprocess, "Popen", side_effect=popen), \
             patch.object(video_bg_remove.time, "time", side_effect=lambda: next(clock)):
            with self.assertRaises(TimeoutError):
                self.tool.process_video(self.src, self.out)
        self.assertIsNotNone(started[0].returncode)  # reaped: no zombie process
        self.assertFalse(os.path.exists(self.out))


if __name__ == "__main__":
    unittest.main()
