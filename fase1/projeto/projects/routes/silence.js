// UC-VID-001: Remover silêncios e pausas de um vídeo.
//
// Fluxo: analisar (não gasta operações) -> rever troços no browser -> aplicar cortes (1 operação no free).
// O trabalho pesado é feito pelo serviço Tools/silence_removal, através do RabbitMQ.
//
//   GET    /:user/:project/silence/:img           estado atual (análise, revisão, progresso, resultado)
//   POST   /:user/:project/silence/:img/analyze   { options, confirmDiscard }
//   PUT    /:user/:project/silence/:img/review    { segments: [{start, end, selected}] }
//   POST   /:user/:project/silence/:img/apply     { segments?, confirmLargeRemoval }
//   POST   /:user/:project/silence/:img/cancel
const express = require("express");
const router = express.Router();
const axios = require("axios");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const FormData = require("form-data");
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

const Project = require("../controllers/project");
const ProjectModel = require("../models/project");
const SilenceJob = require("../models/silenceJob");
const { getCallerId } = require("../utils/caller");
const { getUserType } = require("../utils/presence");
const { httpsAgent } = require("../utils/httpsAgent");
const { get_image_internal_url, post_image } = require("../utils/imageStorage");
const { send_msg_project_op } = require("../utils/project_msg");
const { checkSharePermission, requireEditPermission } = require("../middleware/shareAuth");
const mq = require("../utils/silence_mq");

const USERS_MS = process.env.USERS_MS || "https://users:10001/";

// --- Opções de deteção (iguais às do serviço silence_removal) -----------------
const RANGES = {
  thresholdDb: { min: -60, max: -20, unit: "dB", label: "sensibilidade" },
  minPauseSec: { min: 0.3, max: 5, unit: "s", label: "duração mínima da pausa" },
  marginMs: { min: 0, max: 1000, unit: "ms", label: "margem" },
};
const PROFILES = {
  suave: { thresholdDb: -40, minPauseSec: 1.0, marginMs: 250 },
  equilibrado: { thresholdDb: -35, minPauseSec: 0.7, marginMs: 150 },
  agressivo: { thresholdDb: -30, minPauseSec: 0.4, marginMs: 80 },
};
const LARGE_REMOVAL_PCT = 80; // FA8
const BUSY = ["queued", "analyzing", "processing"];

class ApiError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

function sendError(res, e) {
  if (e instanceof ApiError) {
    return res.status(e.status).jsonp({ code: e.code, message: e.message, ...e.extra });
  }
  console.error("[SILENCE] erro inesperado:", e);
  return res.status(500).jsonp({ code: "INTERNAL", message: "Ocorreu um erro inesperado. Tente novamente." });
}

function validateOptions(raw = {}) {
  const profile = String(raw.profile || "equilibrado").toLowerCase();
  if (!PROFILES[profile]) {
    throw new ApiError(400, "INVALID_OPTIONS", "Perfil desconhecido. Use Suave, Equilibrado ou Agressivo.");
  }
  const out = { profile, backgroundMusic: Boolean(raw.backgroundMusic) };
  for (const [key, r] of Object.entries(RANGES)) {
    const v = raw[key] === undefined || raw[key] === null || raw[key] === "" ? PROFILES[profile][key] : Number(raw[key]);
    if (!Number.isFinite(v) || v < r.min || v > r.max) {
      throw new ApiError(
        400,
        "INVALID_OPTIONS",
        `O valor de ${r.label} tem de estar entre ${r.min} e ${r.max} ${r.unit}.`,
        { field: key }
      );
    }
    out[key] = v;
  }
  return out;
}

function validateSegments(raw, durationSec) {
  if (!Array.isArray(raw)) throw new ApiError(400, "INVALID_SEGMENTS", "A lista de troços é inválida.");
  const segs = raw.map((s) => ({
    start: Number(s.start),
    end: Number(s.end),
    selected: s.selected === undefined ? true : Boolean(s.selected),
  }));
  segs.sort((a, b) => a.start - b.start);
  segs.forEach((s, i) => {
    if (!Number.isFinite(s.start) || !Number.isFinite(s.end) || s.start < 0 || s.end <= s.start) {
      throw new ApiError(400, "INVALID_SEGMENTS", `O troço ${i + 1} é inválido.`);
    }
    if (s.end > durationSec + 0.05) {
      throw new ApiError(400, "INVALID_SEGMENTS", `O troço ${i + 1} ultrapassa a duração do vídeo.`);
    }
    if (i > 0 && s.start < segs[i - 1].end) {
      throw new ApiError(400, "INVALID_SEGMENTS", `Os troços ${i} e ${i + 1} sobrepõem-se.`);
    }
  });
  return segs.map((s) => ({ ...s, end: Math.min(s.end, durationSec) }));
}

function savings(durationSec, review) {
  const removed = review.filter((s) => s.selected).reduce((acc, s) => acc + (s.end - s.start), 0);
  return {
    originalSec: +durationSec.toFixed(3),
    finalSec: +Math.max(0, durationSec - removed).toFixed(3),
    removedSec: +removed.toFixed(3),
    removedPct: durationSec > 0 ? +((removed / durationSec) * 100).toFixed(1) : 0,
  };
}

function isVideo(img) {
  return img.mime_type === "video/mp4" || /\.mp4$/i.test(img.og_uri || "");
}

function workDir(ownerId, projectId, imgId) {
  return `./images/users/${ownerId}/projects/${projectId}/silence/${imgId}`;
}

function safeRemove(p) {
  if (!p) return;
  // só apaga ficheiros dentro da pasta de imagens partilhada
  const abs = path.resolve(p);
  if (!abs.startsWith(path.resolve("./images") + path.sep)) return;
  fs.rm(abs, { force: true }, () => {});
}

function view(job, extra = {}) {
  if (!job) return { status: "none", profiles: PROFILES, ranges: RANGES, ...extra };
  const duration = job.analysis?.video?.durationSec || 0;
  return {
    status: job.status,
    phase: job.phase,
    progress: job.progress,
    jobId: job.current_job_id,
    options: job.options,
    analysis: job.analysis,
    review: job.review,
    reviewEdited: job.review_edited,
    savings: job.analysis ? savings(duration, job.review) : null,
    result: job.result,
    error: job.error,
    updatedAt: job.updated_at,
    profiles: PROFILES,
    ranges: RANGES,
    ...extra,
  };
}

function notify(job) {
  return mq.sendClientUpdate(job.runner_id, {
    jobId: job.current_job_id,
    projectId: String(job.project_id),
    imgId: String(job.img_id),
    status: job.status,
    phase: job.phase,
    progress: job.progress,
    error: job.error || null,
  });
}

async function save(job, fields) {
  Object.assign(job, fields, { updated_at: new Date(), last_used_at: new Date() });
  await job.save();
  return job;
}

// --- serviço de utilizadores ---------------------------------------------------
async function usersCall(method, url) {
  return axios({ method, url: `${USERS_MS}${url}`, httpsAgent, timeout: 5000, validateStatus: () => true });
}

async function getAnalysesStatus(userId) {
  try {
    const r = await usersCall("get", `${userId}/silence/analyses`);
    return r.status === 200 ? r.data : null;
  } catch (_) {
    return null;
  }
}

async function reserveAnalysis(userId) {
  const r = await usersCall("post", `${userId}/silence/analyses/reserve`);
  if (r.status === 200) return r.data;
  if (r.status === 429) {
    throw new ApiError(429, "DAILY_ANALYSES_LIMIT",
      `Atingiu o limite de ${r.data?.limit ?? 15} análises por dia do plano Gratuito. ` +
      "As revisões já guardadas continuam acessíveis; volte amanhã ou passe para o plano Premium.", r.data);
  }
  if (r.status === 403) {
    throw new ApiError(403, "ANONYMOUS_NOT_ALLOWED", "A remoção de silêncios está disponível apenas para utilizadores registados.");
  }
  throw new ApiError(502, "USERS_UNAVAILABLE", "Não foi possível verificar o limite de análises. Tente novamente.");
}

async function refundAnalysis(userId) {
  try { await usersCall("post", `${userId}/silence/analyses/refund`); } catch (e) {
    console.error("[SILENCE] falha a devolver análise:", e.message);
  }
}

async function reserveOperation(userId) {
  const r = await usersCall("get", `${userId}/process/1`);
  if (r.status === 200) return;
  if (r.status === 701) {
    throw new ApiError(429, "NO_QUOTA",
      "Atingiu o limite diário de operações. A revisão ficou guardada: pode aplicar os cortes amanhã " +
      "ou passar para o plano Premium.");
  }
  throw new ApiError(502, "USERS_UNAVAILABLE", "Não foi possível verificar a sua quota. Tente novamente.");
}

async function refundOperation(userId) {
  try { await usersCall("post", `${userId}/process/refund/1`); } catch (e) {
    console.error("[SILENCE] falha a devolver operação:", e.message);
  }
}

// --- ficheiros -------------------------------------------------------------------
async function downloadSource(ownerId, projectId, img, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const resp = await get_image_internal_url(ownerId, projectId, "src", img.og_img_key);
  const file = await axios.get(resp.data.url, { responseType: "stream" });
  await new Promise((resolve, reject) => {
    const w = fs.createWriteStream(dest);
    w.on("finish", resolve);
    w.on("error", reject);
    file.data.on("error", reject);
    file.data.pipe(w);
  });
}

function sha256File(p) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash("sha256");
    fs.createReadStream(p).on("data", (d) => h.update(d)).on("end", () => resolve(h.digest("hex"))).on("error", reject);
  });
}

function resultName(project, sourceName) {
  const base = sourceName.replace(/\.[^.]+$/, "");
  const taken = new Set((project.imgs || []).map((i) => path.basename(i.og_uri)));
  let name = `${base}-sem-silencios.mp4`;
  for (let n = 2; taken.has(name); n++) name = `${base}-sem-silencios-${n}.mp4`;
  return name;
}

// --- carregar contexto comum ------------------------------------------------------
async function loadContext(req) {
  const { user: ownerId, project: projectId, img: imgId } = req.params;
  if (!mongoose.isValidObjectId(projectId) || !mongoose.isValidObjectId(imgId)) {
    throw new ApiError(404, "NOT_FOUND", "Vídeo não encontrado.");
  }
  const project = await Project.getOne(ownerId, projectId);
  if (!project) throw new ApiError(404, "NOT_FOUND", "Projeto não encontrado.");
  const img = (project.imgs || []).find((i) => String(i._id) === String(imgId));
  if (!img) throw new ApiError(404, "NOT_FOUND", "Vídeo não encontrado no projeto.");
  if (!isVideo(img)) throw new ApiError(400, "NOT_A_VIDEO", "A remoção de silêncios só se aplica a vídeos.");
  const job = await SilenceJob.findOne({ project_id: projectId, img_id: imgId });
  const runnerId = getCallerId(req) || ownerId;
  return { ownerId, projectId, imgId, project, img, job, runnerId };
}

// --- rotas -----------------------------------------------------------------------
router.get("/:user/:project/silence/:img", checkSharePermission, async (req, res) => {
  try {
    const ctx = await loadContext(req);
    if (ctx.job) {
      ctx.job.last_used_at = new Date();
      await ctx.job.save();
    }
    const analyses = await getAnalysesStatus(ctx.runnerId);
    return res.status(200).jsonp(view(ctx.job, { analyses }));
  } catch (e) {
    return sendError(res, e);
  }
});

router.post("/:user/:project/silence/:img/analyze", checkSharePermission, requireEditPermission, async (req, res) => {
  let reserved = false;
  let runnerId = null;
  try {
    const options = validateOptions(req.body?.options || {});
    const ctx = await loadContext(req);
    runnerId = ctx.runnerId;
    let job = ctx.job;

    if (job && BUSY.includes(job.status)) {
      throw new ApiError(409, "BUSY", "Já existe uma análise ou um processamento em curso para este vídeo.");
    }
    // FA3 / REQ-VID-SIL-014: avisar antes de perder os ajustes manuais
    if (job && job.review_edited && !req.body?.confirmDiscard) {
      throw new ApiError(409, "REVIEW_WILL_BE_LOST",
        "Os ajustes manuais feitos na revisão serão perdidos se analisar de novo. Confirme para continuar.");
    }

    const userType = await getUserType(runnerId);
    if (userType === "anonymous") {
      throw new ApiError(403, "ANONYMOUS_NOT_ALLOWED", "A remoção de silêncios está disponível apenas para utilizadores registados.");
    }

    await reserveAnalysis(runnerId);
    reserved = true;

    const jobId = uuidv4();
    const sourceName = path.basename(ctx.img.og_uri);
    const localInput = `${workDir(ctx.ownerId, ctx.projectId, ctx.imgId)}/input-${jobId}.mp4`;
    try {
      await downloadSource(ctx.ownerId, ctx.projectId, ctx.img, localInput);
    } catch (_) {
      throw new ApiError(502, "SOURCE_UNAVAILABLE", "Não foi possível obter o vídeo do armazenamento. Tente novamente.");
    }

    const fields = {
      runner_id: runnerId,
      runner_type: userType || "free",
      status: "queued",
      queued_at: new Date(),
      started_at: null,
      phase: "analyze",
      progress: 0,
      current_job_id: jobId,
      source_name: sourceName,
      local_input: localInput,
      local_output: null,
      options,
      analysis: null,
      review: [],
      review_edited: false,
      op_charged: false,
      result: null,
      error: null,
    };
    if (job) {
      safeRemove(job.local_input);
      await save(job, fields);
    } else {
      job = new SilenceJob({ owner_id: ctx.ownerId, project_id: ctx.projectId, img_id: ctx.imgId, ...fields });
      await job.save();
    }

    try {
      await mq.sendRequest({
        messageId: `silence-analyze-${jobId}`,
        jobId,
        procedure: "silence_analyze",
        userId: String(runnerId),
        userType: userType || "free",
        parameters: { inputVideoURI: localInput, options },
      }, userType);
    } catch (e) {
      console.error("[SILENCE] falha a colocar análise na fila:", e.message);
      await save(job, { status: "failed", current_job_id: null, error: {
        code: "QUEUE_UNAVAILABLE", message: "O serviço de processamento não está disponível. Tente novamente." } });
      safeRemove(localInput);
      throw new ApiError(503, "QUEUE_UNAVAILABLE", "O serviço de processamento não está disponível. Tente novamente.");
    }
    reserved = false; // a partir daqui a devolução é feita pelo tratamento da resposta

    notify(job);
    console.log(`[SILENCE][ANALYZE] job=${jobId} img=${ctx.imgId} runner=${runnerId} (${userType})`);
    return res.status(202).jsonp(view(job));
  } catch (e) {
    if (reserved && runnerId) await refundAnalysis(runnerId);
    return sendError(res, e);
  }
});

router.put("/:user/:project/silence/:img/review", checkSharePermission, requireEditPermission, async (req, res) => {
  try {
    const { job } = await loadContext(req);
    if (!job || !job.analysis) throw new ApiError(404, "NO_ANALYSIS", "Ainda não existe uma análise deste vídeo.");
    if (BUSY.includes(job.status)) throw new ApiError(409, "BUSY", "Há um pedido em curso para este vídeo.");
    const review = validateSegments(req.body?.segments, job.analysis.video.durationSec);
    await save(job, { review, review_edited: true });
    return res.status(200).jsonp(view(job));
  } catch (e) {
    return sendError(res, e);
  }
});

router.post("/:user/:project/silence/:img/apply", checkSharePermission, requireEditPermission, async (req, res) => {
  let charged = false;
  let runnerId = null;
  try {
    const ctx = await loadContext(req);
    runnerId = ctx.runnerId;
    const job = ctx.job;
    if (!job || !job.analysis) throw new ApiError(404, "NO_ANALYSIS", "Analise o vídeo antes de aplicar os cortes.");
    if (BUSY.includes(job.status)) throw new ApiError(409, "BUSY", "Já existe um pedido em curso para este vídeo.");

    const duration = job.analysis.video.durationSec;
    if (Array.isArray(req.body?.segments)) {
      const review = validateSegments(req.body.segments, duration);
      // guardar já a revisão: se faltar quota fica disponível para depois (exceção sem quota)
      const edited = job.review_edited || JSON.stringify(review) !== JSON.stringify(job.review.map((s) => ({
        start: s.start, end: s.end, selected: s.selected })));
      await save(job, { review, review_edited: edited });
    }

    const selected = job.review.filter((s) => s.selected);
    if (selected.length === 0) {
      throw new ApiError(400, "NO_SEGMENTS_SELECTED", "Selecione pelo menos um troço para remover.");
    }
    const sv = savings(duration, job.review);
    if (sv.removedPct > LARGE_REMOVAL_PCT && !req.body?.confirmLargeRemoval) {
      throw new ApiError(409, "CONFIRM_LARGE_REMOVAL",
        `Os troços selecionados representam ${sv.removedPct}% do vídeo. Confirme que quer remover tanto.`,
        { removedPct: sv.removedPct });
    }

    const userType = await getUserType(runnerId);
    if (userType === "anonymous") {
      throw new ApiError(403, "ANONYMOUS_NOT_ALLOWED", "A remoção de silêncios está disponível apenas para utilizadores registados.");
    }
    // RN1 / REQ-VID-SIL-017/018: free gasta 1 operação; premium não gasta
    if (userType !== "premium") {
      await reserveOperation(runnerId);
      charged = true;
    }

    const jobId = uuidv4();
    const dir = workDir(ctx.ownerId, ctx.projectId, ctx.imgId);
    const localInput = `${dir}/input-${jobId}.mp4`;
    const localOutput = `${dir}/output-${jobId}.mp4`;
    try {
      await downloadSource(ctx.ownerId, ctx.projectId, ctx.img, localInput);
    } catch (_) {
      throw new ApiError(502, "SOURCE_UNAVAILABLE", "Não foi possível obter o vídeo do armazenamento. Tente novamente.");
    }

    await save(job, {
      runner_id: runnerId,
      runner_type: userType || "free",
      status: "queued",
      queued_at: new Date(),
      started_at: null,
      phase: "apply",
      progress: 0,
      current_job_id: jobId,
      local_input: localInput,
      local_output: localOutput,
      op_charged: charged,
      result: null,
      error: null,
    });

    try {
      await mq.sendRequest({
        messageId: `silence-apply-${jobId}`,
        jobId,
        procedure: "silence_apply",
        userId: String(runnerId),
        userType: userType || "free",
        parameters: {
          inputVideoURI: localInput,
          outputVideoURI: localOutput,
          segments: selected.map((s) => ({ start: s.start, end: s.end })),
        },
      }, userType);
    } catch (e) {
      console.error("[SILENCE] falha a colocar aplicação na fila:", e.message);
      await save(job, { status: "analyzed", current_job_id: null, op_charged: false });
      safeRemove(localInput);
      throw new ApiError(503, "QUEUE_UNAVAILABLE", "O serviço de processamento não está disponível. Tente novamente.");
    }
    charged = false; // devolução passa a ser feita no tratamento da resposta / cancelamento

    notify(job);
    console.log(`[SILENCE][APPLY] job=${jobId} img=${ctx.imgId} troços=${selected.length} ` +
      `remove=${sv.removedSec}s runner=${runnerId} (${userType})`);
    return res.status(202).jsonp(view(job));
  } catch (e) {
    if (charged && runnerId) await refundOperation(runnerId);
    return sendError(res, e);
  }
});

router.post("/:user/:project/silence/:img/cancel", checkSharePermission, requireEditPermission, async (req, res) => {
  try {
    const { job } = await loadContext(req);
    if (!job || !BUSY.includes(job.status)) {
      throw new ApiError(409, "NOTHING_TO_CANCEL", "Não há nenhum pedido em curso para cancelar.");
    }
    const jobId = job.current_job_id;
    mq.sendCancel(jobId).catch((e) => console.error("[SILENCE] falha a enviar cancelamento:", e.message));
    // apagar os ficheiros temporários só depois de o serviço ter recebido o cancelamento
    const leftovers = [job.local_input, job.local_output];
    setTimeout(() => leftovers.forEach(safeRemove), 5000);

    if (job.phase === "analyze") {
      // FA6: descartar resultados parciais e voltar às opções; a análise não conta
      await refundAnalysis(job.runner_id);
      await save(job, { status: "none", progress: 0, current_job_id: null, analysis: null, review: [],
        review_edited: false, local_input: null, error: null });
    } else {
      // FA7 / REQ-VID-SIL-020: voltar à revisão intacta e devolver a operação
      if (job.op_charged) await refundOperation(job.runner_id);
      await save(job, { status: "analyzed", progress: 0, current_job_id: null, op_charged: false,
        local_input: null, local_output: null, error: null });
    }
    console.log(`[SILENCE][CANCEL] job=${jobId}`);
    notify(job);
    return res.status(200).jsonp(view(job));
  } catch (e) {
    return sendError(res, e);
  }
});

// --- respostas do serviço silence_removal ---------------------------------------------
async function storeResultVideo(job, output) {
  const project = await Project.getOne(job.owner_id, job.project_id);
  if (!project) throw new Error("Projeto já não existe");
  const name = resultName(project, job.source_name);
  const file = output.outputVideoURI;
  const size = fs.statSync(file).size;

  const data = new FormData();
  data.append("file", fs.createReadStream(file), { filename: name, contentType: "video/mp4", knownLength: size });
  const resp = await post_image(String(job.owner_id), String(job.project_id), "src", data);
  const keyParts = resp.data.data.imageKey.split("/");
  const ogKey = keyParts[keyParts.length - 1];
  const sha = await sha256File(file);

  const base = `./images/users/${job.owner_id}/projects/${job.project_id}`;
  const newImgId = new mongoose.Types.ObjectId();
  const updated = await ProjectModel.findOneAndUpdate(
    { _id: job.project_id, user_id: job.owner_id },
    {
      $push: {
        imgs: {
          _id: newImgId,
          og_uri: `${base}/src/${name}`,
          new_uri: `${base}/out/${name}`,
          og_img_key: ogKey,
          og_sha256: sha,
          duration: output.result.durationSec,
          width: output.result.width,
          height: output.result.height,
          mime_type: "video/mp4",
        },
      },
      $inc: { version: 1 },
    },
    { new: true }
  );
  if (!updated) throw new Error("Projeto já não existe");

  send_msg_project_op({
    projectId: String(job.project_id),
    ownerId: String(job.owner_id),
    op: {
      opId: null,
      type: "IMAGE_ADDED",
      actorId: String(job.runner_id),
      baseVersion: updated.version - 1,
      newVersion: updated.version,
      payload: { source: "silence_removal" },
    },
  });
  return { imgId: String(newImgId), name };
}

async function handleResult(msg) {
  const job = await SilenceJob.findOne({ current_job_id: msg.jobId });
  if (!job) {
    // pedido cancelado ou substituído: descartar qualquer ficheiro que tenha produzido
    if (msg.status === "success" && msg.output?.outputVideoURI) safeRemove(msg.output.outputVideoURI);
    return;
  }

  if (msg.status === "progress") {
    if (!BUSY.includes(job.status)) return;
    const fields = { status: msg.phaseStatus || job.status, progress: msg.progress ?? job.progress };
    if (!job.started_at) fields.started_at = new Date();
    await save(job, fields);
    notify(job);
    return;
  }

  const isAnalyze = job.phase === "analyze";
  safeRemove(job.local_input);

  if (msg.status === "success" && isAnalyze) {
    const analysis = msg.output;
    await save(job, {
      status: "analyzed",
      progress: 100,
      current_job_id: null,
      local_input: null,
      analysis,
      review: (analysis.segments || []).map((s) => ({ start: s.start, end: s.end, selected: true })),
      review_edited: false,
      error: null,
    });
    console.log(`[SILENCE][ANALYZED] img=${job.img_id} troços=${analysis.segments.length} ` +
      `poupança=${analysis.savings.removedSec}s`);
  } else if (msg.status === "success") {
    try {
      const stored = await storeResultVideo(job, msg.output);
      await save(job, {
        status: "completed",
        progress: 100,
        current_job_id: null,
        local_input: null,
        local_output: null,
        result: {
          ...stored,
          originalSec: msg.output.savings.originalSec,
          finalSec: msg.output.result.durationSec,
          removedSec: msg.output.savings.removedSec,
          removedPct: msg.output.savings.removedPct,
          avDiffMs: msg.output.result.avDiffMs,
          segmentsRemoved: msg.output.removedSegments.length,
        },
        error: null,
      });
      console.log(`[SILENCE][COMPLETED] img=${job.img_id} -> ${stored.name} (${msg.output.result.durationSec}s)`);
    } catch (e) {
      console.error("[SILENCE] falha a guardar o vídeo resultante:", e.message);
      if (job.op_charged) await refundOperation(job.runner_id);
      await save(job, {
        status: "failed", progress: 0, current_job_id: null, op_charged: false, local_input: null,
        error: { code: "STORE_FAILED", message: "Não foi possível guardar o novo vídeo no projeto. " +
          "A operação foi devolvida; tente aplicar os cortes novamente." },
      });
    } finally {
      safeRemove(msg.output.outputVideoURI);
    }
  } else {
    // erro ou cancelamento vindo do serviço: nada é descontado (RN7)
    if (isAnalyze) await refundAnalysis(job.runner_id);
    else if (job.op_charged) await refundOperation(job.runner_id);
    safeRemove(job.local_output);
    const cancelled = msg.status === "cancelled";
    await save(job, {
      status: cancelled ? (isAnalyze ? "none" : "analyzed") : "failed",
      progress: 0,
      current_job_id: null,
      op_charged: false,
      local_input: null,
      local_output: null,
      error: cancelled ? null : msg.error,
    });
    console.log(`[SILENCE][${cancelled ? "CANCELLED" : "FAILED"}] img=${job.img_id} ` +
      `${msg.error?.kind || ""} ${msg.error?.message || ""}`);
  }
  notify(job);
}

// --- robustez (parte 4) ------------------------------------------------------------------

// REQ-VID-SIL-031 / DQ-004: tempos máximos, sem repetição automática. O serviço silence_removal já
// interrompe os próprios pedidos; isto cobre o caso de o serviço morrer ou ficar parado a meio.
const LIMITS = {
  analysisMaxSec: Number(process.env.SILENCE_ANALYSIS_MAX_SEC || 5 * 60),
  queueMaxSec: Number(process.env.SILENCE_QUEUE_MAX_SEC || 15 * 60),
  // o serviço envia progresso pelo menos a cada 2 s enquanto trabalha
  silentMaxSec: Number(process.env.SILENCE_SILENT_MAX_SEC || 90),
  graceSec: 30,
};
const TEMP_MAX_AGE_MS = Number(process.env.SILENCE_TEMP_MAX_AGE_SEC || 60 * 60) * 1000;

function applyMaxSec(job) {
  const duration = job.analysis?.video?.durationSec || 0;
  return 3 * duration + 60;
}

function staleReason(job, now = Date.now()) {
  const sec = (d) => (d ? (now - new Date(d).getTime()) / 1000 : 0);
  if (job.status === "queued") {
    return sec(job.queued_at || job.updated_at) > LIMITS.queueMaxSec ? "queue" : null;
  }
  if (sec(job.updated_at) > LIMITS.silentMaxSec) return "silent";
  const max = job.phase === "apply" ? applyMaxSec(job) : LIMITS.analysisMaxSec;
  return sec(job.started_at || job.updated_at) > max + LIMITS.graceSec ? "timeout" : null;
}

async function failStaleJob(job, reason) {
  const jobId = job.current_job_id;
  // reclamar o pedido (só um processo/instância o faz) antes de mexer na quota
  const claimed = await SilenceJob.findOneAndUpdate(
    { _id: job._id, current_job_id: jobId, status: { $in: BUSY } },
    { $set: { current_job_id: null } },
    { new: true }
  );
  if (!claimed) return;

  if (jobId) mq.sendCancel(jobId).catch(() => {});
  const isAnalyze = claimed.phase === "analyze";
  if (isAnalyze) await refundAnalysis(claimed.runner_id);
  else if (claimed.op_charged) await refundOperation(claimed.runner_id);
  const files = [claimed.local_input, claimed.local_output];
  setTimeout(() => files.forEach(safeRemove), 5000);

  const what = isAnalyze ? "A análise" : "O processamento";
  const message =
    reason === "queue"
      ? `${what} ficou demasiado tempo à espera na fila e foi cancelad${isAnalyze ? "a" : "o"}. ` +
        "O serviço pode estar sobrecarregado; tente novamente daqui a pouco."
      : reason === "silent"
      ? `O serviço de processamento deixou de responder e ${what.toLowerCase()} foi interrompid${isAnalyze ? "a" : "o"}. ` +
        "O vídeo original não foi alterado" + (isAnalyze ? "" : " e a operação foi devolvida") + "; tente novamente."
      : `${what} demorou mais do que o tempo máximo permitido e foi interrompid${isAnalyze ? "a" : "o"}. ` +
        "O vídeo original não foi alterado" + (isAnalyze ? "" : " e a operação foi devolvida") + "; tente novamente.";

  await save(claimed, {
    status: "failed",
    progress: 0,
    op_charged: false,
    local_input: null,
    local_output: null,
    error: { code: "TIMEOUT", kind: "timeout", message },
  });
  console.log(`[SILENCE][TIMEOUT] job=${jobId} img=${claimed.img_id} fase=${claimed.phase} motivo=${reason}`);
  notify(claimed);
}

async function sweepStaleJobs() {
  const busyJobs = await SilenceJob.find({ status: { $in: BUSY } });
  for (const job of busyJobs) {
    const reason = staleReason(job);
    if (reason) await failStaleJob(job, reason);
  }
}

// REQ-VID-SIL-026: quando o vídeo ou o projeto é apagado, a revisão e os ficheiros de trabalho também
async function discardSilenceJobs(filter) {
  const jobs = await SilenceJob.find(filter);
  for (const job of jobs) {
    if (BUSY.includes(job.status) && job.current_job_id) {
      mq.sendCancel(job.current_job_id).catch(() => {});
      if (job.phase === "analyze") await refundAnalysis(job.runner_id);
      else if (job.op_charged) await refundOperation(job.runner_id);
    }
    const dir = workDir(job.owner_id, job.project_id, job.img_id);
    setTimeout(() => removeDir(dir), 5000);
    await SilenceJob.deleteOne({ _id: job._id });
    console.log(`[SILENCE][DISCARD] img=${job.img_id} project=${job.project_id}`);
  }
}

function discardForImage(projectId, imgId) {
  return discardSilenceJobs({ project_id: projectId, img_id: imgId }).catch((e) =>
    console.error("[SILENCE] falha a descartar revisão do vídeo:", e.message));
}

function discardForProject(projectId) {
  return discardSilenceJobs({ project_id: projectId }).catch((e) =>
    console.error("[SILENCE] falha a descartar revisões do projeto:", e.message));
}

// revisões de vídeos/projetos que já não existem (ex.: apagados por outro caminho)
async function sweepOrphans() {
  const jobs = await SilenceJob.find({}, { project_id: 1, img_id: 1 }).lean();
  const byProject = new Map();
  for (const j of jobs) {
    const k = String(j.project_id);
    if (!byProject.has(k)) byProject.set(k, []);
    byProject.get(k).push(j);
  }
  for (const [projectId, list] of byProject) {
    const project = await ProjectModel.findById(projectId, { imgs: 1 }).lean();
    if (!project) {
      await discardForProject(projectId);
      continue;
    }
    const imgIds = new Set((project.imgs || []).map((i) => String(i._id)));
    for (const j of list) {
      if (!imgIds.has(String(j.img_id))) await discardForImage(projectId, j.img_id);
    }
  }
}

function removeDir(dir) {
  const abs = path.resolve(dir);
  if (!abs.startsWith(path.resolve("./images") + path.sep)) return;
  fs.rm(abs, { recursive: true, force: true }, () => {});
}

// A6 / REQ-VID-SIL-024: apagar ficheiros de trabalho esquecidos (ex.: serviço reiniciado a meio)
async function sweepTempFiles() {
  const root = path.resolve("./images/users");
  if (!fs.existsSync(root)) return;
  const busy = await SilenceJob.find({ status: { $in: BUSY } }, { local_input: 1, local_output: 1 }).lean();
  const inUse = new Set(
    busy.flatMap((j) => [j.local_input, j.local_output]).filter(Boolean).map((p) => path.resolve(p))
  );
  const now = Date.now();
  let removed = 0;

  const walk = (dir, depth) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        // users/<u>/projects/<p>/silence/<img>/ficheiros
        walk(p, depth + 1);
        if (depth >= 4) {
          try { if (fs.readdirSync(p).length === 0) fs.rmdirSync(p); } catch (_) { /* ignorar */ }
        }
      } else if (p.split(path.sep).includes("silence") && !inUse.has(p)) {
        try {
          if (now - fs.statSync(p).mtimeMs > TEMP_MAX_AGE_MS) {
            fs.rmSync(p, { force: true });
            removed++;
          }
        } catch (_) { /* ignorar */ }
      }
    }
  };
  walk(root, 0);
  if (removed) console.log(`[SILENCE][CLEANUP] ${removed} ficheiro(s) temporário(s) apagado(s)`);
}

function startSilenceMaintenance() {
  const every = (ms, name, fn) =>
    setInterval(() => fn().catch((e) => console.error(`[SILENCE] erro em ${name}:`, e.message)), ms);
  every(Number(process.env.SILENCE_SWEEP_STALE_MS || 30_000), "sweepStaleJobs", sweepStaleJobs);
  every(10 * 60_000, "sweepOrphans", sweepOrphans);
  every(30 * 60_000, "sweepTempFiles", sweepTempFiles);
  // primeira passagem pouco depois do arranque (pedidos que ficaram a meio num reinício)
  setTimeout(() => {
    sweepStaleJobs().catch(() => {});
    sweepOrphans().catch(() => {});
    sweepTempFiles().catch(() => {});
  }, 15_000);
}

function startSilenceConsumer() {
  mq.consumeResults(handleResult);
  startSilenceMaintenance();
}

module.exports = {
  router,
  startSilenceConsumer,
  discardForImage,
  discardForProject,
  // exportados para testes
  _internal: { staleReason, sweepStaleJobs, sweepOrphans, sweepTempFiles, LIMITS },
};
