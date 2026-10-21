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
