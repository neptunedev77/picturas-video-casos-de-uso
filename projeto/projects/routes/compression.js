const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { httpsAgent } = require("../utils/httpsAgent");
const { pipeline } = require("stream/promises");
const CompressionJob = require("../models/compressionJob");
const Project = require("../models/project");
const { get_image_internal_url } = require("../utils/imageStorage");
const mq = require("../utils/compression_mq");
const { authorizeStart, releaseFailedLaunch } = require("../services/compressionAccess");
const router = express.Router();
const base = "/:user/:project/compression";
const ROOT = path.resolve("images/video_compression");
const QUALITIES = ["high", "balanced", "small"];

function owner(req, res, next) {
  try {
    const token = /^Bearer (.+)$/.exec(req.headers.authorization || "");
    if (!token) throw new Error("Missing token");
    const payload = jwt.verify(token[1], process.env.JWT_SECRET_KEY);
    if (String(payload.id) !== req.params.user || req.query.share || req.query.owner) {
      return res.status(403).json({ code: "OWNER_ONLY", message: "Compression is owner-only." });
    }
    if (![req.params.user, req.params.project, req.params.jobId].filter(Boolean).every(mongoose.isValidObjectId)) {
      return res.status(404).json({ code: "NOT_FOUND", message: "Resource not found." });
    }
    // A valid JWT for the URL's user is insufficient if the project belongs to someone else.
    Project.exists({ _id: req.params.project, user_id: req.params.user })
      .then((project) => project ? next() : res.status(404).json({ code: "NOT_FOUND", message: "Project not found." }))
      .catch(() => res.status(503).json({ code: "PROJECTS_UNAVAILABLE", message: "Unable to verify project ownership." }));
  } catch (_) {
    res.status(401).json({ code: "UNAUTHENTICATED", message: "A valid JWT is required." });
  }
}

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const filter = (req) => ({ owner_id: req.params.user, project_id: req.params.project });
function view(job) {
  return {
    _id: job._id, imgId: job.img_id, quality: job.quality, profileVersion: job.profile_version,
    status: job.status, progress: job.progress, sourceName: job.source_name,
    result: job.status === "completed" ? job.result : null,
    error: job.error || null, createdAt: job.createdAt, updatedAt: job.updatedAt,
  };
}

async function fail(jobId, code, message) {
  await CompressionJob.updateOne({ _id: jobId, status: { $in: ["queued", "processing"] } }, {
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
    await mq.sendRequest({
      jobId: String(job._id), quality: job.quality, userType: job.user_type,
      inputPath: job.input_path, outputPath: job.output_path,
      workerToken,
    });
  } catch (e) {
    console.error("[COMPRESSION] Preparation failed:", e.message);
    await fail(job._id, "PREPARATION_FAILED", "Unable to prepare the video for compression.");
    await fs.promises.rm(job.input_path, { force: true }).catch(() => {});
  }
}

router.post(base, owner, wrap(async (req, res) => {
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
  const user = await axios.get(`https://users:10001/${req.params.user}`, { httpsAgent, timeout: 5000 });
  const userType = user.data.type;
  if (!["free", "premium"].includes(userType)) {
    return res.status(403).json({ code: "REGISTERED_ONLY", message: "A registered account is required." });
  }
  const id = new mongoose.Types.ObjectId();
  const workerToken = crypto.randomBytes(32).toString("hex");
  const directory = path.join(ROOT, String(id));
  const job = await CompressionJob.create({
    _id: id, ...filter(req), img_id: img._id, quality, user_type: userType,
    worker_token_hash: crypto.createHash("sha256").update(workerToken).digest("hex"),
    source_name: path.basename(img.og_uri),
    input_path: path.join(directory, "source.mp4"), output_path: path.join(directory, "result.mp4"),
  });
  res.status(202).json(view(job));
  // Download/dispatch is asynchronous; the stored S3 original is never overwritten.
  prepare(job, img, workerToken).catch((e) => console.error("[COMPRESSION]", e.message));
}));

// Worker-only handshake. The per-job secret is never returned by the public API.
router.post("/internal/video-compression/:jobId/:action(start|launch-failed)", wrap(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.jobId)) return res.status(404).json({ code: "NOT_FOUND" });
  const token = /^Bearer (.+)$/.exec(req.headers.authorization || "")?.[1];
  try {
    if (req.params.action === "start") {
      return res.json(await authorizeStart(req.params.jobId, token, req.body?.media));
    }
    await releaseFailedLaunch(req.params.jobId, token);
    res.json({ released: true });
  } catch (e) {
    res.status(e.status || 503).json({ code: e.code || "AUTHORIZATION_FAILED", message: e.message });
  }
}));

router.get(base, owner, wrap(async (req, res) => {
  const jobs = await CompressionJob.find(filter(req)).sort({ createdAt: -1 }).limit(100);
  res.json(jobs.map(view));
}));

router.get(`${base}/:jobId`, owner, wrap(async (req, res) => {
  const job = await CompressionJob.findOne({ _id: req.params.jobId, ...filter(req) });
  if (!job) return res.status(404).json({ code: "NOT_FOUND", message: "Job not found." });
  res.set("Cache-Control", "private, no-store").json(view(job));
}));

router.get(`${base}/:jobId/result`, owner, wrap(async (req, res) => {
  const job = await CompressionJob.findOne({ _id: req.params.jobId, ...filter(req) }).select("+output_path");
  if (!job) return res.status(404).json({ code: "NOT_FOUND", message: "Job not found." });
  if (job.status !== "completed") return res.status(409).json({ code: "RESULT_NOT_READY", message: "No completed result available." });
  if (!fs.existsSync(job.output_path)) return res.status(404).json({ code: "RESULT_MISSING", message: "Result file is unavailable." });
  const name = `${path.parse(job.source_name).name}-${job.quality}.mp4`;
  res.set("Cache-Control", "private, no-store");
  res.download(job.output_path, name);
}));

async function handleResult(msg) {
  if (!mongoose.isValidObjectId(msg.jobId)) return;
  const job = await CompressionJob.findById(msg.jobId).select("+input_path +output_path");
  if (!job) return;
  if (["completed", "failed"].includes(job.status)) {
    if (job.status === "failed" && msg.status === "failed") {
      await fs.promises.rm(job.input_path, { force: true }).catch(() => {});
      await fs.promises.rm(job.output_path, { force: true }).catch(() => {});
    }
    return;
  }
  if (msg.status === "failed") {
    await fail(job._id, msg.error?.code || "PROCESSING_FAILED", msg.error?.message || "Compression failed.");
    await fs.promises.rm(job.input_path, { force: true }).catch(() => {});
    await fs.promises.rm(job.output_path, { force: true }).catch(() => {});
    return;
  }
  if (!job.start_claimed) {
    await fail(job._id, "START_NOT_AUTHORIZED", "Compression was not authorized to start.");
    return;
  }
  if (msg.status === "processing") {
    const progress = Number(msg.progress);
    if (!Number.isFinite(progress)) return;
    await CompressionJob.updateOne({ _id: job._id, status: { $in: ["queued", "processing"] } }, {
      $set: { status: "processing", started_at: job.started_at || new Date() },
      $max: { progress: Math.min(99, Math.max(0, progress)) },
    });
  } else if (msg.status === "completed") {
    const stat = await fs.promises.stat(job.output_path).catch((e) => {
      if (e.code === "ENOENT") return null;
      throw e;
    });
    if (!stat || !stat.isFile() || !stat.size || !msg.result) {
      await fail(job._id, "INVALID_RESULT", "Compression produced no valid result.");
      return;
    }
    const r = msg.result;
    await CompressionJob.updateOne({ _id: job._id, status: { $in: ["queued", "processing"] } }, {
      $set: {
        status: "completed", progress: 100, finished_at: new Date(),
        result: { sizeBytes: stat.size, originalSizeBytes: r.originalSizeBytes,
          durationSec: r.durationSec, width: r.width, height: r.height,
          reductionPercent: r.reductionPercent },
      },
    });
    await fs.promises.rm(job.input_path, { force: true }).catch(() => {});
  }
}

function startCompressionConsumer() { mq.consumeResults(handleResult); }
module.exports = { router, startCompressionConsumer };
