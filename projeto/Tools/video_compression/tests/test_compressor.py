import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from compressor import build_command, compress
from config import PLAN_LIMITS
from media import CompressionError, check_limits, probe


class ContractTests(unittest.TestCase):
    def test_profiles_and_optional_audio(self):
        for quality, crf, bitrate in [("high", "23", "160k"), ("balanced", "28", "128k"), ("small", "32", "96k")]:
            with self.subTest(quality=quality):
                cmd = build_command("source.mp4", "output.mp4", quality)
                self.assertEqual(cmd[cmd.index("-crf") + 1], crf)
                self.assertIn("0:a:0?", cmd)
                self.assertIn("-n", cmd)
                self.assertNotIn("-y", cmd)
                self.assertEqual(cmd[cmd.index("-c:v") + 1], "libx264")
                self.assertEqual(cmd[cmd.index("-preset") + 1], "veryfast")
                self.assertEqual(cmd[cmd.index("-pix_fmt") + 1], "yuv420p")
                self.assertEqual(cmd[cmd.index("-c:a") + 1], "aac")
                self.assertEqual(cmd[cmd.index("-b:a") + 1], bitrate)
                self.assertEqual("scale=" in cmd[cmd.index("-vf") + 1], quality == "small")

    def test_unknown_quality_is_rejected(self):
        with self.assertRaises(CompressionError):
            build_command("in.mp4", "out.mp4", "custom")

    def test_account_boundaries(self):
        for account, lim in PLAN_LIMITS.items():
            with self.subTest(account=account):
                meta = {"sizeBytes": lim["maxBytes"], "durationSec": lim["maxDurationSec"]}
                check_limits(meta, account)
                for field in meta:
                    with self.assertRaises(CompressionError):
                        check_limits({**meta, field: meta[field] + 1}, account)
        with self.assertRaises(CompressionError):
            check_limits({"sizeBytes": 1, "durationSec": 1}, "anonymous")

    def test_same_input_output_rejected_before_ffmpeg(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "source.mp4"
            source.write_bytes(b"original")
            with self.assertRaises(CompressionError):
                compress(source, source, "balanced", "free")
            self.assertEqual(source.read_bytes(), b"original")

    def test_existing_result_is_not_overwritten(self):
        with tempfile.TemporaryDirectory() as tmp:
            source, output = Path(tmp) / "source.mp4", Path(tmp) / "result.mp4"
            source.write_bytes(b"original")
            output.write_bytes(b"existing result")
            with self.assertRaises(CompressionError):
                compress(source, output, "high", "free")
            self.assertEqual(source.read_bytes(), b"original")
            self.assertEqual(output.read_bytes(), b"existing result")

    def test_quota_denied_never_launches_ffmpeg_or_changes_original(self):
        with tempfile.TemporaryDirectory() as tmp:
            source, output = Path(tmp) / "source.mp4", Path(tmp) / "result.mp4"
            source.write_bytes(b"original")
            meta = {"format": "mp4", "videoCodec": "h264", "sizeBytes": 8, "durationSec": 10}
            authorize = Mock(side_effect=CompressionError("NO_QUOTA", "No daily operations remaining."))
            with patch("compressor.probe", return_value=meta), patch("compressor.subprocess.Popen") as launch:
                with self.assertRaises(CompressionError) as raised:
                    compress(source, output, "balanced", "free", before_start=authorize)
                self.assertEqual(raised.exception.code, "NO_QUOTA")
                launch.assert_not_called()
            authorize.assert_called_once_with(meta)
            self.assertEqual(source.read_bytes(), b"original")
            self.assertFalse(output.exists())
            self.assertFalse(list(Path(tmp).glob("encode-*")))

    def test_failed_popen_releases_operation_without_producing_output(self):
        with tempfile.TemporaryDirectory() as tmp:
            source, output = Path(tmp) / "source.mp4", Path(tmp) / "result.mp4"
            source.write_bytes(b"original")
            meta = {"sizeBytes": 8, "durationSec": 10}
            authorize = Mock(return_value={"userType": "free"})
            refund = Mock()
            with patch("compressor.probe", return_value=meta), patch("compressor.subprocess.Popen", side_effect=OSError("missing ffmpeg")):
                with self.assertRaises(CompressionError) as raised:
                    compress(source, output, "balanced", "free", before_start=authorize, launch_failed=refund)
                self.assertEqual(raised.exception.code, "LAUNCH_FAILED")
            refund.assert_called_once()
            self.assertEqual(source.read_bytes(), b"original")
            self.assertFalse(output.exists())

    def test_profile_upgrade_is_not_rejected_using_the_queued_snapshot(self):
        with tempfile.TemporaryDirectory() as tmp:
            source, output = Path(tmp) / "source.mp4", Path(tmp) / "result.mp4"
            source.write_bytes(b"original")
            meta = {"sizeBytes": 8, "durationSec": 601}
            authorize = Mock(return_value={"userType": "premium"})
            # Reaching Popen proves the current premium limits replaced the queued free profile.
            with patch("compressor.probe", return_value=meta), patch("compressor.subprocess.Popen", side_effect=OSError("test launch")) as launch:
                with self.assertRaises(CompressionError) as raised:
                    compress(source, output, "balanced", "free", before_start=authorize)
                self.assertEqual(raised.exception.code, "LAUNCH_FAILED")
                launch.assert_called_once()

    def test_cancelled_authorization_never_launches_or_debits(self):
        with tempfile.TemporaryDirectory() as tmp:
            source, output = Path(tmp) / "source.mp4", Path(tmp) / "result.mp4"
            source.write_bytes(b"original")
            authorize = Mock(side_effect=CompressionError("JOB_CANCELLED", "Cancelled before start"))
            refund = Mock()
            with patch("compressor.probe", return_value={"sizeBytes": 8, "durationSec": 10}), \
                    patch("compressor.subprocess.Popen") as launch:
                with self.assertRaises(CompressionError) as raised:
                    compress(source, output, "balanced", "free", before_start=authorize, launch_failed=refund)
            self.assertEqual(raised.exception.code, "JOB_CANCELLED")
            launch.assert_not_called()
            refund.assert_not_called()
            self.assertEqual(source.read_bytes(), b"original")
            self.assertFalse(output.exists())

    def test_cancel_between_authorization_and_popen_compensates_once(self):
        with tempfile.TemporaryDirectory() as tmp:
            source, output = Path(tmp) / "source.mp4", Path(tmp) / "result.mp4"
            source.write_bytes(b"original")
            refund = Mock()
            check = Mock(side_effect=CompressionError("JOB_CANCELLED", "Cancelled before Popen"))
            with patch("compressor.probe", return_value={"sizeBytes": 8, "durationSec": 10}), \
                    patch("compressor.subprocess.Popen") as launch:
                with self.assertRaises(CompressionError) as raised:
                    compress(source, output, "balanced", "free", before_start=lambda _: {"userType": "free"},
                             launch_failed=refund, check_cancel=check)
            self.assertEqual(raised.exception.code, "JOB_CANCELLED")
            launch.assert_not_called()
            refund.assert_called_once()
            self.assertFalse(output.exists())
            self.assertFalse(list(Path(tmp).glob("encode-*")))


@unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "FFmpeg/ffprobe not installed")
class FFmpegTests(unittest.TestCase):
    def test_running_ffmpeg_is_killed_and_reaped_without_refund_or_partial_result(self):
        with tempfile.TemporaryDirectory() as tmp:
            source, output = Path(tmp) / "source.mp4", Path(tmp) / "result.mp4"
            subprocess.run([
                "ffmpeg", "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=160x120:rate=15",
                "-t", "5", "-c:v", "libx264", str(source),
            ], check=True, capture_output=True)
            original_hash = hashlib.sha256(source.read_bytes()).digest()
            real_popen = subprocess.Popen
            for code in ["JOB_CANCELLED", "AUTHORIZATION_UNAVAILABLE"]:
                with self.subTest(code=code):
                    processes, heartbeats = [], []
                    refund = Mock()

                    def launch(cmd, *args, **kwargs):
                        if "-progress" in cmd:
                            cmd = list(cmd)
                            cmd.insert(cmd.index("-i"), "-re") # Keep the real encoder running for cancellation.
                        proc = real_popen(cmd, *args, **kwargs)
                        if "-progress" in cmd:
                            processes.append(proc)
                        return proc

                    def check():
                        if processes:
                            self.assertIsNone(processes[0].poll())
                            self.assertTrue(list(Path(tmp).glob("encode-*/partial.mp4")))
                            raise CompressionError(code, "Stop this active encode")

                    with patch("compressor.subprocess.Popen", side_effect=launch):
                        with self.assertRaises(CompressionError) as raised:
                            compress(source, output, "balanced", "free", launch_failed=refund,
                                     before_start=lambda _: {"userType": "free"}, check_cancel=check,
                                     tick=lambda: heartbeats.append(True))
                    self.assertEqual(raised.exception.code, code)
                    self.assertEqual(len(processes), 1)
                    self.assertIsNotNone(processes[0].returncode)
                    self.assertNotEqual(processes[0].returncode, 0)
                    self.assertTrue(processes[0].stdout.closed)
                    self.assertTrue(heartbeats)
                    refund.assert_not_called()
                    self.assertFalse(output.exists())
                    self.assertFalse(list(Path(tmp).glob("encode-*")))
                    self.assertEqual(hashlib.sha256(source.read_bytes()).digest(), original_hash)

    def test_lost_launch_ack_stops_ffmpeg_without_refund(self):
        with tempfile.TemporaryDirectory() as tmp:
            source, output = Path(tmp) / "source.mp4", Path(tmp) / "result.mp4"
            subprocess.run([
                "ffmpeg", "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=160x120:rate=15",
                "-t", "1", "-c:v", "libx264", str(source),
            ], check=True, capture_output=True)
            refund = Mock()
            launched = Mock(side_effect=CompressionError("AUTHORIZATION_UNAVAILABLE", "Lost acknowledgement"))
            with self.assertRaises(CompressionError):
                compress(source, output, "balanced", "free", before_start=lambda _: {"userType": "free"},
                         launch_failed=refund, launched=launched)
            refund.assert_not_called()
            self.assertFalse(output.exists())
            self.assertFalse(list(Path(tmp).glob("encode-*")))

    def test_cancellation_during_final_probe_prevents_result_publication(self):
        with tempfile.TemporaryDirectory() as tmp:
            source, output = Path(tmp) / "source.mp4", Path(tmp) / "result.mp4"
            subprocess.run([
                "ffmpeg", "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=160x120:rate=15",
                "-t", "0.4", "-c:v", "libx264", str(source),
            ], check=True, capture_output=True)
            cancelled = False
            refund = Mock()

            def inspect(filename):
                nonlocal cancelled
                result = probe(filename)
                if Path(filename).name == "partial.mp4":
                    cancelled = True
                return result

            def check():
                if cancelled:
                    raise CompressionError("JOB_CANCELLED", "Cancelled during result validation")

            with patch("compressor.probe", side_effect=inspect):
                with self.assertRaises(CompressionError) as raised:
                    compress(source, output, "balanced", "free", before_start=lambda _: {"userType": "free"},
                             launch_failed=refund, check_cancel=check)
            self.assertEqual(raised.exception.code, "JOB_CANCELLED")
            refund.assert_not_called()
            self.assertFalse(output.exists())
            self.assertFalse(list(Path(tmp).glob("encode-*")))

    def test_all_profiles_preserve_source_and_audio(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "source.mp4"
            subprocess.run([
                "ffmpeg", "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=160x120:rate=15",
                "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100", "-t", "1",
                "-c:v", "libx264", "-c:a", "aac", str(source),
            ], check=True, capture_output=True)
            original_hash = hashlib.sha256(source.read_bytes()).digest()
            for quality in ["high", "balanced", "small"]:
                values = []
                output = Path(tmp) / f"{quality}.mp4"
                result = compress(source, output, quality, "free", progress=values.append)
                self.assertGreater(result["sizeBytes"], 0)
                self.assertEqual((result["width"], result["height"]), (160, 120))
                self.assertTrue(probe(output)["hasAudio"])
                self.assertEqual(hashlib.sha256(source.read_bytes()).digest(), original_hash)
                self.assertTrue(values)
                self.assertFalse(list(Path(tmp).glob("encode-*")))

    def test_no_audio_video_is_supported(self):
        with tempfile.TemporaryDirectory() as tmp:
            source, output = Path(tmp) / "source.mp4", Path(tmp) / "result.mp4"
            subprocess.run([
                "ffmpeg", "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=160x120:rate=15",
                "-t", "1", "-c:v", "libx264", str(source),
            ], check=True, capture_output=True)
            compress(source, output, "small", "free")
            self.assertFalse(probe(output)["hasAudio"])

    def test_profile_resolution_and_aspect_ratio(self):
        cases = [
            (1920, 1080, (1280, 720)),
            (1080, 1920, (720, 1280)),
            (1600, 1000, (1152, 720)),
            (1000, 1600, (720, 1152)),
            (640, 360, (640, 360)),
            (360, 640, (360, 640)),
            (1280, 720, (1280, 720)),
            (720, 1280, (720, 1280)),
            (1000, 1000, (720, 720)),
            (321, 241, (320, 240)),
        ]
        with tempfile.TemporaryDirectory() as tmp:
            for width, height, small_size in cases:
                source = Path(tmp) / f"source-{width}x{height}.mp4"
                subprocess.run([
                    "ffmpeg", "-v", "error", "-f", "lavfi", "-i",
                    f"testsrc=size={width}x{height}:rate=5", "-t", "0.4",
                    "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv444p", str(source),
                ], check=True, capture_output=True)
                for quality in ["high", "balanced", "small"]:
                    with self.subTest(size=(width, height), quality=quality):
                        output = Path(tmp) / f"{quality}-{width}x{height}.mp4"
                        result = compress(source, output, quality, "free")
                        expected = small_size if quality == "small" else (width + width % 2, height + height % 2)
                        self.assertEqual((result["width"], result["height"]), expected)
                        self.assertEqual(result["width"] % 2, 0)
                        self.assertEqual(result["height"] % 2, 0)
                        response = subprocess.run([
                            "ffprobe", "-v", "error", "-select_streams", "v:0",
                            "-show_entries", "stream=codec_name,pix_fmt,display_aspect_ratio",
                            "-of", "json", str(output),
                        ], check=True, capture_output=True)
                        stream = json.loads(response.stdout)["streams"][0]
                        self.assertEqual(stream["codec_name"], "h264")
                        self.assertEqual(stream["pix_fmt"], "yuv420p")
                        if quality == "small":
                            self.assertLessEqual(result["width"], width)
                            self.assertLessEqual(result["height"], height)
                            numerator, denominator = map(int, stream["display_aspect_ratio"].split(":"))
                            self.assertAlmostEqual(numerator / denominator, width / height, places=4)

    def test_invalid_video_never_publishes_output(self):
        with tempfile.TemporaryDirectory() as tmp:
            source, output = Path(tmp) / "source.mp4", Path(tmp) / "result.mp4"
            source.write_bytes(b"not a video")
            with self.assertRaises(CompressionError):
                compress(source, output, "balanced", "free")
            self.assertFalse(output.exists())
            self.assertEqual(source.read_bytes(), b"not a video")


if __name__ == "__main__":
    unittest.main()
