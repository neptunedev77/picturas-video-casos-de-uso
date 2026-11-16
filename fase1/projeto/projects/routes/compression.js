const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const FormData = require("form-data");
const { httpsAgent } = require("../utils/httpsAgent");
const { pipeline } = require("stream/promises");
const CompressionJob = require("../models/compressionJob");
const Project = require("../models/project");
const { get_image_internal_url, post_image } = require("../utils/imageStorage");
const { send_msg_project_op } = require("../utils/project_msg");
const mq = require("../utils/compression_mq");
const {
  authorizeStart, releaseFailedLaunch, releaseOperation, control, markLaunched,
} = require("../services/compressionAccess");
const router = express.Router();
const base = "/:user/:project/compression";
const ROOT = path.resolve("images/video_compression");
const QUALITIES = ["high", "balanced", "small"];

// REQ-VID-SEC-001: the project owner, or an authenticated user with a valid share link.
// Creating and cancelling jobs also requires the link's "edit" permission.
function access(write) {
  return (req, res, next) => {
    let payload;
    try {
      const token = /^Bearer (.+)$/.exec(req.headers.authorization || "");
      if (!token) throw new Error("Missing token");
      payload = jwt.verify(token[1], process.env.JWT_SECRET_KEY);
    } catch (_) {
      return res.status(401).json({ code: "UNAUTHENTICATED", message: "A valid JWT is required." });
    }
    if (![req.params.user, req.params.project, req.params.jobId].filter(Boolean).every(mongoose.isValidObjectId)) {
      return res.status(404).json({ code: "NOT_FOUND", message: "Resource not found." });
    }
    const share = req.query?.share;
    if (!share && String(payload.id) !== req.params.user) {
      return res.status(403).json({ code: "NO_PERMISSION", message: "No permission on this project." });
    }
    // A valid JWT for the URL's user is insufficient if the project belongs to someone else.
    Project.findOne({ _id: req.params.project, user_id: req.params.user })
      .then((project) => {
        if (!project) return res.status(404).json({ code: "NOT_FOUND", message: "Project not found." });
        if (share) {
          const link = (project.sharedLinks || []).find((l) => l.id === share);
          if (!link || link.revoked) return res.status(410).json({ code: "SHARE_INVALID", message: "Share link is invalid or revoked." });
          if (write && link.permission !== "edit") {
            return res.status(403).json({ code: "EDIT_REQUIRED", message: "The share link has no edit permission." });
          }
        }
        req.callerId = String(payload.id);
        next();
      })
      .catch(() => res.status(503).json({ code: "PROJECTS_UNAVAILABLE", message: "Unable to verify project permissions." }));
  };
}

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const filter = (req) => ({ owner_id: req.params.user, project_id: req.params.project });
function view(job) {
  const result = job.status === "completed" && job.result ? { ...job.result } : null;
  if (result) delete result.key;
  return {
    _id: job._id, imgId: job.img_id, quality: job.quality, profileVersion: job.profile_version,
    status: job.status, progress: job.progress, sourceName: job.source_name,
    cancelRequested: Boolean(job.cancel_requested_at),
    result,
    error: job.error || null, createdAt: job.createdAt, updatedAt: job.updatedAt,
  };
}

function notify(job) {
  if (!job) return;
  mq.sendClientUpdate(job.runner_id || job.owner_id, {
    jobId: String(job._id), projectId: String(job.project_id), imgId: String(job.img_id),
    status: job.status, progress: job.progress, cancelRequested: Boolean(job.cancel_requested_at),
    error: job.error || null,
  });
}

async function publishState(jobId) {
  notify(await CompressionJob.findById(jobId));
}

// A job that did not complete returns its reserved operation (REQ-VID-QUOTA-002) and
// informs the browser. Both steps are idempotent, so repeated messages are harmless.
async function settle(jobId) {
  try { await releaseOperation(jobId); } catch (e) { console.error("[COMPRESSION] Refund failed:", e.message); }
  await publishState(jobId);
}

async function fail(jobId, code, message) {
  return CompressionJob.updateOne({ _id: jobId, status: { $in: ["queued", "processing"] }, cancel_requested_at: null }, {
    $set: { status: "failed", error: { code, message }, finished_at: new Date() },
  });
}

async function prepare(job, img, workerToken) {
  try {
    const input = job.input_path;
    await fs.promises.mkdir(path.dirname(input), { recursive: true });
    const signed = await get_image_internal_url(String(job.owner_id), String(job.project_id), "src", img.og_img_key);
    const response = await axios.get(signed.data.url, { responseType: "stream", timeout: 60000 });
    await pipeline(response.data, fs.createWriteStream(input, { flags: "wx" }));
    // Cancellation may have won while the private source copy was being downloaded.
    if (!await CompressionJob.exists({ _id: job._id, status: "queued", start_claimed: { $ne: true } })) {
      await fs.promises.rm(input, { force: true }).catch(() => {});
      return;
    }
    await mq.sendRequest({
      jobId: String(job._id), quality: job.quality, userType: job.user_type,
      inputPath: job.input_path, outputPath: job.output_path,
      workerToken,
    });
  } catch (e) {
    console.error("[COMPRESSION] Preparation failed:", e.message);
    await fail(job._id, "PREPARATION_FAILED", "Unable to prepare the video for compression.");
    await fs.promises.rm(job.input_path, { force: true }).catch(() => {});
    await settle(job._id);
  }
}

router.post(base, access(true), wrap(async (req, res) => {
  const { imgId, quality } = req.body || {};
  if (!mongoose.isValidObjectId(imgId) || !QUALITIES.includes(quality)) {
    return res.status(400).json({ code: "INVALID_REQUEST", message: "Provide imgId and quality: high, balanced or small." });
  }
  const project = await Project.findOne({ _id: req.params.project, user_id: req.params.user });
  const img = project?.imgs.id(imgId);
  if (!img) return res.status(404).json({ code: "NOT_FOUND", message: "Video not found in this project." });
  if (img.mime_type !== "video/mp4" && !/\.mp4$/i.test(img.og_uri)) {
    return res.status(400).json({ code: "UNSUPPORTED_VIDEO", message: "Only MP4/H.264 is supported." });
  }
  // RNG-05: whoever runs the job (owner or shared-link editor) is checked and charged.
  const runnerId = req.callerId || req.params.user;
  const user = await axios.get(`https://users:10001/${runnerId}`, { httpsAgent, timeout: 5000 });
  const userType = user.data.type;
  if (!["free", "premium"].includes(userType)) {
    return res.status(403).json({ code: "REGISTERED_ONLY", message: "A registered account is required." });
  }
  // REQ-VID-QUOTA-001: refuse before queueing; the start authorization checks again.
  if (userType === "free" && user.data.remaining_operations === 0) {
    return res.status(429).json({ code: "NO_QUOTA", message: "No daily operations remaining." });
  }
  const id = new mongoose.Types.ObjectId();
  const workerToken = crypto.randomBytes(32).toString("hex");
  const directory = path.join(ROOT, String(id));
  const job = await CompressionJob.create({
    _id: id, ...filter(req), runner_id: runnerId, img_id: img._id, quality, user_type: userType,
    worker_token_hash: crypto.createHash("sha256").update(workerToken).digest("hex"),
    source_name: path.basename(img.og_uri),
    input_path: path.join(directory, "source.mp4"), output_path: path.join(directory, "result.mp4"),
  });
  res.status(202).json(view(job));
  notify(job);
  // Download/dispatch is asynchronous; the stored S3 original is never overwritten.
  prepare(job, img, workerToken).catch((e) => console.error("[COMPRESSION]", e.message));
}));

// Worker-only handshake. The per-job secret is never returned by the public API.
router.post("/internal/video-compression/:jobId/:action(start|launch-failed|control|launched)", wrap(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.jobId)) return res.status(404).json({ code: "NOT_FOUND" });
  const token = /^Bearer (.+)$/.exec(req.headers.authorization || "")?.[1];
  try {
    if (req.params.action === "start") {
      const started = await authorizeStart(req.params.jobId, token, req.body?.media);
      publishState(req.params.jobId).catch(() => {});
      return res.json(started);
    }
    if (req.params.action === "control") return res.json(await control(req.params.jobId, token));
    if (req.params.action === "launched") return res.json(await markLaunched(req.params.jobId, token));
    await releaseFailedLaunch(req.params.jobId, token);
    res.json({ released: true });
  } catch (e) {
    if (req.params.action === "start") publishState(req.params.jobId).catch(() => {});
    res.status(e.status || 503).json({ code: e.code || "AUTHORIZATION_FAILED", message: e.message });
  }
}));

router.get(base, access(false), wrap(async (req, res) => {
  const jobs = await CompressionJob.find(filter(req)).sort({ createdAt: -1 }).limit(100);
  res.json(jobs.map(view));
}));

router.get(`${base}/:jobId`, access(false), wrap(async (req, res) => {
  const job = await CompressionJob.findOne({ _id: req.params.jobId, ...filter(req) });
  if (!job) return res.status(404).json({ code: "NOT_FOUND", message: "Job not found." });
  res.set("Cache-Control", "private, no-store").json(view(job));
}));

router.post(`${base}/:jobId/cancel`, access(true), wrap(async (req, res) => {
  // Competes with authorizeStart's queued -> processing claim on this same document.
  const job = await CompressionJob.findOneAndUpdate({
    _id: req.params.jobId, ...filter(req), status: "queued", start_claimed: { $ne: true },
  }, { $set: { status: "cancelled", finished_at: new Date() } }, { new: true })
    .select("+input_path +output_path");
  if (!job) {
    // Do not unlink files that an active encoder may still be using. Once the result is
    // being added to the project (finalizing), completion has won and cancellation is refused.
    const active = await CompressionJob.findOneAndUpdate({
      _id: req.params.jobId, ...filter(req), status: "processing", finalizing: { $ne: true },
    }, { $set: { cancel_requested_at: new Date() } }, { new: true });
    if (active) {
      notify(active);
      return res.status(202).set("Cache-Control", "private, no-store").json(view(active));
    }
    const existing = await CompressionJob.findOne({ _id: req.params.jobId, ...filter(req) });
    if (!existing) return res.status(404).json({ code: "NOT_FOUND", message: "Job not found." });
    return res.status(409).json({ code: "CANNOT_CANCEL", message: "Only queued or processing jobs can be cancelled." });
  }
  // Best effort; an in-flight preparation retries cleanup when its download finishes.
  await fs.promises.rm(job.input_path, { force: true }).catch(() => {});
  await fs.promises.rm(job.output_path, { force: true }).catch(() => {});
  await settle(job._id);
  res.set("Cache-Control", "private, no-store").json(view(job));
}));

router.get(`${base}/:jobId/result`, access(false), wrap(async (req, res) => {
  const job = await CompressionJob.findOne({ _id: req.params.jobId, ...filter(req) }).select("+output_path");
  if (!job) return res.status(404).json({ code: "NOT_FOUND", message: "Job not found." });
  if (job.status !== "completed") return res.status(409).json({ code: "RESULT_NOT_READY", message: "No completed result available." });
  res.set("Cache-Control", "private, no-store");
  if (job.result?.key) {
    // The result is a file of the project: stream it from the existing storage.
    const signed = await get_image_internal_url(String(job.owner_id), String(job.project_id), "src", job.result.key);
    const upstream = await axios.get(signed.data.url, { responseType: "stream", timeout: 60000, validateStatus: () => true });
    if (upstream.status !== 200) {
      upstream.data?.destroy?.();
      return res.status(404).json({ code: "RESULT_MISSING", message: "Result file is unavailable." });
    }
    res.attachment(job.result.name);
    res.type("video/mp4");
    res.on("close", () => upstream.data.destroy());
    return upstream.data.pipe(res);
  }
  // Jobs completed before results were added to the project.
  if (!fs.existsSync(job.output_path)) return res.status(404).json({ code: "RESULT_MISSING", message: "Result file is unavailable." });
  res.download(job.output_path, `${path.parse(job.source_name).name}-${job.quality}.mp4`);
}));

async function removeCopies(job) {
  await fs.promises.rm(job.input_path, { force: true }).catch(() => {});
  await fs.promises.rm(job.output_path, { force: true }).catch(() => {});
}

async function finishCancellation(jobId) {
  // Called only for a terminal worker message: FFmpeg has exited and been reaped.
  const cancelled = await CompressionJob.findOneAndUpdate({
    _id: jobId, status: "processing", cancel_requested_at: { $ne: null },
  }, { $set: { status: "cancelled", finished_at: new Date() }, $unset: { result: 1, error: 1 } }, { new: true })
    .select("+input_path +output_path");
  if (cancelled) {
    await removeCopies(cancelled);
    await settle(jobId);
  }
  return Boolean(cancelled);
}

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    fs.createReadStream(file).on("data", (chunk) => hash.update(chunk))
      .on("end", () => resolve(hash.digest("hex"))).on("error", reject);
  });
}

function resultName(project, sourceName) {
  const stem = sourceName.replace(/\.[^.]+$/, "");
  const taken = new Set((project.imgs || []).map((i) => path.basename(i.og_uri || "")));
  let name = `${stem}-comprimido.mp4`;
  for (let n = 2; taken.has(name); n++) name = `${stem}-comprimido-${n}.mp4`;
  return name;
}

// REQ-VID-STORE-001: the compressed video becomes a new file of the project, deleted with it.
async function storeResult(job, r, size) {
  const project = await Project.findOne({ _id: job.project_id, user_id: job.owner_id });
  if (!project) throw new Error("Project no longer exists");
  const name = resultName(project, job.source_name);
  const data = new FormData();
  data.append("file", fs.createReadStream(job.output_path), { filename: name, contentType: "video/mp4", knownLength: size });
  const resp = await post_image(String(job.owner_id), String(job.project_id), "src", data);
  const key = resp.data.data.imageKey.split("/").pop();
  const sha = await sha256File(job.output_path);
  const folder = `./images/users/${job.owner_id}/projects/${job.project_id}`;
  const imgId = new mongoose.Types.ObjectId();
  const updated = await Project.findOneAndUpdate({ _id: job.project_id, user_id: job.owner_id }, {
    $push: { imgs: {
      _id: imgId, og_uri: `${folder}/src/${name}`, new_uri: `${folder}/out/${name}`, og_img_key: key, og_sha256: sha,
      duration: r.durationSec, width: r.width, height: r.height, mime_type: "video/mp4",
    } },
    $inc: { version: 1 },
  }, { new: true });
  if (!updated) throw new Error("Project no longer exists");
  send_msg_project_op({
    projectId: String(job.project_id), ownerId: String(job.owner_id),
    op: { opId: null, type: "IMAGE_ADDED", actorId: String(job.runner_id || job.owner_id),
      baseVersion: updated.version - 1, newVersion: updated.version, payload: { source: "video_compression" } },
  });
  return { imgId: String(imgId), name, key };
}

async function handleResult(msg) {
  if (!mongoose.isValidObjectId(msg.jobId)) return;
  const job = await CompressionJob.findById(msg.jobId).select("+input_path +output_path");
  if (!job) return;
  if (["completed", "failed", "cancelled"].includes(job.status)) {
    if (job.status === "cancelled" || (job.status === "failed" && msg.status === "failed")) {
      await removeCopies(job);
      await settle(job._id);
    }
    return;
  }
  if (["completed", "failed", "cancelled"].includes(msg.status) && await finishCancellation(job._id)) return;
  if (msg.status === "cancelled") return; // Never accept unsolicited cancellation.
  if (msg.status === "failed") {
    if (msg.error?.code === "NO_CAPACITY") {
      // Capacity refusal is cancellation; any reserved operation is returned.
      const cancelled = await CompressionJob.findOneAndUpdate({
        _id: job._id, status: { $in: ["queued", "processing"] },
      }, { $set: { status: "cancelled", finished_at: new Date(),
        error: { code: "NO_CAPACITY", message: msg.error.message || "Not enough disk space to compress this video." },
      }, $unset: { result: 1 } }, { new: true }).select("+input_path +output_path");
      if (cancelled) {
        await removeCopies(cancelled);
        await settle(job._id);
      }
      return;
    }
    const failed = await fail(job._id, msg.error?.code || "PROCESSING_FAILED", msg.error?.message || "Compression failed.");
    if (failed.matchedCount) {
      await removeCopies(job);
      await settle(job._id);
    } else await finishCancellation(job._id);
    return;
  }
  if (!job.start_claimed) {
    await fail(job._id, "START_NOT_AUTHORIZED", "Compression was not authorized to start.");
    await settle(job._id);
    return;
  }
  if (msg.status === "processing") {
    const progress = Number(msg.progress);
    if (!Number.isFinite(progress)) return;
    const updated = await CompressionJob.updateOne({ _id: job._id, status: { $in: ["queued", "processing"] }, cancel_requested_at: null }, {
      $set: { status: "processing", started_at: job.started_at || new Date() },
      $max: { progress: Math.min(99, Math.max(0, progress)) },
    });
    if (updated.matchedCount) await publishState(job._id);
  } else if (msg.status === "completed") {
    const stat = await fs.promises.stat(job.output_path).catch((e) => {
      if (e.code === "ENOENT") return null;
      throw e;
    });
    if (!stat || !stat.isFile() || !stat.size || !msg.result) {
      const failed = await fail(job._id, "INVALID_RESULT", "Compression produced no valid result.");
      if (failed.matchedCount) {
        await removeCopies(job);
        await settle(job._id);
      } else await finishCancellation(job._id);
      return;
    }
    // From here on a cancellation request is refused: the result is being added to the project.
    const claimed = await CompressionJob.findOneAndUpdate({
      _id: job._id, status: "processing", cancel_requested_at: null, finalizing: { $ne: true },
    }, { $set: { finalizing: true } }, { new: true });
    if (!claimed) {
      await finishCancellation(job._id);
      return;
    }
    const r = msg.result;
    let stored;
    try {
      stored = await storeResult(job, r, stat.size);
    } catch (e) {
      console.error("[COMPRESSION] Unable to add the result to the project:", e.message);
      await CompressionJob.updateOne({ _id: job._id, status: "processing" }, { $set: {
        status: "failed", finished_at: new Date(),
        error: { code: "STORE_FAILED", message: "Unable to add the compressed video to the project." },
      } });
      await removeCopies(job);
      await settle(job._id);
      return;
    }
    await CompressionJob.updateOne({ _id: job._id, status: "processing" }, {
      $set: {
        status: "completed", progress: 100, finished_at: new Date(),
        result: { sizeBytes: stat.size, originalSizeBytes: r.originalSizeBytes,
          durationSec: r.durationSec, width: r.width, height: r.height,
          reductionPercent: r.reductionPercent, ...stored },
      },
    });
    // The project now holds the result: no private copy is kept.
    await removeCopies(job);
    await publishState(job._id);
  }
}

function startCompressionConsumer() { mq.consumeResults(handleResult); }
module.exports = { router, startCompressionConsumer };
