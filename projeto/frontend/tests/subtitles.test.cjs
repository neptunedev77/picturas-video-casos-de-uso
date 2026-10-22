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
    "./axios": { api }, "./queries/projects": {}, "./mutations/session": {},
    "./video-status": load("lib/video-status.ts", {}),
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
  for (const [code, expected] of [["NO_AUDIO", "áudio"], ["INVALID_LANGUAGE", "idioma"], ["STT_FAILED", "reconhecer"], ["STORAGE_TIMEOUT", "guardar"],
    ["DURATION_LIMIT", "10 minutos"], ["SIZE_LIMIT", "100 MB"], ["JOB_TIMEOUT", "3× a duração do vídeo + 60 s"]])
    assert.ok(lib.subtitleErrorMessage(code).includes(expected));
  // The five states shared by every video tool (RNG-06), plus the review step.
  for (const [status, label] of [["queued", "Em fila"], ["processing", "A processar"], ["transcribed", "Pronta para revisão"],
    ["completed", "Concluída"], ["failed", "Falhada"], ["cancelled", "Cancelada"]])
    assert.equal(lib.subtitleStatusLabel(job({ status })), label);
  assert.equal(lib.subtitleStatusLabel(job({ status: "queued", operation: "generate_srt" })), "A gerar ficheiro");
  assert.equal(lib.subtitleStatusLabel(job({ cancellationRequested: true })), "A cancelar…");
  assert.equal(lib.subtitleStatusLabel(job({ status: "cancelled", cancellationRequested: true })), "Cancelada");
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

test("terminal refund polling waits for the backend, never assumes a refund or polls completed/Premium/uncertain jobs", () => {
  const { lib } = client();
  for (const status of ["failed", "cancelled"]) {
    for (const refundState of ["none", "claimed"])
      assert.equal(lib.isSubtitleRefundPending(job({ status, quota: { charged: true, refundState, reconciliationRequired: false } })), true);
    for (const quota of [
      { charged: false, refundState: "refunded", reconciliationRequired: false },
      { charged: false, refundState: "none", reconciliationRequired: false },
      { charged: true, refundState: "uncertain", reconciliationRequired: true },
      { charged: true, refundState: "none", reconciliationRequired: true },
    ]) assert.equal(lib.isSubtitleRefundPending(job({ status, quota })), false);
  }
  assert.equal(lib.isSubtitleRefundPending(job({ status: "completed", quota: { charged: true, refundState: "none" } })), false);
  assert.equal(lib.isSubtitleRefundPending(), false);
});

test("preview timestamps use HH:MM:SS,mmm with correct rounding across seconds and hours", () => {
  const { formatSubtitleTime } = load("components/subtitles/subtitle-preview.tsx", { react: {}, "react/jsx-runtime": {} });
  assert.equal(formatSubtitleTime(0), "00:00:00,000");
  assert.equal(formatSubtitleTime(1.2), "00:00:01,200");
  assert.equal(formatSubtitleTime(59.9999), "00:01:00,000");
  assert.equal(formatSubtitleTime(3601.234), "01:00:01,234");
  assert.equal(formatSubtitleTime(-1), "—");
  assert.equal(formatSubtitleTime(NaN), "—");
});

test("video overlay follows native media time with inclusive start/exclusive end, gaps, consecutive cues and UTF-8", () => {
  let time = 0;
  const jsx = (type, props) => ({ type, props });
  const { SubtitleVideoPreview } = load("components/subtitles/subtitle-preview.tsx", {
    react: {
      useState: initial => initial === 0 ? [time, value => { time = value; }] : [initial, () => {}],
      useRef: current => ({ current }), useEffect() {}, useMemo: fn => fn(),
    },
    "react/jsx-runtime": { jsx, jsxs: jsx },
  });
  const segments = [{ start: 1, end: 2, text: "Olá, ação!" }, { start: 2, end: 3, text: "Já está." }, { start: 4, end: 5, text: "Última legenda." }];
  const source = "https://example.invalid/original.mp4";
  const render = cues => SubtitleVideoPreview({ videoUrl: source, videoName: "original.mp4", segments: cues });
  for (const [instant, event, text] of [[0, "onLoadedMetadata", undefined], [1, "onTimeUpdate", "Olá, ação!"],
    [1.5, "onPause", "Olá, ação!"], [2, "onTimeUpdate", "Já está."], [3, "onTimeUpdate", undefined],
    [4.5, "onSeeking", "Última legenda."], [1.2, "onSeeked", "Olá, ação!"], [6, "onEnded", undefined]]) {
    render(segments).props.children[0].props[event]({ currentTarget: { currentTime: instant } });
    const [video, overlay] = render(segments).props.children;
    assert.equal(overlay ? overlay.props.children.props.children : undefined, text);
    assert.equal(video.props.src, source);
    assert.equal(video.props.controls, true);
  }
  assert.equal(render(undefined).props.children[1], undefined);
});

test("temporary WebVTT keeps Unicode, millisecond timing and literal text; skips invalid/empty cues", () => {
  const { subtitlePreviewVtt } = load("components/subtitles/subtitle-preview.tsx", { react: {}, "react/jsx-runtime": {} });
  assert.equal(subtitlePreviewVtt(), "");
  assert.equal(subtitlePreviewVtt([]), "");
  const vtt = subtitlePreviewVtt([
    { start: 1.2, end: 2.345, text: "Olá, ação & <b>coração</b>!\r\n \r\n\t\r\nJá está." },
    { start: 2.345, end: 3601.234, text: "Segundo segmento." },
    ...[{ start: -1, end: 2 }, { start: NaN, end: 2 }, { start: 1, end: Infinity },
      { start: 2, end: 1 }, { start: 1, end: 1.0001 }].map(times => ({ ...times, text: "inválido" })),
    { start: 3, end: 4, text: " \n " },
  ]);
  assert.equal(vtt, "WEBVTT\n\n1\n00:00:01.200 --> 00:00:02.345\nOlá, ação &amp; &lt;b&gt;coração&lt;/b&gt;!\nJá está.\n\n2\n00:00:02.345 --> 01:00:01.234\nSegundo segmento.\n");
});

test("native fullscreen switches one caption renderer, handles WebKit events and cleans URLs/listeners", async () => {
  const hooks = [], pending = [], created = [], revoked = [];
  let cursor = 0, dirty = false, tree, trackNode, mountedTrackRef;
  function events(extra = {}) {
    const listeners = new Map();
    return { ...extra, listeners,
      addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); },
      removeEventListener(name, fn) { listeners.get(name)?.delete(fn); },
      emit(name) { listeners.get(name)?.forEach(fn => fn()); },
    };
  }
  const document = events({ fullscreenElement: null });
  const video = events({ textTracks: events(), currentTime: 1.5 });
  const react = {
    useState(initial) {
      const i = cursor++; hooks[i] ||= { value: initial };
      return [hooks[i].value, value => { if (!Object.is(hooks[i].value, value)) { hooks[i].value = value; dirty = true; } }];
    },
    useRef(current) { const i = cursor++; return hooks[i] ||= { current }; },
    useMemo(calculate, deps) {
      const i = cursor++, old = hooks[i];
      if (!old || deps.some((d, j) => !Object.is(d, old.deps[j]))) hooks[i] = { deps, value: calculate() };
      return hooks[i].value;
    },
    useEffect(effect, deps) {
      const i = cursor++, old = hooks[i];
      if (!old || deps.some((d, j) => !Object.is(d, old.deps[j]))) {
        hooks[i] = { deps, cleanup: old?.cleanup };
        pending.push(() => { hooks[i].cleanup?.(); hooks[i].cleanup = effect(); });
      }
    },
  };
  const jsx = (type, props) => ({ type, props });
  const { SubtitleVideoPreview } = load("components/subtitles/subtitle-preview.tsx", {
    react, "react/jsx-runtime": { jsx, jsxs: jsx },
  }, { document, Blob, URL: { createObjectURL(blob) { const url = `blob:preview-${created.length}`; created.push({ url, blob }); return url; }, revokeObjectURL(url) { revoked.push(url); } } });
  let segments = [{ start: 1, end: 2, text: "Olá, ação!" }];
  function render() {
    do {
      dirty = false; cursor = 0;
      tree = SubtitleVideoPreview({ videoUrl: "original.mp4", videoName: "original", segments });
      const v = tree.props.children[0]; v.props.ref.current = video;
      const t = v.props.children;
      if (t) {
        if (trackNode?.src !== t.props.src) trackNode = { src: t.props.src, track: { mode: "disabled" } };
        mountedTrackRef = t.props.ref; mountedTrackRef.current = trackNode;
      } else if (mountedTrackRef) mountedTrackRef.current = null;
      while (pending.length) pending.shift()();
    } while (dirty);
  }
  const overlay = () => tree.props.children[1];
  render();
  tree.props.children[0].props.onPause({ currentTarget: video }); render();
  assert.equal(overlay().props.children.props.children, "Olá, ação!");
  assert.equal(trackNode.track.mode, "hidden");
  assert.equal(created[0].blob.type, "text/vtt;charset=utf-8");
  assert.match(await created[0].blob.text(), /Olá, ação!/);
  document.fullscreenElement = { contains: element => element === video };
  document.emit("fullscreenchange"); render();
  assert.equal(trackNode.track.mode, "showing"); assert.equal(Boolean(overlay()), false);
  // A late track load must retain fullscreen mode, including while paused.
  tree.props.children[0].props.children.props.onLoad({ currentTarget: trackNode }); render();
  assert.equal(trackNode.track.mode, "showing");
  document.fullscreenElement = null; document.emit("fullscreenchange"); render();
  assert.equal(trackNode.track.mode, "hidden"); assert.ok(overlay());
  video.emit("webkitbeginfullscreen"); render();
  assert.equal(trackNode.track.mode, "showing"); assert.equal(Boolean(overlay()), false);
  video.emit("webkitendfullscreen"); render(); assert.ok(overlay());
  video.webkitPresentationMode = "fullscreen"; video.emit("webkitpresentationmodechanged"); render();
  assert.equal(trackNode.track.mode, "showing");
  video.webkitPresentationMode = "inline"; video.emit("webkitpresentationmodechanged"); render();
  assert.equal(trackNode.track.mode, "hidden");
  // Manually enabling CC outside fullscreen must also suppress the DOM overlay.
  trackNode.track.mode = "showing"; video.textTracks.emit("change"); render(); assert.equal(Boolean(overlay()), false);
  trackNode.track.mode = "hidden"; video.textTracks.emit("change"); render(); assert.ok(overlay());
  segments = segments.map(s => ({ ...s })); render(); assert.equal(created.length, 1);
  segments = [{ start: 1, end: 2, text: "Já atualizado." }]; render();
  assert.equal(created.length, 2); assert.deepEqual(revoked, [created[0].url]);
  segments = undefined; render(); assert.deepEqual(revoked, created.map(x => x.url));
  segments = [{ start: 1, end: 2, text: "Ao desmontar." }]; render();
  hooks.forEach(h => h.cleanup?.());
  assert.deepEqual(revoked, created.map(x => x.url));
  for (const target of [document, video, video.textTracks])
    assert.equal([...target.listeners.values()].reduce((count, listeners) => count + listeners.size, 0), 0);
});

test("textual preview keeps every cue and timestamp alongside the overlay", () => {
  const jsx = (type, props) => ({ type, props });
  const { SubtitlePreview } = load("components/subtitles/subtitle-preview.tsx", {
    react: {}, "react/jsx-runtime": { jsx, jsxs: jsx },
  });
  const tree = SubtitlePreview({ segments: [{ start: 1.2, end: 4.5, text: "Texto integral com acentos: ação." }] });
  const serialized = JSON.stringify(tree);
  assert.ok(serialized.includes("00:00:01,200"));
  assert.ok(serialized.includes("00:00:04,500"));
  assert.ok(serialized.includes("Texto integral com acentos: ação."));
  assert.ok(serialized.includes("Segmentos reconhecidos"));
});

test("Project Service refuses other languages and videos over 10 minutes before creating or queueing a job", async () => {
  const routes = [];
  const router = { post: (url, ...handlers) => routes.push({ url, handlers }), get() {} };
  let created = 0;
  const img = { _id: "a".repeat(24), mime_type: "video/mp4", og_uri: "/p/video.mp4", og_img_key: "video.mp4", duration: 30 };
  load("../projects/routes/subtitles.js", {
    express: { Router: () => router }, jsonwebtoken: {}, crypto: { randomUUID: () => jobId }, path: { basename: (p) => p.split("/").pop() },
    mongoose: { isValidObjectId: (value) => /^[0-9a-f]{24}$/.test(String(value)) },
    "../models/subtitleJob": { init: async () => {}, create: async () => { created++; throw new Error("must not create"); } },
    "../models/project": { findOne: async () => ({ imgs: { id: () => img } }) },
    "../middleware/shareAuth": {}, "../utils/imageStorage": {},
    "../utils/subtitles_mq": {
      error: (status, code, message) => Object.assign(new Error(message), { status, code }),
      account: async () => { throw new Error("must not reach the quota"); },
    },
  }, { console: { error() {} } });
  const create = routes.find((r) => r.url === "/:user/:project/subtitles").handlers.at(-1);
  async function post(body) {
    const res = { status(n) { this.statusCode = n; return this; }, json(v) { this.body = v; return this; } };
    await create({ body, params: { user: "b".repeat(24), project: "c".repeat(24) }, subtitleRunner: "b".repeat(24) }, res);
    return res;
  }
  const language = await post({ imgId: img._id, language: "fr" });
  assert.equal(language.statusCode, 400);
  assert.equal(language.body.code, "INVALID_LANGUAGE");
  img.duration = 600.5;
  const duration = await post({ imgId: img._id, language: "pt" });
  assert.equal(duration.statusCode, 400);
  assert.equal(duration.body.code, "DURATION_LIMIT");
  assert.equal(created, 0);
});

test("Project Service serializer exposes existing segments for transcribed/completed without modifying stored job or quota", () => {
  const router = { post() {}, get() {} };
  const { _internal: { view } } = load("../projects/routes/subtitles.js", {
    express: { Router: () => router }, mongoose: {}, jsonwebtoken: {}, crypto: {}, path: {},
    "../models/subtitleJob": {}, "../models/project": {},
    "../middleware/shareAuth": {}, "../utils/subtitles_mq": {}, "../utils/imageStorage": {},
  });
  const savedSegments = [{ start: 1.2, end: 4.5, text: "Legendas já guardadas: ação.", internal: "not-public" }];
  for (const status of ["transcribed", "completed", "queued", "processing", "failed", "cancelled"]) {
    const stored = { job_id: jobId, project_id: "project", img_id: "video", runner_id: "runner", status,
      segments: savedSegments, result: { key: "original.srt" }, quota: { charged: true, refund_state: "none" } };
    const before = JSON.stringify(stored);
    const response = view(stored);
    if (["transcribed", "completed"].includes(status))
      assert.deepEqual(JSON.parse(JSON.stringify(response.segments)), [{ start: 1.2, end: 4.5, text: "Legendas já guardadas: ação." }]);
    else assert.equal(response.segments, undefined);
    assert.equal(JSON.stringify(stored), before);
    if (status === "completed") assert.equal(response.result.key, "original.srt");
  }
});

test("completed panel reuses persisted segments for video/list and keeps download without offering confirm/reject", () => {
  const { lib } = client();
  const jsx = (type, props) => ({ type, props });
  for (const status of ["transcribed", "completed"]) {
    const segments = [{ start: 1, end: 2, text: "Legendas já existentes." }];
    const current = job({ status, language: "pt", segments, result: status === "completed" ? { key: "stored.srt", name: "guardadas.srt" } : null });
    let requests = 0;
    const { SubtitleGenerationPanel } = load("components/subtitles/subtitle-generation-dialog.tsx", {
      react: { useState: value => [value, () => {}], useRef: value => ({ current: value }) },
      "react/jsx-runtime": { jsx, jsxs: jsx },
      "@tanstack/react-query": { useMutation: () => ({ isPending: false, reset() {} }) },
      "lucide-react": {}, "@/components/ui/button": { Button: "button" },
      "@/lib/subtitles": { ...lib, useSubtitleJob: () => ({ query: { data: current }, mutation: { mutateAsync: () => { requests++; } }, ready: true, jobId, pending: false }) },
      "./subtitle-preview": { SubtitlePreview: "subtitle-list", SubtitleVideoPreview: "subtitle-video" },
    });
    const tree = SubtitleGenerationPanel({ target, videoName: "original.mp4", videoUrl: "https://example.invalid/original.mp4", open: true });
    const nodes = [];
    function walk(node) {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== "object") return;
      nodes.push(node); walk(node.props?.children);
    }
    walk(tree);
    assert.equal(nodes.find(n => n.type === "subtitle-video").props.segments, segments);
    assert.equal(nodes.find(n => n.type === "subtitle-list").props.segments, segments);
    const labels = nodes.filter(n => n.type === "button").map(n => JSON.stringify(n.props.children)).join(" ");
    assert.equal(labels.includes("Confirmar e gerar SRT"), status === "transcribed");
    assert.equal(labels.includes("Rejeitar"), status === "transcribed");
    assert.equal(labels.includes("Descarregar SRT"), status === "completed");
    assert.equal(requests, 0);
  }
});

test("every video tool shows the same five state names (RNG-06)", () => {
  const shared = load("lib/video-status.ts", {});
  assert.deepEqual(JSON.parse(JSON.stringify(shared.VIDEO_STATUS_LABELS)),
    { queued: "Em fila", processing: "A processar", completed: "Concluída", failed: "Falhada", cancelled: "Cancelada" });
  const { lib } = client();
  for (const status of ["queued", "processing", "completed", "failed", "cancelled"])
    assert.equal(lib.subtitleStatusLabel(job({ status })), shared.VIDEO_STATUS_LABELS[status]);
  // The tools without a dedicated module must use the shared names, not their own strings.
  for (const file of ["components/silence/silence-removal-dialog.tsx", "app/dashboard/[pid]/page.tsx", "lib/compression.ts"]) {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    assert.ok(source.includes("VIDEO_STATUS_LABELS"), file);
    for (const old of ["<h1>Processing</h1>", "\"Concluído\"", "\"Falhado\"", "\"Cancelado\"", "\"Em processamento\"", "Processamento cancelado"])
      assert.equal(source.includes(old), false, `${file}: ${old}`);
  }
});
