// Run with node --test tests/*.test.cjs after installing the frontend dependencies.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
const target = { uid: "runner", ownerId: "owner", pid: "project", imgId: "video", token: "secret", shareId: "edit-link" };
const jobId = "01010101-0101-4101-8101-010101010101";
const job = extra => ({ jobId, projectId: target.pid, imgId: target.imgId, status: "transcribed", operation: "transcribe", phase: "review", cancellationRequested: false, ...extra });

function load(relative, mocks, globals = {}) {
  const result = ts.transpileModule(fs.readFileSync(path.join(root, relative), "utf8"), {
    fileName: relative, reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  });
  const errors = result.diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error);
  assert.deepEqual(errors.map(d => ts.flattenDiagnosticMessageText(d.messageText, "\n")), []);
  const module = { exports: {} };
  vm.runInNewContext(result.outputText, { module, exports: module.exports, require: name => {
    assert.ok(name in mocks, `Unexpected dependency: ${name}`);
    return mocks[name];
  }, URL, ...globals }, { filename: relative });
  return module.exports;
}

function client() {
  const state = { calls: [], downloads: [], response: job() };
  const api = {};
  for (const method of ["get", "post"]) api[method] = async (...args) => {
    state.calls.push({ method, args });
    if (state.error) throw state.error;
    return { data: state.response };
  };
  const axios = { isAxiosError: e => e?.isAxiosError === true, get: async (...args) => {
    state.downloads.push(args);
    return { data: { size: 100 } };
  } };
  const lib = load("lib/subtitles.ts", {
    axios: { __esModule: true, default: axios }, react: {}, "@tanstack/react-query": {},
    "./axios": { api }, "./queries/projects": {},
  }, { window: { location: { origin: "https://picturas.example" } } });
  return { lib, state };
}

test("subtitle REST keeps runner identity, owner/share context and an explicit language; no internal paths", async () => {
  const { lib, state } = client();
  await lib.startSubtitleJob(target, "pt");
  const { method, args } = state.calls[0];
  assert.equal(method, "post");
  assert.equal(args[0], "/projects/runner/project/subtitles");
  assert.deepEqual(JSON.parse(JSON.stringify(args[1])), { imgId: "video", language: "pt" });
  assert.equal(args[2].headers.Authorization, "Bearer secret");
  assert.deepEqual(JSON.parse(JSON.stringify(args[2].params)), { owner: "owner", share: "edit-link" });
  assert.equal(args[2].timeout, 20000);
});

test("confirm/reject/cancel use the existing POST routes with an empty body", async () => {
  const { lib, state } = client();
  for (const action of ["confirm", "reject", "cancel"]) {
    await lib.actOnSubtitleJob(target, jobId, action);
    const call = state.calls.at(-1);
    assert.equal(call.args[0], `/projects/runner/project/subtitles/${jobId}/${action}`);
    assert.equal(Object.keys(call.args[1]).length, 0);
    assert.equal(call.args[2].headers.Authorization, "Bearer secret");
  }
});

test("GET rejects a response belonging to another job, project or video", async () => {
  const { lib, state } = client();
  for (const mismatch of [{ jobId: "other" }, { projectId: "other" }, { imgId: "other" }]) {
    state.response = job(mismatch);
    await assert.rejects(lib.fetchSubtitleJob(target, jobId), e => e.status === 404);
  }
  state.response = job();
  assert.equal((await lib.fetchSubtitleJob(target, jobId)).jobId, jobId);
});

test("download obtains a fresh backend URL and never sends the session JWT to storage", async () => {
  const { lib, state } = client();
  const url = "https://storage.example/signed-file.srt?signature=fresh";
  state.response = job({ status: "completed", result: { name: "legendas-pt.srt", key: "opaque-key", url } });
  const result = await lib.downloadSubtitleResult(target, jobId);
  assert.equal(state.calls[0].method, "get");
  assert.equal(state.downloads[0][0], url);
  assert.equal(state.downloads[0][1].headers, undefined);
  assert.equal(state.downloads[0][1].responseType, "blob");
  assert.equal(result.filename, "legendas-pt.srt");
});

test("incomplete/missing result URLs and unsafe URL protocols cannot start a download", async () => {
  const { lib, state } = client();
  for (const extra of [{ status: "transcribed" }, { status: "completed", result: { key: "not-a-url" } },
    { status: "completed", result: { url: "javascript:alert(1)", name: "test.srt" } }]) {
    state.response = job(extra);
    await assert.rejects(lib.downloadSubtitleResult(target, jobId), e => e instanceof lib.SubtitleApiError);
  }
  assert.equal(state.downloads.length, 0);
});

test("errors retain HTTP semantics and safe structured text, while suppressing internal traces", async () => {
  const { lib, state } = client();
  for (const status of [400, 401, 403, 404, 409, 429, 500, 503]) {
    state.error = { isAxiosError: true, response: { status, data: { code: "TEST", message: "<pre>Traceback /app/server.js:12</pre>" } } };
    await assert.rejects(lib.startSubtitleJob(target, "pt"), e => e.status === status && !e.message.includes("Traceback") && !e.message.includes("/app/"));
  }
  state.error = { isAxiosError: true, response: { status: 409, data: { code: "BUSY", message: "Já existe uma geração ativa." } } };
  await assert.rejects(lib.startSubtitleJob(target, "en"), e => e.message === "Já existe uma geração ativa.");
  state.error = { isAxiosError: true, code: "ECONNABORTED" };
  await assert.rejects(lib.startSubtitleJob(target, "pt"), e => e.code === "REQUEST_TIMEOUT" && e.message.includes("tempo de resposta"));
});

test("worker and storage failures have actionable messages; generation/cancellation labels reflect persisted states", () => {
  const { lib } = client();
  for (const [code, expected] of [["NO_AUDIO", "áudio"], ["INVALID_LANGUAGE", "idioma"], ["STT_FAILED", "reconhecer"], ["STORAGE_TIMEOUT", "guardar"]])
    assert.ok(lib.subtitleErrorMessage(code).includes(expected));
  assert.equal(lib.subtitleStatusLabel(job({ status: "queued", operation: "generate_srt" })), "A gerar ficheiro");
  assert.equal(lib.subtitleStatusLabel(job({ cancellationRequested: true })), "A cancelar…");
  assert.equal(lib.subtitleStatusLabel(job({ status: "cancelled", cancellationRequested: true })), "Cancelado");
  assert.equal(lib.isSubtitleActive(job()), false);
  assert.equal(lib.isSubtitleActive(job({ status: "processing" })), true);
});

test("job bookmarks isolate users/owners/projects/videos without storing credentials", () => {
  const { lib } = client();
  const key = lib.subtitleBookmarkKey(target);
  assert.ok(!key.includes(target.token));
  for (const field of ["uid", "ownerId", "pid", "imgId"])
    assert.notEqual(lib.subtitleBookmarkKey({ ...target, [field]: "different" }), key);
});

test("preview timestamps use HH:MM:SS,mmm with correct rounding across seconds and hours", () => {
  const { formatSubtitleTime } = load("components/subtitles/subtitle-preview.tsx", { "react/jsx-runtime": {} });
  assert.equal(formatSubtitleTime(0), "00:00:00,000");
  assert.equal(formatSubtitleTime(1.2), "00:00:01,200");
  assert.equal(formatSubtitleTime(59.9999), "00:01:00,000");
  assert.equal(formatSubtitleTime(3601.234), "01:00:01,234");
  assert.equal(formatSubtitleTime(-1), "—");
  assert.equal(formatSubtitleTime(NaN), "—");
});
