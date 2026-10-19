// Internal Project Service routes, following /:user/:project/compression.
const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const path = require("path");
const SubtitleJob = require("../models/subtitleJob");
const Project = require("../models/project");
const { checkSharePermission, requireEditPermission } = require("../middleware/shareAuth");
const mq = require("../utils/subtitles_mq");
const { get_image_public_url } = require("../utils/imageStorage");
const router = express.Router();
const base = "/:user/:project/subtitles";
const wrap = fn => (req, res) => Promise.resolve(fn(req, res)).catch(e => {
  console.error("[SUBTITLES]", e.code || "INTERNAL", e.message);
  res.status(e.status || 500).json({ code: e.status ? e.code : "INTERNAL", message: e.status ? e.message : "Não foi possível tratar o pedido de legendas.", jobId: e.jobId });
});

// Verify the JWT locally, as compression does. x-caller-id alone is not proof
// of identity; the authenticated JWT's user is always the quota payer/runner.
function authenticate(req, res, next) {
  try {
    const bearer = /^Bearer (.+)$/.exec(req.headers.authorization || "");
    if (!bearer || !process.env.JWT_SECRET_KEY) throw new Error("Missing credentials");
    const identity = jwt.verify(bearer[1], process.env.JWT_SECRET_KEY);
    if (!mongoose.isValidObjectId(identity.id)) throw new Error("Invalid identity");
    req.subtitleRunner = String(identity.id);
    if (![req.params.user, req.params.project].every(mongoose.isValidObjectId)) return res.status(404).json({ code: "NOT_FOUND" });
    if (req.params.jobId && !/^[0-9a-f-]{36}$/.test(req.params.jobId)) return res.status(404).json({ code: "NOT_FOUND" });
    if (!req.query.share && req.subtitleRunner !== req.params.user) return res.status(403).json({ code: "FORBIDDEN", message: "Sem acesso a este projeto." });
    next();
  } catch (_) { res.status(401).json({ code: "UNAUTHENTICATED", message: "É necessário um JWT válido." }); }
}

async function context(req) {
  const project = await Project.findOne({ _id: req.params.project, user_id: req.params.user });
  if (!project) throw mq.error(404, "NOT_FOUND", "Projeto não encontrado.");
  return project;
}

async function findJob(req) {
  const project = await context(req);
  const job = await SubtitleJob.findOne({ job_id: req.params.jobId, owner_id: req.params.user, project_id: req.params.project });
  if (!job || job.orphaned || !project.imgs.some(img => String(img._id) === String(job.img_id) && img.og_img_key === job.source_key)) {
    throw mq.error(404, "NOT_FOUND", "Job ou vídeo de origem não encontrado.");
  }
  return job;
}

function view(job) {
  return {
    jobId: job.job_id, projectId: String(job.project_id), imgId: String(job.img_id), runnerId: String(job.runner_id),
    language: job.language, model: job.model, status: job.status, phase: job.phase,
    operation: job.current_operation, requestId: job.current_request_id,
    cancellationRequested: Boolean(job.cancel_requested_at),
    segments: ["transcribed", "completed"].includes(job.status) ? job.segments.map(s => ({ text: s.text, start: s.start, end: s.end })) : undefined,
    duration: job.duration,
    result: job.status === "completed" && !job.orphaned ? job.result : null,
    error: job.error?.code ? job.error : null,
    quota: { charged: job.quota.charged, refundState: job.quota.refund_state,
      reconciliationRequired: job.quota.reconciliation_required, reconciliationReason: job.quota.reconciliation_reason },
    createdAt: job.created_at, updatedAt: job.updated_at,
  };
}

router.post(base, authenticate, checkSharePermission, requireEditPermission, wrap(async (req, res) => {
  const body = req.body || {};
  if (!body || Array.isArray(body) || Object.keys(body).some(k => !["imgId", "language", "model"].includes(k)) ||
      !mongoose.isValidObjectId(body.imgId) || typeof body.language !== "string" || !/^[a-z]{2,3}$/.test(body.language) ||
      body.language === "auto" || !["base", "small"].includes(body.model || "base")) {
    throw mq.error(400, "INVALID_REQUEST", "Indique imgId, um idioma explícito (ex.: pt) e, opcionalmente, model base ou small.");
  }
  const project = await context(req);
  const img = project.imgs.id(body.imgId);
  if (!img) throw mq.error(404, "NOT_FOUND", "Vídeo não encontrado no projeto.");
  if (img.mime_type !== "video/mp4" && !/\.mp4$/i.test(img.og_uri)) throw mq.error(400, "UNSUPPORTED_VIDEO", "Só são suportados vídeos MP4.");
  const user = await mq.account(req.subtitleRunner);
  await SubtitleJob.init();
  const jobId = crypto.randomUUID();
  let job;
  try {
    job = await SubtitleJob.create({ job_id: jobId, owner_id: req.params.user, project_id: req.params.project,
      img_id: img._id, runner_id: req.subtitleRunner, runner_type: user.type,
      source_name: path.basename(img.og_uri), source_key: img.og_img_key, source_sha256: img.og_sha256,
      language: body.language, model: body.model || "base", current_request_id: `${jobId}:transcribe`,
      quota: { user_id: req.subtitleRunner }, ...mq.paths(jobId) });
  } catch (e) {
    if (e.code === 11000) throw mq.error(409, "BUSY", "Já existe um pedido de legendas ativo para este vídeo.");
    throw e;
  }
  try { job = await mq.reserve(job); }
  catch (e) { e.jobId = jobId; await mq.fail(jobId, e.code || "QUOTA_UNAVAILABLE", e.message); throw e; }
  res.status(202).json(view(job));
  // Only the small authorization/quota handshake precedes 202. Download and
  // Rabbit dispatch are recoverable background work, never STT in this service.
  mq.dispatch(jobId).catch(e => console.error("[SUBTITLES] dispatch:", e.message));
}));

router.get(`${base}/:jobId`, authenticate, checkSharePermission, wrap(async (req, res) => {
  const job = await findJob(req);
  const response = view(job);
  if (response.result?.key) {
    try {
      const signed = await get_image_public_url(String(job.owner_id), String(job.project_id), "out", response.result.key);
      response.result = { ...job.toObject().result, url: signed.data.url };
    } catch (_) {
      throw mq.error(503, "STORAGE_UNAVAILABLE", "Não foi possível obter a ligação para descarregar as legendas. Tente novamente.");
    }
  }
  res.set("Cache-Control", "private, no-store").json(response);
}));

router.post(`${base}/:jobId/confirm`, authenticate, checkSharePermission, requireEditPermission, wrap(async (req, res) => {
  const existing = await findJob(req);
  if (Object.keys(req.body || {}).length) throw mq.error(400, "INVALID_REQUEST", "A confirmação usa exclusivamente os segmentos persistidos.");
  if (existing.status !== "transcribed" || existing.cancel_requested_at) throw mq.error(409, "NOT_TRANSCRIBED", "Este job não pode ser confirmado.");
  // Validate the exact stored payload before the atomic confirmation claim.
  mq.payload({ ...existing.toObject(), current_operation: "generate_srt" });
  const job = await SubtitleJob.findOneAndUpdate({ _id: existing._id, status: "transcribed", cancel_requested_at: null }, {
    $set: { status: "queued", phase: "queued", current_operation: "generate_srt",
      current_request_id: `${existing.job_id}:generate_srt`, operation_requested_at: new Date(),
      dispatch_state: "pending", dispatched_at: null, started_at: null, worker_terminal_at: null },
    $unset: { dispatch_claim: 1, dispatch_until: 1 },
  }, { new: true });
  if (!job) throw mq.error(409, "ALREADY_CLAIMED", "A confirmação ou o cancelamento já foi aceite.");
  res.status(202).json(view(job));
  mq.dispatch(job.job_id).catch(e => console.error("[SUBTITLES] confirmação:", e.message));
}));

for (const action of ["reject", "cancel"]) {
  router.post(`${base}/:jobId/${action}`, authenticate, checkSharePermission, requireEditPermission, wrap(async (req, res) => {
    const job = await findJob(req);
    const updated = await mq.requestCancel(job.job_id, action === "reject" ? "rejected" : "user");
    res.status(updated.status === "cancelled" ? 200 : 202).json(view(updated));
  }));
}

module.exports = { router, _internal: { view } };
