"""Per-job start authorization. User JWTs never enter worker messages."""
import json
import ssl
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from media import CompressionError


def request(job, action, payload=None, timeout=15):
    token = job.get("workerToken")
    if not isinstance(token, str) or not token:
        raise CompressionError("INVALID_WORKER_TOKEN", "This job has no start authorization.")
    req = Request(
        f"https://projects:9001/internal/video-compression/{job['jobId']}/{action}",
        data=json.dumps(payload or {}).encode(), method="POST",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    )
    try:
        # Matches the existing internal self-signed HTTPS service configuration.
        with urlopen(req, context=ssl._create_unverified_context(), timeout=timeout) as response:
            return json.load(response)
    except HTTPError as e:
        try:
            data = json.loads(e.read())
        except (ValueError, UnicodeDecodeError):
            data = {}
        raise CompressionError(data.get("code", "AUTHORIZATION_FAILED"),
                               data.get("message", "Compression was not authorized.")) from e
    except (URLError, OSError, ValueError) as e:
        # Never retry a possibly charged start automatically.
        raise CompressionError("AUTHORIZATION_UNAVAILABLE", "Unable to contact compression control.") from e


def authorize_start(job, media):
    try:
        return request(job, "start", {"media": media})
    except CompressionError as e:
        if e.code == "AUTHORIZATION_UNAVAILABLE":
            # A lost HTTP response may conceal a successful debit. No encode was launched.
            try:
                release_failed_launch(job)
            except CompressionError as refund_error:
                print(f"[COMPRESSION][REFUND] {refund_error}", flush=True)
        raise


def release_failed_launch(job):
    return request(job, "launch-failed")


def check_control(job, launched=False):
    state = request(job, "launched" if launched else "control", timeout=2)
    if state.get("cancelRequested") or state.get("status") == "cancelled":
        raise CompressionError("JOB_CANCELLED", "Compression was cancelled.")
    if state.get("status") != "processing":
        raise CompressionError("JOB_NOT_ACTIVE", "Compression is no longer active.")
