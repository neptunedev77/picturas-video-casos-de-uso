// UC-VID-002 only. Reuses users' existing operation endpoints without changing them.
const crypto = require("crypto");
const axios = require("axios");
const CompressionJob = require("../models/compressionJob");
const Project = require("../models/project");
const { httpsAgent } = require("../utils/httpsAgent");
const USERS = "https://users:10001";
const LIMITS = {
  free: { bytes: 500_000_000, seconds: 600 },
  premium: { bytes: 2_000_000_000, seconds: 3600 },
};

function error(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

function validateMedia(meta, type) {
  if (!LIMITS[type]) throw error(403, "REGISTERED_ONLY", "A registered account is required.");
  if (!meta || meta.format !== "mp4" || meta.videoCodec !== "h264") {
    throw error(400, "UNSUPPORTED_VIDEO", "Only MP4/H.264 is supported.");
  }
  if (!Number.isSafeInteger(meta.sizeBytes) || meta.sizeBytes <= 0 ||
      !Number.isFinite(meta.durationSec) || meta.durationSec <= 0) {
    throw error(400, "INVALID_VIDEO", "Invalid video size or duration.");
  }
  if (meta.sizeBytes > LIMITS[type].bytes) throw error(400, "SIZE_LIMIT", "Video exceeds the size limit for this account.");
  if (meta.durationSec > LIMITS[type].seconds) throw error(400, "DURATION_LIMIT", "Video exceeds the duration limit for this account.");
}

async function workerJob(jobId, token) {
  const job = await CompressionJob.findById(jobId).select("+worker_token_hash");
  const hash = typeof token === "string" ? crypto.createHash("sha256").update(token).digest("hex") : "";
  if (!job || !job.worker_token_hash || hash.length !== job.worker_token_hash.length ||
      !crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(job.worker_token_hash))) {
    throw error(403, "INVALID_WORKER_TOKEN", "Invalid worker authorization.");
  }
  return job;
}

async function authorizeStart(jobId, token, meta) {
  const job = await workerJob(jobId, token);
  if (job.status === "cancelled") throw error(409, "JOB_CANCELLED", "This compression job was cancelled.");
  const project = await Project.findOne({ _id: job.project_id, user_id: job.owner_id });
  if (!project?.imgs.id(job.img_id)) throw error(404, "NOT_FOUND", "Source video no longer exists in the owner's project.");
  let user;
  try {
    user = (await axios.get(`${USERS}/${job.owner_id}`, { httpsAgent, timeout: 5000 })).data;
  } catch (_) { throw error(503, "USERS_UNAVAILABLE", "Unable to verify account and quota."); }
  validateMedia(meta, user?.type);
  // Atomic job claim prevents a duplicate delivery/HTTP retry from charging twice.
  const claimed = await CompressionJob.findOneAndUpdate({
    _id: job._id, status: "queued", start_claimed: { $ne: true },
  }, { $set: { start_claimed: true, status: "processing", user_type: user.type } }, { new: true });
  if (!claimed) throw error(409, "START_ALREADY_CLAIMED", "This compression job cannot be started again.");
  try {
    if (user.type === "free") {
      if (user.remaining_operations === 0) throw error(429, "NO_QUOTA", "No daily operations remaining.");
      const reservation = await axios.get(`${USERS}/${job.owner_id}/process/1`, {
        httpsAgent, timeout: 5000, validateStatus: () => true,
      });
      if (reservation.status !== 200) {
        if (reservation.status === 701 && /No more daily_operations/.test(String(reservation.data))) {
          throw error(429, "NO_QUOTA", "No daily operations remaining.");
        }
        throw error(503, "USERS_UNAVAILABLE", "Unable to reserve a daily operation.");
      }
    }
    await CompressionJob.updateOne({ _id: job._id }, { $set: {
      quota_charged: user.type === "free", status: "processing", started_at: new Date(),
    } });
    return { userType: user.type };
  } catch (e) {
    await CompressionJob.updateOne({ _id: job._id }, { $set: {
      status: "failed", finished_at: new Date(),
      error: { code: e.code || "USERS_UNAVAILABLE", message: e.status ? e.message : "Unable to authorize compression." },
    } });
    throw e.status ? e : error(503, "USERS_UNAVAILABLE", "Unable to authorize compression.");
  }
}

async function releaseFailedLaunch(jobId, token) {
  const job = await workerJob(jobId, token);
  // Only the worker's failed Popen path may refund; encode failures remain charged.
  const claimed = await CompressionJob.findOneAndUpdate({
    _id: job._id, status: "processing", quota_charged: true, quota_refund_claimed: { $ne: true },
  }, { $set: { quota_refund_claimed: true } }, { new: true });
  if (!claimed) return;
  const response = await axios.post(`${USERS}/${job.owner_id}/process/refund/1`, {}, {
    httpsAgent, timeout: 5000, validateStatus: () => true,
  });
  if (response.status !== 200) throw error(503, "REFUND_FAILED", "Unable to release the operation for a failed launch.");
  await CompressionJob.updateOne({ _id: job._id }, { $set: { quota_charged: false } });
}

module.exports = { authorizeStart, releaseFailedLaunch, validateMedia };
