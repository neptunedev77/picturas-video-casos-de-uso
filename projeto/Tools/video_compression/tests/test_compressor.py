import hashlib
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
        for quality, crf in [("high", "20"), ("balanced", "25"), ("small", "30")]:
            with self.subTest(quality=quality):
                cmd = build_command("source.mp4", "output.mp4", quality)
                self.assertEqual(cmd[cmd.index("-crf") + 1], crf)
                self.assertIn("0:a:0?", cmd)
                self.assertIn("-n", cmd)
                self.assertNotIn("-y", cmd)
                self.assertEqual(cmd[cmd.index("-c:v") + 1], "libx264")

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


@unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "FFmpeg/ffprobe not installed")
class FFmpegTests(unittest.TestCase):
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
