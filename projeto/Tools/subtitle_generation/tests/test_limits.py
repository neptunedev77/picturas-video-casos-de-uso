"""Limits and time limit of UC-VID-004. Run in Tools/subtitle_generation with:
    python -m unittest discover -s tests -v
"""
import os
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import config  # noqa: E402
import worker  # noqa: E402
from errors import SubtitleError  # noqa: E402


class TimeLimitTests(unittest.TestCase):
    def test_formula_is_three_times_the_duration_plus_sixty_seconds(self):
        # REQ-VID-TIMEOUT-001 (MVP), the same rule as the other video tools.
        for duration, expected in [(1, 63), (10, 90), (60, 240), (600, 1860)]:
            with self.subTest(duration=duration):
                self.assertEqual(config.job_timeout(duration), expected)

    def test_generate_srt_knows_its_limit_from_the_request(self):
        request = {"operation": "generate_srt", "duration": 20}
        self.assertEqual(worker.deadline(100, "/unused", request, None), 100 + 120)

    def test_transcription_uses_the_fallback_until_the_duration_is_known(self):
        request = {"operation": "transcribe"}
        with tempfile.TemporaryDirectory() as workspace:
            self.assertIsNone(worker.deadline(100, workspace, request, None))
            worker._json_write(Path(workspace) / "media.json", {"duration": 30})
            self.assertEqual(worker.deadline(100, workspace, request, None), 100 + 150)
            # Once set, the limit never moves.
            self.assertEqual(worker.deadline(100, workspace, request, 250), 250)

    def test_a_timeout_is_not_retried_automatically(self):
        error = worker._error(SubtitleError("job_timeout", "Excedeu o tempo máximo."))
        self.assertEqual(error["code"], "JOB_TIMEOUT")
        self.assertFalse(error["retryable"])
        self.assertTrue(worker._error(SubtitleError("stt_failed", "Falhou."))["retryable"])


class MediaLimitTests(unittest.TestCase):
    def info(self, duration, size):
        handle = tempfile.NamedTemporaryFile(delete=False)
        handle.close()
        self.addCleanup(os.unlink, handle.name)
        with open(handle.name, "wb") as stream:
            stream.truncate(size)
        return SimpleNamespace(path=Path(handle.name), duration=duration)

    def test_exact_limits_are_accepted(self):
        worker.check_limits(self.info(600, 1000))
        with patch.object(config, "MAX_VIDEO_BYTES", 1000):
            worker.check_limits(self.info(10, 1000))

    def test_ten_minutes_is_the_maximum_duration(self):
        with self.assertRaises(SubtitleError) as raised:
            worker.check_limits(self.info(600.5, 1000))
        self.assertEqual(raised.exception.kind, "duration_limit")

    def test_the_size_limit_is_checked_on_the_real_file(self):
        with patch.object(config, "MAX_VIDEO_BYTES", 1000), self.assertRaises(SubtitleError) as raised:
            worker.check_limits(self.info(10, 1001))
        self.assertEqual(raised.exception.kind, "size_limit")


if __name__ == "__main__":
    unittest.main()
