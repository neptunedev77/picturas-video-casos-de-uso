import io
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
from urllib.error import HTTPError, URLError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import authorization
from media import CompressionError


class AuthorizationTests(unittest.TestCase):
    def setUp(self):
        self.job = {"jobId": "c" * 24, "workerToken": "private-token"}
        self.meta = {"format": "mp4", "videoCodec": "h264", "sizeBytes": 1000, "durationSec": 10}

    def test_authorizes_once_with_job_token_and_actual_metadata(self):
        with patch("authorization.urlopen", return_value=io.BytesIO(b'{"userType":"free"}')) as open_url:
            result = authorization.authorize_start(self.job, self.meta)
        self.assertEqual(result["userType"], "free")
        req = open_url.call_args.args[0]
        self.assertTrue(req.full_url.endswith(f"/{self.job['jobId']}/start"))
        self.assertEqual(req.get_header("Authorization"), "Bearer private-token")
        self.assertEqual(json.loads(req.data)["media"], self.meta)
        open_url.assert_called_once()

    def test_no_quota_error_is_preserved_without_retry(self):
        err = HTTPError("https://projects", 429, "quota", {}, io.BytesIO(b'{"code":"NO_QUOTA","message":"No quota"}'))
        with patch("authorization.urlopen", side_effect=err) as open_url:
            with self.assertRaises(CompressionError) as raised:
                authorization.authorize_start(self.job, self.meta)
        self.assertEqual(raised.exception.code, "NO_QUOTA")
        open_url.assert_called_once()

    def test_missing_job_token_does_not_contact_server(self):
        with patch("authorization.urlopen") as open_url:
            with self.assertRaises(CompressionError):
                authorization.authorize_start({"jobId": self.job["jobId"]}, self.meta)
            open_url.assert_not_called()

    def test_lost_start_response_attempts_release_instead_of_a_second_debit(self):
        with patch("authorization.urlopen", side_effect=[URLError("connection lost"), io.BytesIO(b'{"released":true}')]) as open_url:
            with self.assertRaises(CompressionError) as raised:
                authorization.authorize_start(self.job, self.meta)
        self.assertEqual(raised.exception.code, "AUTHORIZATION_UNAVAILABLE")
        self.assertEqual(open_url.call_count, 2)
        self.assertTrue(open_url.call_args_list[0].args[0].full_url.endswith("/start"))
        self.assertTrue(open_url.call_args_list[1].args[0].full_url.endswith("/launch-failed"))

    def test_control_polls_with_job_secret_and_short_timeout(self):
        with patch("authorization.urlopen", return_value=io.BytesIO(b'{"status":"processing","cancelRequested":false}')) as call:
            authorization.check_control(self.job)
        self.assertTrue(call.call_args.args[0].full_url.endswith("/control"))
        self.assertEqual(call.call_args.args[0].get_header("Authorization"), "Bearer private-token")
        self.assertEqual(call.call_args.kwargs["timeout"], 2)

    def test_pending_cancellation_and_cancelled_state_stop_processing(self):
        for state in [{"status": "processing", "cancelRequested": True}, {"status": "cancelled"}]:
            with self.subTest(state=state):
                with patch("authorization.urlopen", return_value=io.BytesIO(json.dumps(state).encode())):
                    with self.assertRaises(CompressionError) as raised:
                        authorization.check_control(self.job)
                self.assertEqual(raised.exception.code, "JOB_CANCELLED")

    def test_lost_launch_ack_never_requests_refund(self):
        with patch("authorization.urlopen", side_effect=URLError("lost ack")) as call:
            with self.assertRaises(CompressionError):
                authorization.check_control(self.job, launched=True)
        call.assert_called_once()
        self.assertTrue(call.call_args.args[0].full_url.endswith("/launched"))

    def test_unavailable_or_terminal_control_never_allows_success(self):
        with patch("authorization.urlopen", side_effect=URLError("offline")):
            with self.assertRaises(CompressionError):
                authorization.check_control(self.job)
        with patch("authorization.urlopen", return_value=io.BytesIO(b'{"status":"completed"}')):
            with self.assertRaises(CompressionError) as raised:
                authorization.check_control(self.job)
        self.assertEqual(raised.exception.code, "JOB_NOT_ACTIVE")


if __name__ == "__main__":
    unittest.main()
