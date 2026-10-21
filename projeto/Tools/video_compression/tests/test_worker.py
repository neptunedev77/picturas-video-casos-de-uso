from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from media import CompressionError
from worker import CompressionWorker
import pika


class WorkerTests(unittest.TestCase):
    def test_no_quota_runs_real_compressor_without_launch_or_refund_and_publishes_failed(self):
        with tempfile.TemporaryDirectory() as tmp:
            job_id = "c" * 24
            root = Path(tmp)
            directory = root / job_id
            directory.mkdir()
            source, output = directory / "source.mp4", directory / "result.mp4"
            source.write_bytes(b"original")
            job = {"jobId": job_id, "inputPath": str(source), "outputPath": str(output),
                   "quality": "balanced", "userType": "free"}
            meta = {"sizeBytes": 8, "durationSec": 10}
            publish = Mock()
            with patch("worker.config.ROOT", root), patch("compressor.probe", return_value=meta), \
                    patch("worker.authorize_start", side_effect=CompressionError("NO_QUOTA", "No daily operations remaining.")) as authorize, \
                    patch("compressor.subprocess.Popen") as launch, \
                    patch("worker.release_failed_launch") as refund, patch("worker.check_control") as control:
                CompressionWorker().process(job, publish, Mock())
            authorize.assert_called_once_with(job, meta)
            launch.assert_not_called()
            refund.assert_not_called()
            control.assert_not_called()
            publish.assert_called_once_with({"jobId": job_id, "status": "failed", "error": {
                "code": "NO_QUOTA", "message": "No daily operations remaining.",
            }})
            self.assertEqual(source.read_bytes(), b"original")
            self.assertFalse(output.exists())
            self.assertFalse(list(directory.glob("encode-*")))

    def test_timeout_publishes_failed_with_original_code_and_never_refunds(self):
        with patch("worker.validate_paths", return_value=(Path("source.mp4"), Path("result.mp4"))), \
                patch("worker.compress", side_effect=CompressionError("PROCESSING_TIMEOUT", "Exceeded FFmpeg deadline")), \
                patch("worker.release_failed_launch") as refund:
            publish = Mock()
            CompressionWorker().process({"jobId": "c" * 24}, publish, Mock())
            publish.assert_called_once()
            message = publish.call_args.args[0]
            self.assertEqual(message["status"], "failed")
            self.assertEqual(message["error"]["code"], "PROCESSING_TIMEOUT")
            self.assertNotIn("result", message)
            refund.assert_not_called()

    def test_cancelled_is_published_only_after_compressor_cleanup(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            job_id = "c" * 24
            directory = root / job_id
            directory.mkdir()
            partial = directory / "partial.mp4"
            partial.write_bytes(b"incomplete")
            job = {"jobId": job_id, "inputPath": str(directory / "source.mp4"),
                   "outputPath": str(directory / "result.mp4"), "quality": "balanced", "userType": "free"}
            messages = []

            def encode(*args, **kwargs):
                kwargs["before_start"]({"sizeBytes": 10})
                kwargs["launched"]()
                kwargs["tick"]()
                kwargs["progress"](10)
                try:
                    kwargs["check_cancel"]()
                finally:
                    partial.unlink()

            def publish(message):
                if message["status"] == "cancelled":
                    self.assertFalse(partial.exists())
                messages.append(message)

            def control(_job, launched=False):
                if not launched:
                    raise CompressionError("JOB_CANCELLED", "Cancelled")

            with patch("worker.config.ROOT", root), patch("worker.compress", side_effect=encode), \
                    patch("worker.authorize_start", return_value={"userType": "free"}), \
                    patch("worker.check_control", side_effect=control), \
                    patch("worker.release_failed_launch") as refund:
                heartbeat = Mock()
                CompressionWorker().process(job, publish, heartbeat)
            self.assertEqual([m["status"] for m in messages], ["processing", "cancelled"])
            heartbeat.assert_called_once()
            refund.assert_not_called()

    def test_amqp_failure_is_not_acknowledged_as_success(self):
        with patch("worker.validate_paths", return_value=(Path("source.mp4"), Path("result.mp4"))), \
                patch("worker.compress", side_effect=pika.exceptions.AMQPConnectionError):
            publish = Mock()
            with self.assertRaises(pika.exceptions.AMQPError):
                CompressionWorker().process({"jobId": "c" * 24}, publish, Mock())
            publish.assert_not_called()

    def test_redelivery_reports_interruption_without_reencoding_or_refund(self):
        with patch("worker.validate_paths", return_value=(Path("source.mp4"), Path("result.mp4"))), \
                patch("worker.compress") as encode, patch("worker.release_failed_launch") as refund:
            publish = Mock()
            CompressionWorker().process({"jobId": "c" * 24}, publish, Mock(), redelivered=True)
            self.assertEqual(publish.call_args.args[0]["error"]["code"], "WORKER_INTERRUPTED")
            encode.assert_not_called()
            refund.assert_not_called()
