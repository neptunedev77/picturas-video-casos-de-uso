// UC-VID-004: durable orchestration. Worker payloads deliberately contain only
// the Stage 2 contract; no project/storage credentials are sent to the worker.
const amqp = require("amqplib");
const axios = require("axios");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { pipeline } = require("stream/promises");
const FormData = require("form-data");
const SubtitleJob = require("../models/subtitleJob");
const Project = require("../models/project");
const storage = require("./imageStorage");
const { httpsAgent } = require("./httpsAgent");

const EXCHANGE = "picturas";
const REQUESTS = "subtitle_generation_queue";
const RESULTS = "subtitle_results_queue";
const CANCEL = "subtitle_cancel";
const CANCEL_QUEUE = "subtitle_cancel_queue";
const MEDIA = path.resolve(process.env.SUBTITLE_MEDIA_ROOT || "./images");
const ROOT = path.join(MEDIA, "subtitle_generation");
const USERS = (process.env.USERS_MS || "https://users:10001/").replace(/\/$/, "");
const TERMINAL = ["completed", "failed", "cancelled"];
const OPEN = ["queued", "processing"];
const MAX_BODY = 2 * 1024 * 1024;
const LEASE_MS = 120_000;
const QUEUE_MS = Number(process.env.SUBTITLE_QUEUE_TIMEOUT_SEC || 900) * 1000;
const RUN_MS = (Number(process.env.SUBTITLE_JOB_TIMEOUT_SEC || 1800) + 60) * 1000;
let channelPromise, connection, reconnectTimer, maintenanceTimer;
let running = false, maintaining = false;

function error(status, code, message) { return Object.assign(new Error(message), { status, code }); }
function day(date = new Date()) { return date.toISOString().slice(0, 10); }
function failure(code, message) { return { code, message, retryable: false }; }
function bounded(promise, ms, code) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(error(503, code, "O serviço externo não respondeu dentro do prazo.")), ms);
  })]).finally(() => clearTimeout(timer));
}

async function safePath(value) {
  const absolute = path.resolve(value);
  if (!absolute.startsWith(ROOT + path.sep)) throw error(500, "UNSAFE_PATH", "Caminho de trabalho inválido.");
  let cursor = absolute;
  while (true) {
    try {
      const stat = await fs.promises.lstat(cursor);
      if (stat.isSymbolicLink()) throw error(500, "UNSAFE_PATH", "Ligações simbólicas não são permitidas.");
    } catch (e) { if (e.code !== "ENOENT") throw e; }
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return absolute;
}

function paths(jobId) {
  if (!/^[0-9a-f-]{36}$/.test(jobId)) throw error(400, "INVALID_JOB", "Identificador inválido.");
  const directory = path.join(ROOT, jobId);
  return { input_path: path.join(directory, "source.mp4"), output_path: path.join(directory, "result.srt") };
}

function milliseconds(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value * 1000 > Number.MAX_SAFE_INTEGER) {
    throw error(502, "INVALID_RESULT", "Timestamp inválido na resposta do worker.");
  }
  // Decimal half-up, matching Python Decimal(str(seconds)), including 1e-7.
  const [mantissa, exponent = "0"] = String(value).split("e");
  const [whole, fraction = ""] = mantissa.split(".");
  const digits = BigInt(whole + fraction);
  const power = Number(exponent) - fraction.length + 3;
  if (power >= 0) return Number(digits * 10n ** BigInt(power));
  const divisor = 10n ** BigInt(-power);
  return Number((digits + divisor / 2n) / divisor);
}

function validateSegments(segments, duration) {
  if (typeof duration !== "number" || duration <= 0 || milliseconds(duration) <= 0 ||
      !Array.isArray(segments) || !segments.length) throw error(502, "INVALID_RESULT", "Transcrição sem duração ou segmentos válidos.");
  let end = 0, endMs = 0;
  for (const raw of segments) {
    const cue = typeof raw?.toObject === "function" ? raw.toObject() : raw;
    if (!cue || Object.keys(cue).sort().join(",") !== "end,start,text" || typeof cue.text !== "string" || !cue.text.trim()) {
      throw error(502, "INVALID_RESULT", "Segmento de legendas inválido.");
    }
    const startMs = milliseconds(cue.start), nextMs = milliseconds(cue.end);
    if (cue.start < end || startMs < endMs || cue.start >= cue.end || startMs >= nextMs ||
        cue.end > duration || nextMs > milliseconds(duration)) throw error(502, "INVALID_RESULT", "Segmentos fora de ordem ou com tempos inválidos.");
    end = cue.end; endMs = nextMs;
  }
  return segments;
}

function timestamp(seconds) {
  const ms = milliseconds(seconds);
  return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
}

function render(job) {
  validateSegments(job.segments, job.duration);
  return job.segments.map((s, i) => `${i + 1}\n${timestamp(s.start)} --> ${timestamp(s.end)}\n${s.text.trim().replace(/\s+/gu, " ")}`).join("\n\n") + "\n\n";
}

function payload(job) {
  const body = job.current_operation === "transcribe" ? {
    jobId: job.job_id, operation: "transcribe", videoPath: job.input_path, language: job.language, model: job.model,
  } : { jobId: job.job_id, operation: "generate_srt", duration: job.duration,
    segments: job.segments.map(s => ({ text: s.text, start: s.start, end: s.end })), outputPath: job.output_path };
  if (Buffer.byteLength(JSON.stringify(body)) > MAX_BODY) throw error(422, "RESULT_TOO_LARGE", "A transcrição excede o limite de mensagem do worker.");
  return body;
}

async function sourceExists(job) {
  return Project.exists({ _id: job.project_id, user_id: job.owner_id,
    imgs: { $elemMatch: { _id: job.img_id, og_img_key: job.source_key } } });
}

async function account(userId) {
  try {
    const response = await axios.get(`${USERS}/${userId}`, { httpsAgent, timeout: 5000 });
    if (!["free", "premium"].includes(response.data?.type)) throw error(403, "REGISTERED_ONLY", "É necessária uma conta registada.");
    if (response.data.type === "free" && response.data.remaining_operations === 0) throw error(429, "NO_QUOTA", "Atingiu o limite diário de operações.");
    return response.data;
  } catch (e) { throw e.status ? e : error(503, "USERS_UNAVAILABLE", "Não foi possível verificar a conta e a quota."); }
}

async function reserve(job) {
  if (job.runner_type === "premium") {
    return SubtitleJob.findOneAndUpdate({ _id: job._id, "quota.state": "pending" },
      { $set: { "quota.state": "exempt", phase: "preparing" } }, { new: true });
  }
  let claimed;
  try {
    claimed = await SubtitleJob.findOneAndUpdate({ _id: job._id, "quota.state": "pending" }, {
      $set: { "quota.state": "reserving", "quota.in_flight": true, "quota.day": day(), "quota.reserve_claimed_at": new Date() },
    }, { new: true });
  } catch (e) {
    if (e.code !== 11000) throw e;
    await SubtitleJob.updateOne({ _id: job._id, "quota.state": "pending" }, { $set: { "quota.state": "not_charged" } });
    throw error(409, "QUOTA_BUSY", "Já existe uma alteração de quota deste utilizador em curso. Tente novamente.");
  }
  if (!claimed) throw error(409, "RESERVATION_CLAIMED", "A reserva já foi iniciada.");
  let response;
  try {
    response = await axios.get(`${USERS}/${job.runner_id}/process/1`, { httpsAgent, timeout: 5000, validateStatus: () => true });
  } catch (e) {
    await SubtitleJob.updateOne({ _id: job._id }, { $set: { "quota.state": "uncertain", "quota.in_flight": false,
      "quota.reconciliation_required": true, "quota.reconciliation_reason": "RESERVATION_RESPONSE_UNKNOWN" } });
    throw error(503, "QUOTA_UNCERTAIN", "Não foi possível confirmar a reserva; é necessária reconciliação da quota.");
  }
  if (response.status === 701 && /No more daily_operations/.test(String(response.data))) {
    await SubtitleJob.updateOne({ _id: job._id }, { $set: { "quota.state": "not_charged", "quota.in_flight": false } });
    throw error(429, "NO_QUOTA", "Atingiu o limite diário de operações.");
  }
  if (response.status !== 200) {
    await SubtitleJob.updateOne({ _id: job._id }, { $set: { "quota.state": "uncertain", "quota.in_flight": false,
      "quota.reconciliation_required": true, "quota.reconciliation_reason": "RESERVATION_RESPONSE_UNKNOWN" } });
    throw error(503, "QUOTA_UNCERTAIN", "A reserva não foi confirmada pelo serviço de utilizadores.");
  }
  const crossed = claimed.quota.day !== day();
  return SubtitleJob.findOneAndUpdate({ _id: job._id }, { $set: {
    "quota.state": "charged", "quota.charged": true, "quota.in_flight": false, phase: "preparing",
    "quota.reconciliation_required": crossed,
    "quota.reconciliation_reason": crossed ? "RESERVATION_DAY_BOUNDARY" : null,
  } }, { new: true });
}

async function refund(jobId) {
  let job;
  try {
    job = await SubtitleJob.findOneAndUpdate({ job_id: jobId, status: { $in: ["failed", "cancelled"] },
      "quota.charged": true, "quota.refund_state": "none" }, {
      $set: { "quota.refund_state": "claimed", "quota.in_flight": true, "quota.refund_claimed_at": new Date() },
    }, { new: true });
  } catch (e) { if (e.code === 11000) return; throw e; } // Deferred to maintenance, no HTTP call made.
  if (!job) return;
  // The User Service has no idempotency key or original-day parameter. A claim
  // is NEVER retried after an uncertain outcome, even following a restart.
  if (job.quota.day !== day() || job.quota.reconciliation_required) {
    await SubtitleJob.updateOne({ _id: job._id }, { $set: { "quota.refund_state": "uncertain", "quota.in_flight": false,
      "quota.reconciliation_required": true, "quota.reconciliation_reason": "REFUND_ORIGINAL_DAY_UNSUPPORTED" } });
    return;
  }
  try {
    const response = await axios.post(`${USERS}/${job.quota.user_id}/process/refund/1`, {},
      { httpsAgent, timeout: 5000, validateStatus: () => true });
    if (response.status !== 200) throw new Error("Refund not confirmed");
    await SubtitleJob.updateOne({ _id: job._id, "quota.refund_state": "claimed" }, { $set: {
      "quota.refund_state": "refunded", "quota.refunded_at": new Date(), "quota.charged": false, "quota.in_flight": false,
    } });
  } catch (_) {
    await SubtitleJob.updateOne({ _id: job._id }, { $set: { "quota.refund_state": "uncertain", "quota.in_flight": false,
      "quota.reconciliation_required": true, "quota.reconciliation_reason": "REFUND_RESPONSE_UNKNOWN" } });
  }
}

async function cleanup(job) {
  if (!TERMINAL.includes(job.status) && job.status !== "transcribed") return;
  try {
    const input = await safePath(job.input_path);
    if (job.status === "transcribed") await fs.promises.rm(input, { force: true });
    else {
      const directory = path.dirname(input);
      if (directory !== path.join(ROOT, job.job_id)) throw error(500, "UNSAFE_PATH", "Diretório de trabalho inválido.");
      await fs.promises.rm(directory, { recursive: true, force: true });
    }
    await SubtitleJob.updateOne({ _id: job._id, status: job.status, current_operation: job.current_operation },
      { $set: { cleanup_pending: false } });
  } catch (e) { console.error("[SUBTITLES] limpeza pendente:", job.job_id, e.message); }
}

async function fail(jobId, code, message) {
  const job = await SubtitleJob.findOneAndUpdate({ job_id: jobId, status: { $nin: TERMINAL } }, { $set: {
    status: "failed", active: false, phase: "failed", error: failure(code, message), finished_at: new Date(),
    dispatch_state: "stopped", cancel_dispatch_state: "pending", cancel_reason: "failure", cleanup_pending: true,
  } }, { new: true });
  if (job) { await refund(jobId); await cleanup(job); }
}

async function cancelled(jobId) {
  const job = await SubtitleJob.findOneAndUpdate({ job_id: jobId, status: { $nin: TERMINAL } }, { $set: {
    status: "cancelled", active: false, phase: "cancelled", finished_at: new Date(),
    dispatch_state: "stopped", cleanup_pending: true, worker_terminal_at: new Date(),
  } }, { new: true });
  if (job) { await refund(jobId); await cleanup(job); }
}

async function openChannel() {
  const conn = await amqp.connect({ protocol: "amqp", hostname: process.env.RABBITMQ_HOST || "rabbitmq",
    port: Number(process.env.RABBITMQ_PORT || 5672), username: process.env.RABBITMQ_USER || "user",
    password: process.env.RABBITMQ_PASS || "password", heartbeat: 30 }, { timeout: 5000 });
  connection = conn;
  conn.on("error", e => console.error("[SUBTITLES][MQ]", e.message));
  conn.on("close", () => { channelPromise = null; });
  try {
    const ch = await conn.createConfirmChannel();
    ch.on("error", e => console.error("[SUBTITLES][MQ]", e.message));
    ch.on("close", () => {
      channelPromise = null;
      conn.close().catch(() => {});
    });
    await ch.assertExchange(EXCHANGE, "direct", { durable: true });
    for (const [queue, key, args] of [[REQUESTS, REQUESTS, { "x-max-priority": 10 }], [RESULTS, RESULTS, {}], [CANCEL_QUEUE, CANCEL, {}]]) {
      await ch.assertQueue(queue, { durable: true, arguments: args });
      await ch.bindQueue(queue, EXCHANGE, key);
    }
    return ch;
  } catch (e) { await conn.close().catch(() => {}); throw e; }
}

function getChannel() {
  if (!channelPromise) channelPromise = openChannel().catch(e => { channelPromise = null; throw e; });
  return channelPromise;
}

async function publish(key, body, requestId) {
  const ch = await getChannel();
  let returned;
  try {
    await bounded(new Promise((resolve, reject) => {
      returned = message => {
        if (message.properties.messageId === requestId && message.properties.correlationId === body.jobId) {
          reject(error(503, "QUEUE_UNAVAILABLE", "O RabbitMQ não encaminhou o pedido para a fila esperada."));
        }
      };
      ch.on("return", returned);
      ch.publish(EXCHANGE, key, Buffer.from(JSON.stringify(body)),
        { persistent: true, mandatory: true, contentType: "application/json", correlationId: body.jobId, messageId: requestId },
        e => e ? reject(e) : resolve());
    }), 10000, "QUEUE_UNAVAILABLE");
  } finally { if (returned) ch.removeListener("return", returned); }
}

async function dispatch(jobId) {
  const token = crypto.randomUUID();
  let job = await SubtitleJob.findOneAndUpdate({ job_id: jobId, status: "queued", dispatch_state: "pending",
    cancel_requested_at: null, "quota.state": { $in: ["charged", "exempt"] },
    $or: [{ dispatch_until: null }, { dispatch_until: { $lt: new Date() } }] }, {
    $set: { dispatch_claim: token, dispatch_until: new Date(Date.now() + LEASE_MS), phase: "preparing" },
  }, { new: true });
  if (!job) return;
  try {
    if (!await sourceExists(job)) throw error(404, "SOURCE_REMOVED", "O vídeo de origem já não existe no projeto.");
    if (job.current_operation === "transcribe") {
      const input = await safePath(job.input_path);
      await fs.promises.mkdir(path.dirname(input), { recursive: true, mode: 0o700 });
      if (!fs.existsSync(input)) {
        const temporary = await safePath(path.join(path.dirname(input), `source-${token}.part`));
        try {
          const signed = await bounded(storage.get_image_internal_url(String(job.owner_id), String(job.project_id), "src", job.source_key), 10000, "SOURCE_UNAVAILABLE");
          const response = await axios.get(signed.data.url, { responseType: "stream", timeout: 60000 });
          await pipeline(response.data, fs.createWriteStream(temporary, { flags: "wx", mode: 0o600 }));
          await safePath(input);
          await fs.promises.rename(temporary, input);
        } finally { await fs.promises.rm(temporary, { force: true }); }
      }
      if (/^[a-f0-9]{64}$/i.test(job.source_sha256 || "")) {
        const digest = crypto.createHash("sha256");
        for await (const chunk of fs.createReadStream(input)) digest.update(chunk);
        if (digest.digest("hex") !== job.source_sha256.toLowerCase()) throw error(502, "SOURCE_CHANGED", "A cópia do vídeo não corresponde à origem selecionada.");
      }
    }
    job = await SubtitleJob.findOne({ _id: job._id, status: "queued", cancel_requested_at: null, dispatch_claim: token });
    if (!job) return;
    await publish(REQUESTS, payload(job), job.current_request_id);
    await SubtitleJob.updateOne({ _id: job._id, dispatch_claim: token, dispatch_state: "pending" }, {
      $set: { dispatch_state: "sent", dispatched_at: new Date(), dispatch_until: null },
    });
  } catch (e) {
    await fail(jobId, e.code || "PREPARATION_FAILED", e.status ? e.message : "Não foi possível preparar ou enviar o pedido de legendas.");
  } finally {
    await SubtitleJob.updateOne({ job_id: jobId, dispatch_claim: token }, { $unset: { dispatch_claim: 1, dispatch_until: 1 } });
    const latest = await SubtitleJob.findOne({ job_id: jobId });
    if (latest && (TERMINAL.includes(latest.status) || latest.status === "transcribed")) await cleanup(latest);
  }
}

async function sendCancellation(jobId) {
  const job = await SubtitleJob.findOne({ job_id: jobId, cancel_dispatch_state: "pending" });
  if (!job) return;
  await publish(CANCEL, { jobId }, `${jobId}:cancel`);
  if (job.cancel_requested_at && !job.cancel_local && !TERMINAL.includes(job.status) && !job.dispatched_at) {
    // Preparation may have stopped before any request reached a worker. After
    // the durable cancel is confirmed, replay the exact request to obtain a
    // terminal cancelled response. Stage 2 checks the tombstone BEFORE STT or
    // output publication; its durable inbox covers cross-queue delivery order.
    await publish(REQUESTS, payload(job), job.current_request_id);
  }
  await SubtitleJob.updateOne({ _id: job._id, cancel_dispatch_state: "pending" }, { $set: { cancel_dispatch_state: "sent" } });
  // An inactive draft has no running worker and the worker does not emit a new
  // terminal event for a cancel-only command. The confirmed durable tombstone
  // plus our CAS transition closes that draft locally.
  if (job.cancel_local && !TERMINAL.includes(job.status)) await cancelled(jobId);
}

async function requestCancel(jobId, reason = "user") {
  const job = await SubtitleJob.findOne({ job_id: jobId });
  if (!job) throw error(404, "NOT_FOUND", "Job não encontrado.");
  if (job.status === "completed") throw error(409, "ALREADY_COMPLETED", "O resultado já foi confirmado e guardado.");
  if (["failed", "cancelled"].includes(job.status)) return job;
  if (reason === "rejected" && job.status !== "transcribed") throw error(409, "NOT_TRANSCRIBED", "Só pode rejeitar uma transcrição pronta para revisão.");
  if (job.cancel_requested_at) return job;
  const claimed = await SubtitleJob.findOneAndUpdate({ _id: job._id, status: job.status,
    current_operation: job.current_operation, cancel_requested_at: null }, { $set: {
    cancel_requested_at: new Date(), cancel_reason: reason, phase: "cancelling", cancel_dispatch_state: "pending",
    cancel_local: job.status === "transcribed",
  } }, { new: true });
  if (!claimed) return requestCancel(jobId, reason);
  try { await sendCancellation(jobId); }
  catch (e) { console.error("[SUBTITLES] cancelamento guardado para reenvio:", jobId, e.message); }
  return SubtitleJob.findOne({ job_id: jobId });
}

function storageKey(response, job) {
  const key = response?.data?.data?.imageKey;
  if (typeof key !== "string" || !key.startsWith(`${job.project_id}/out/`) ||
      !/^[a-f0-9-]+\.srt$/i.test(key.split("/").pop()) || key.split("/").length !== 3) {
    throw error(502, "INVALID_STORAGE_RESULT", "O storage devolveu uma referência inválida.");
  }
  return key.split("/").pop();
}

async function deleteStored(job) {
  if (!job.storage_key || !job.storage_cleanup_pending) return;
  try {
    await bounded(storage.delete_image(String(job.owner_id), String(job.project_id), "out", job.storage_key), 10000, "STORAGE_UNAVAILABLE");
    await SubtitleJob.updateOne({ _id: job._id, storage_key: job.storage_key, storage_cleanup_pending: true },
      { $set: { storage_cleanup_pending: false }, $unset: { storage_key: 1 } });
  } catch (e) { console.error("[SUBTITLES] eliminação no storage pendente:", job.job_id, e.message); }
}

async function storeResult(job, event) {
  const token = crypto.randomUUID();
  const claimed = await SubtitleJob.findOneAndUpdate({ _id: job._id, status: { $in: OPEN },
    current_operation: "generate_srt", cancel_requested_at: null, storage_state: "none" }, { $set: {
    status: "processing", phase: "uploading", storage_state: "uploading", storage_claim: token,
    storage_until: new Date(Date.now() + LEASE_MS), worker_terminal_at: new Date(),
  } }, { new: true });
  if (!claimed) return;
  let key, uploadStarted = false;
  try {
    if (!await sourceExists(claimed)) throw error(404, "SOURCE_REMOVED", "O vídeo de origem já não existe.");
    const output = await safePath(claimed.output_path);
    if (typeof event.outputPath !== "string" || path.resolve(event.outputPath) !== output) throw error(502, "INVALID_RESULT", "O worker devolveu um caminho de saída inesperado.");
    const stat = await fs.promises.stat(output);
    if (!stat.isFile() || stat.size <= 0 || stat.size > 16 * 1024 * 1024) throw error(502, "INVALID_RESULT", "O SRT produzido não é um ficheiro válido.");
    const bytes = await fs.promises.readFile(output);
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (text !== render(claimed)) throw error(502, "INVALID_RESULT", "O SRT não corresponde aos segmentos confirmados.");
    const name = `${path.parse(claimed.source_name).name}-legendas-${claimed.language}.srt`;
    const form = new FormData();
    form.append("file", bytes, { filename: name, contentType: "text/plain", knownLength: bytes.length });
    uploadStarted = true;
    const upload = storage.post_image(String(claimed.owner_id), String(claimed.project_id), "out", form);
    // If a bounded request returns a key late, still try to reclaim that object.
    let timedOut = false;
    upload.then(async response => {
      if (!timedOut) return;
      try {
        const lateKey = storageKey(response, claimed);
        await SubtitleJob.updateOne({ _id: claimed._id, status: { $ne: "completed" } },
          { $set: { storage_key: lateKey, storage_cleanup_pending: true } });
        await deleteStored(await SubtitleJob.findById(claimed._id));
      }
      catch (e) { console.error("[SUBTITLES] upload tardio requer reconciliação:", claimed.job_id, e.message); }
    }).catch(() => {});
    let response;
    try { response = await bounded(upload, 60000, "STORAGE_TIMEOUT"); }
    catch (e) { timedOut = true; throw e; }
    key = storageKey(response, claimed);
    await SubtitleJob.updateOne({ _id: claimed._id, storage_claim: token }, { $set: { storage_key: key, storage_state: "uploaded" } });
    if (!await sourceExists(claimed)) throw error(404, "SOURCE_REMOVED", "O vídeo foi removido durante o upload.");
    const completed = await SubtitleJob.findOneAndUpdate({ _id: claimed._id, status: { $in: OPEN },
      cancel_requested_at: null, storage_claim: token }, { $set: {
      status: "completed", active: false, phase: "completed", finished_at: new Date(), storage_state: "stored",
      result: { key, name, contentType: "text/plain", sizeBytes: bytes.length, sha256: crypto.createHash("sha256").update(bytes).digest("hex") },
      cleanup_pending: true, dispatch_state: "stopped",
    }, $unset: { storage_claim: 1, storage_until: 1 } }, { new: true });
    if (!completed) {
      await SubtitleJob.updateOne({ _id: claimed._id }, { $set: { storage_cleanup_pending: true } });
      await cancelled(claimed.job_id);
      await deleteStored(await SubtitleJob.findById(claimed._id));
    } else await cleanup(completed);
  } catch (e) {
    await SubtitleJob.updateOne({ _id: claimed._id }, { $set: {
      ...(key ? { storage_cleanup_pending: true, storage_key: key } : {}),
      storage_state: uploadStarted && !key ? "uncertain" : "none",
    }, $unset: { storage_claim: 1, storage_until: 1 } });
    const latest = await SubtitleJob.findById(claimed._id);
    if (latest.cancel_requested_at) await cancelled(latest.job_id);
    else await fail(latest.job_id, e.code || "STORE_FAILED", e.status ? e.message : "Não foi possível guardar o SRT no armazenamento.");
    await deleteStored(await SubtitleJob.findById(claimed._id));
  }
}

async function handleResult(event, properties = {}) {
  if (!event || typeof event.jobId !== "string") return;
  const job = await SubtitleJob.findOne({ job_id: event.jobId });
  if (!job) return; // Never delete a path supplied by an unknown message.
  if (TERMINAL.includes(job.status)) { await refund(job.job_id); if (job.cleanup_pending) await cleanup(job); return; }
  // Stage 2 correlation is jobId + operation. A job ID is never recycled.
  if (event.operation !== job.current_operation && ["transcribe", "generate_srt"].includes(event.operation)) return;
  if (event.type !== "subtitle_result" || event.operation !== job.current_operation ||
      (properties.correlationId && properties.correlationId !== job.job_id) ||
      !Number.isFinite(Date.parse(event.timestamp))) {
    await fail(job.job_id, "INVALID_RESULT", "Resposta do worker inválida ou sem correlação válida."); return;
  }
  if (job.cancel_requested_at) {
    if (["transcribed", "completed", "failed", "cancelled"].includes(event.status)) await cancelled(job.job_id);
    return;
  }
  if (job.status === "transcribed") return; // Late first-phase terminals cannot destroy the draft.
  if (event.status === "processing") {
    if (!OPEN.includes(job.status) || job.storage_state !== "none") return;
    const phases = job.current_operation === "transcribe" ? ["starting", "validating", "extracting_audio", "transcribing", "already_running"] : ["starting", "generating_srt", "already_running"];
    if (!phases.includes(event.phase)) { await fail(job.job_id, "INVALID_RESULT", "Fase do worker inválida."); return; }
    await SubtitleJob.updateOne({ _id: job._id, status: { $in: OPEN }, cancel_requested_at: null, storage_state: "none",
      current_operation: event.operation }, { $set: { status: "processing", phase: event.phase }, $min: { started_at: new Date() } });
    return;
  }
  if (event.status === "transcribed" && job.current_operation === "transcribe") {
    if (!OPEN.includes(job.status)) return;
    try {
      validateSegments(event.segments, event.duration);
      payload({ ...job.toObject(), current_operation: "generate_srt", segments: event.segments, duration: event.duration });
    } catch (e) { await fail(job.job_id, e.code || "INVALID_RESULT", e.message); return; }
    const updated = await SubtitleJob.findOneAndUpdate({ _id: job._id, status: { $in: OPEN },
      current_operation: "transcribe", cancel_requested_at: null }, { $set: {
      status: "transcribed", phase: "review", segments: event.segments, duration: event.duration,
      dispatch_state: "stopped", worker_terminal_at: new Date(), cleanup_pending: true,
    } }, { new: true });
    if (updated) await cleanup(updated);
    return;
  }
  if (event.status === "completed" && job.current_operation === "generate_srt") { await storeResult(job, event); return; }
  if (event.status === "cancelled") { await cancelled(job.job_id); return; }
  if (event.status === "failed") {
    const valid = event.error && typeof event.error.code === "string" && typeof event.error.message === "string";
    await fail(job.job_id, valid ? event.error.code.slice(0, 80) : "INVALID_RESULT",
      valid ? event.error.message.slice(0, 1024) : "Erro do worker sem estrutura válida.");
    return;
  }
  await fail(job.job_id, "INVALID_RESULT", "Estado incompatível na resposta do worker.");
}

async function maintain() {
  if (maintaining) return;
  maintaining = true;
  try {
    // Uncertain external quota calls cannot be safely replayed. This is an
    // explicit reconciliation state, rather than a second debit/refund attempt.
    const stale = new Date(Date.now() - LEASE_MS);
    await SubtitleJob.updateMany({ "quota.state": "reserving", "quota.reserve_claimed_at": { $lt: stale } }, { $set: {
      "quota.state": "uncertain", "quota.in_flight": false, "quota.reconciliation_required": true, "quota.reconciliation_reason": "RESERVATION_INTERRUPTED",
    } });
    await SubtitleJob.updateMany({ "quota.refund_state": "claimed", "quota.refund_claimed_at": { $lt: stale } }, { $set: {
      "quota.refund_state": "uncertain", "quota.in_flight": false, "quota.reconciliation_required": true, "quota.reconciliation_reason": "REFUND_INTERRUPTED",
    } });
    const jobs = await SubtitleJob.find({ $or: [
      { status: { $in: OPEN } }, { cancel_dispatch_state: "pending" }, { cleanup_pending: true },
      { storage_cleanup_pending: true }, { status: { $in: ["failed", "cancelled"] }, "quota.charged": true, "quota.refund_state": "none" },
    ] }).sort({ updated_at: 1 }).limit(100);
    for (const job of jobs) {
      if (job.cancel_dispatch_state === "pending") await sendCancellation(job.job_id).catch(e => console.error("[SUBTITLES]", e.message));
      if (OPEN.includes(job.status)) {
        if (job.quota.state === "uncertain" || (job.quota.state === "pending" && job.created_at < stale)) {
          await fail(job.job_id, "QUOTA_UNCERTAIN", "Reserva interrompida; verificar o estado da quota.");
        } else if (["uploading", "uploaded"].includes(job.storage_state) && job.storage_until < new Date()) {
          await SubtitleJob.updateOne({ _id: job._id, status: { $in: OPEN }, storage_until: { $lt: new Date() } },
            { $set: { storage_state: "uncertain", storage_cleanup_pending: Boolean(job.storage_key) } });
          if (job.cancel_requested_at) await cancelled(job.job_id);
          else await fail(job.job_id, "STORAGE_INTERRUPTED", "A gravação no armazenamento foi interrompida.");
        } else if (Date.now() - (job.started_at || job.operation_requested_at).getTime() > (job.started_at ? RUN_MS : QUEUE_MS)) {
          if (job.cancel_requested_at) await cancelled(job.job_id);
          else await fail(job.job_id, "JOB_TIMEOUT", "O pedido de legendas excedeu o prazo de processamento.");
        } else if (job.dispatch_state === "pending") await dispatch(job.job_id);
      }
      if (["failed", "cancelled"].includes(job.status)) await refund(job.job_id);
      if (job.cleanup_pending) await cleanup(job);
      if (job.storage_cleanup_pending) await deleteStored(job);
    }
    // Source/project lifecycle without modifying colleagues' deletion routes.
    const retained = await SubtitleJob.find({ orphaned: false }).sort({ orphan_checked_at: 1 }).limit(100);
    for (const job of retained) {
      if (!await sourceExists(job)) {
        await fail(job.job_id, "SOURCE_REMOVED", "O projeto ou vídeo de origem foi removido.");
        await SubtitleJob.updateOne({ _id: job._id }, { $set: { orphaned: true, storage_cleanup_pending: Boolean(job.storage_key), cleanup_pending: true } });
        const latest = await SubtitleJob.findById(job._id);
        await cleanup(latest); await deleteStored(latest);
      } else await SubtitleJob.updateOne({ _id: job._id }, { $set: { orphan_checked_at: new Date() } });
    }
  } finally { maintaining = false; }
}

async function consume() {
  if (!running) return;
  try {
    const ch = await getChannel();
    await ch.prefetch(1);
    await ch.consume(RESULTS, async message => {
      if (!message) { channelPromise = null; scheduleReconnect(); return; }
      let event;
      try { event = JSON.parse(message.content.toString("utf8")); }
      catch (_) { ch.reject(message, false); return; }
      try {
        await handleResult(event, message.properties);
        try { ch.ack(message); } catch (_) { /* Closed channel: broker redelivers; persisted CAS/receipt wins. */ }
      }
      catch (e) {
        console.error("[SUBTITLES] resposta não persistida:", e.message);
        try { ch.nack(message, false, !message.fields.redelivered); } catch (_) { /* Already disconnected. */ }
      }
    }, { noAck: false });
    ch.once("close", scheduleReconnect);
    console.log("[SUBTITLES] consumidor ativo em", RESULTS);
  } catch (e) { console.error("[SUBTITLES][MQ]", e.message); scheduleReconnect(); }
}

function scheduleReconnect() {
  if (!running || reconnectTimer) return;
  reconnectTimer = setTimeout(() => { reconnectTimer = null; consume(); }, 5000);
  reconnectTimer.unref();
}

function startSubtitleConsumer() {
  if (running) return;
  running = true;
  // Index creation is essential for the one-active-job guarantee.
  SubtitleJob.init().then(() => {
    consume();
    const tick = () => maintain().catch(e => console.error("[SUBTITLES] manutenção:", e.message));
    maintenanceTimer = setInterval(tick, 30000); maintenanceTimer.unref(); tick();
  }).catch(e => console.error("[SUBTITLES] índices indisponíveis:", e.message));
}

async function stop() {
  running = false; clearTimeout(reconnectTimer); clearInterval(maintenanceTimer);
  reconnectTimer = null;
  if (connection) await connection.close().catch(() => {});
  channelPromise = null;
}

module.exports = { startSubtitleConsumer, stop, account, reserve, refund, dispatch, requestCancel,
  paths, payload, error, handleResult, maintain, sourceExists, fail,
  _internal: { render, validateSegments, safePath, storageKey, cleanup, sendCancellation, ROOT } };
