// Runs without a server. Use installed TypeScript or set TYPESCRIPT_PATH to an existing compiler.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require(process.env.TYPESCRIPT_PATH || "typescript");
const root = path.resolve(__dirname, "..");
const target = { uid: "owner", pid: "project", imgId: "video", token: "secret" };

function load(relative, mocks) {
  const source = fs.readFileSync(path.join(root, relative), "utf8");
  const output = ts.transpileModule(source, {
    fileName: relative, reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  });
  const errors = output.diagnostics?.filter((d) => d.category === ts.DiagnosticCategory.Error) || [];
  assert.deepEqual(errors.map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n")), []);
  const module = { exports: {} };
  vm.runInNewContext(output.outputText, {
    module, exports: module.exports, require: (name) => {
      if (!(name in mocks)) throw new Error(`Unexpected dependency: ${name}`);
      return mocks[name];
    }, Blob, console,
  }, { filename: relative });
  return module.exports;
}

function client() {
  const state = { calls: [], response: [], cache: [], cancelled: false, invalidated: false };
  const api = {};
  for (const method of ["get", "post"]) api[method] = async (...args) => {
    state.calls.push({ method, args });
    if (state.error) throw state.error;
    return { data: state.response };
  };
  const hooks = {
    useQuery: (options) => { state.query = options; return options; },
    useMutation: (options) => { state.mutation = options; return options; },
    useQueryClient: () => ({
      cancelQueries: async () => { state.cancelled = true; },
      setQueryData: (key, updater) => { state.cache = updater(state.cache); state.cacheKey = key; },
      invalidateQueries: async () => { state.invalidated = true; },
    }),
  };
  const lib = load("lib/compression.ts", {
    axios: { __esModule: true, default: { isAxiosError: (e) => e?.isAxiosError === true } },
    "./axios": { api }, "@tanstack/react-query": hooks,
    react: { useEffect: (effect) => { state.effect = effect; } },
    "./queries/projects": { useGetSocket: () => ({ data: state.socket }) },
    "./video-status": load("lib/video-status.ts", {}),
  });
  return { lib, state };
}

function job(status = "queued", extra = {}) {
  return { _id: "job", imgId: "video", status, progress: 25, quality: "balanced", sourceName: "video.mp4", ...extra };
}

test("REST creates the selected quality and sends authentication without share overrides", async () => {
  const { lib, state } = client();
  for (const quality of ["high", "balanced", "small"]) {
    state.response = job("queued", { quality });
    const created = await lib.createCompressionJob(target, quality);
    assert.equal(created.quality, quality);
    const call = state.calls.at(-1);
    assert.equal(call.args[0], "/projects/owner/project/compression");
    assert.equal(call.args[1].imgId, "video");
    assert.equal(call.args[1].quality, quality);
    assert.equal(call.args[2].headers.Authorization, "Bearer secret");
    assert.equal(call.args[2].params, undefined);
  }
});

test("restore only this video's jobs from persisted REST state", async () => {
  const { lib, state } = client();
  state.response = [job(), job("completed", { _id: "other", imgId: "other-video" })];
  const jobs = await lib.fetchCompressionJobs(target);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0]._id, "job");
});

test("fallback poll every five seconds only while queued/processing, and pause when closed", () => {
  const { lib, state } = client();
  lib.useCompressionJobs(target, true);
  for (const status of ["queued", "processing", "completed", "failed", "cancelled"]) {
    assert.equal(state.query.refetchInterval({ state: { data: [job(status)] } }),
      ["queued", "processing"].includes(status) ? 5000 : false);
  }
  assert.equal(state.query.refetchInterval({ state: {} }), false);
  assert.equal(state.query.refetchOnMount, "always");
  lib.useCompressionJobs(target, false);
  assert.equal(state.query.enabled, false);
});

test("successful POST seeds cached job and never automatically retries POST", async () => {
  const { lib, state } = client();
  lib.useCreateCompression(target);
  assert.equal(state.mutation.retry, false);
  state.cache = [job("completed", { _id: "old" })];
  await state.mutation.onSuccess(job());
  assert.equal(state.cancelled, true);
  assert.equal(state.cache[0]._id, "job");
  assert.equal(state.cache[1]._id, "old");
  assert.equal(state.invalidated, true);
});

test("download uses the authenticated result endpoint with no JWT in the URL", async () => {
  const { lib, state } = client();
  state.response = new Blob(["mp4"], { type: "video/mp4" });
  const result = await lib.downloadCompressionResult(target, job("completed"));
  assert.equal(result.filename, "video-balanced.mp4");
  assert.equal(result.blob.size, 3);
  const call = state.calls[0];
  assert.equal(call.args[0], "/projects/owner/project/compression/job/result");
  assert.equal(call.args[1].headers.Authorization, "Bearer secret");
  assert.equal(call.args[1].responseType, "blob");
});

test("unfinished results cannot be downloaded", async () => {
  const { lib, state } = client();
  await assert.rejects(lib.downloadCompressionResult(target, job()), /ainda não está disponível/);
  assert.equal(state.calls.length, 0);
});

test("REST and Blob download errors retain the backend's useful message", async () => {
  const { lib, state } = client();
  state.error = { isAxiosError: true, response: { status: 400, data: { message: "Video exceeds duration limit" } } };
  await assert.rejects(lib.createCompressionJob(target, "high"), /duration limit/);
  state.error = { isAxiosError: true, response: { status: 404,
    data: new Blob([JSON.stringify({ message: "Result file is unavailable" })]) } };
  await assert.rejects(lib.downloadCompressionResult(target, job("completed")), /unavailable/);
});

function panel(currentJob, extra = {}) {
  const { lib } = client();
  const state = { selected: null };
  const query = { data: currentJob ? [currentJob] : [], isPending: false, isError: false, ...extra };
  const create = { isPending: false, reset() {}, mutateAsync: async () => {}, ...extra.create };
  const cancel = { isPending: false, reset() {}, mutate() {}, ...extra.cancel };
  const jsx = (type, props) => ({ type, props });
  const exports = load("components/compression/compression-dialog.tsx", {
    react: { useState: (value) => [value, (next) => { state.selected = next; }], useRef: (current) => ({ current }),
      useEffect: () => {} },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "@tanstack/react-query": { useMutation: () => ({ isPending: false, reset() {}, mutate() {} }) },
    "lucide-react": { AlertTriangle: "AlertTriangle", CheckCircle2: "CheckCircle2", Download: "Download", LoaderCircle: "LoaderCircle" },
    "@/components/ui/button": { Button: "Button" }, "@/components/ui/progress": { Progress: "Progress" },
    "@/lib/compression": { ...lib, useCompressionJobs: () => query, useCreateCompression: () => create,
      useCancelCompression: () => cancel },
  });
  return { tree: exports.CompressionPanel({ target, videoName: "video.mp4", open: true }), state };
}

function nodes(tree) {
  if (!tree || typeof tree !== "object") return [];
  const children = tree.props?.children;
  return [tree, ...(Array.isArray(children) ? children.flat(Infinity) : [children]).flatMap(nodes)];
}

function text(tree) {
  if (typeof tree === "string" || typeof tree === "number") return String(tree);
  if (!tree || typeof tree !== "object") return "";
  const children = tree.props?.children;
  return (Array.isArray(children) ? children.flat(Infinity) : [children]).map(text).join(" ");
}

test("panel maps three labels and lets the user select quality", () => {
  const { tree, state } = panel();
  for (const label of ["Alta", "Equilibrada", "Tamanho reduzido"]) assert.ok(text(tree).includes(label));
  const radios = nodes(tree).filter((node) => node.type === "input");
  assert.equal(radios.length, 3);
  assert.equal(radios.find((node) => node.props.checked).props.value, "balanced");
  radios.find((node) => node.props.value === "small").props.onChange();
  assert.equal(state.selected, "small");
});

test("active panel shows persisted progress and blocks a duplicate start", () => {
  for (const status of ["queued", "processing"]) {
    const { tree } = panel(job(status));
    assert.equal(nodes(tree).find((node) => node.type === "Progress").props.value, 25);
    assert.equal(nodes(tree).find((node) => node.props?.["data-testid"] === "start-compression-button").props.disabled, true);
    assert.ok(text(tree).includes(status === "queued" ? "Em fila" : "A processar"));
  }
});

test("completed panel shows final size, reduction, download and honest negative savings", () => {
  const { tree } = panel(job("completed", { result: { sizeBytes: 2_000_000, originalSizeBytes: 1_904_762, reductionPercent: -5 } }));
  assert.ok(text(tree).includes("Concluída"));
  assert.ok(text(tree).includes("2 MB"));
  assert.ok(text(tree).includes("-5"));
  assert.ok(text(tree).includes("Descarregar resultado"));
  assert.ok(text(tree).includes("ficou maior"));
});

test("a result larger by one byte warns and remains downloadable despite a rounded zero percentage", async () => {
  const completed = job("completed", { result: {
    sizeBytes: 1_000_001, originalSizeBytes: 1_000_000, reductionPercent: -0,
  } });
  const { tree } = panel(completed);
  assert.ok(text(tree).includes("Concluída"));
  assert.ok(text(tree).includes("ficou maior"));
  const download = nodes(tree).find((node) => node.type === "Button" && text(node).includes("Descarregar resultado"));
  assert.equal(download.props.disabled, false);
  const { lib, state } = client();
  state.response = new Blob(["larger mp4"], { type: "video/mp4" });
  const result = await lib.downloadCompressionResult(target, completed);
  assert.equal(result.blob.size, 10);
  assert.equal(state.calls[0].args[0], "/projects/owner/project/compression/job/result");
});

test("equal and smaller results show no size warning regardless of the percentage", () => {
  for (const [sizeBytes, reductionPercent] of [[1_000_000, 0], [999_999, 0], [900_000, 10], [1_000_000, -0.01]]) {
    const { tree } = panel(job("completed", { result: { sizeBytes, originalSizeBytes: 1_000_000, reductionPercent } }));
    assert.equal(text(tree).includes("ficou maior"), false);
    assert.ok(text(tree).includes("Descarregar resultado"));
  }
});

test("NO_QUOTA is shown without a result or download and no download request can be sent", async () => {
  const refused = job("failed", { error: { code: "NO_QUOTA", message: "No daily operations remaining." },
    result: { sizeBytes: 1_000, originalSizeBytes: 2_000, reductionPercent: 50 } });
  const { tree } = panel(refused);
  assert.ok(text(tree).includes("Falhada"));
  assert.ok(text(tree).includes("Atingiu o limite diário de operações"));
  assert.equal(text(tree).includes("Descarregar resultado"), false);
  assert.equal(text(tree).includes("Tamanho final"), false);
  const { lib, state } = client();
  await assert.rejects(lib.downloadCompressionResult(target, refused), /ainda não está disponível/);
  assert.equal(state.calls.length, 0);
});

test("failed panel displays backend error and allows a new job", () => {
  const { tree } = panel(job("failed", { error: { message: "FFmpeg failed" } }));
  assert.ok(text(tree).includes("Falhada"));
  assert.ok(text(tree).includes("FFmpeg failed"));
  assert.equal(Boolean(nodes(tree).find((node) => node.props?.["data-testid"] === "start-compression-button").props.disabled), false);
});

test("toolbar: registered editors (owner or edit link) can compress; others cannot", () => {
  const jsx = (type, props) => ({ type, props });
  let canEdit = true;
  const mocks = {
    react: { useState: () => [true, () => {}], useCallback: (fn) => fn },
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
    "next/navigation": { useSearchParams: () => new URLSearchParams() },
    "lucide-react": { FileVideo: "FileVideo" },
    "@/components/ui/button": { Button: "Button" },
    "@/components/ui/dialog": Object.fromEntries(["Dialog", "DialogContent", "DialogDescription", "DialogHeader", "DialogTitle"].map((name) => [name, name])),
    "@/components/ui/tooltip": Object.fromEntries(["Tooltip", "TooltipContent", "TooltipTrigger"].map((name) => [name, name])),
    "@/providers/session-provider": { useSession: () => ({ user: { _id: "owner", type: "free" }, token: "secret" }) },
    "@/providers/project-provider": { useProjectInfo: () => ({ _id: "project", user_id: "owner" }),
      useCurrentImage: () => ({ _id: "video", name: "video.mp4" }), useCanEditProject: () => canEdit },
    "@/lib/mutations/session": { useUpdateSession: () => ({ mutate() {} }) },
    "@/components/compression/compression-dialog": { CompressionPanel: "CompressionPanel" },
  };
  const tool = load("components/toolbar/video-compression-tool.tsx", mocks).default;
  const button = (tree) => nodes(tree).find((node) => node.props?.["data-testid"] === "video-compression-button");
  const tree = tool({ disabled: false });
  assert.equal(Boolean(button(tree).props.disabled), false);
  assert.equal(nodes(tree).find((node) => node.type === "CompressionPanel").props.target.shareId, undefined);
  // An editor opened through a share link works on the owner's project.
  mocks["@/providers/session-provider"].useSession = () => ({ user: { _id: "editor", type: "free" }, token: "secret" });
  mocks["next/navigation"].useSearchParams = () => new URLSearchParams("owner=owner&share=edit-link");
  const shared = tool({});
  assert.equal(Boolean(button(shared).props.disabled), false);
  const target = nodes(shared).find((node) => node.type === "CompressionPanel").props.target;
  assert.equal(target.uid, "editor");
  assert.equal(target.ownerId, "owner");
  assert.equal(target.shareId, "edit-link");
  canEdit = false; // read-only link
  assert.equal(button(tool({})).props.disabled, true);
  canEdit = true;
  mocks["@/providers/session-provider"].useSession = () => ({ user: { _id: "anon", type: "anonymous" }, token: "secret" });
  assert.equal(button(tool({})).props.disabled, true);
});

test("shared projects call the owner's project with the share link, never the JWT in the URL", async () => {
  const { lib, state } = client();
  const shared = { ...target, uid: "editor", ownerId: "owner", shareId: "edit-link" };
  state.response = job();
  await lib.createCompressionJob(shared, "small");
  const call = state.calls.at(-1);
  assert.equal(call.args[0], "/projects/owner/project/compression");
  assert.equal(JSON.stringify(call.args[2].params), JSON.stringify({ share: "edit-link", owner: "owner" }));
  assert.equal(call.args[0].includes("secret"), false);
});

test("error codes become Portuguese messages with the cause and an action (REQ-VID-STATUS-002)", async () => {
  const { lib, state } = client();
  state.error = { isAxiosError: true, response: { status: 429, data: { code: "NO_QUOTA", message: "No daily operations remaining." } } };
  await assert.rejects(lib.createCompressionJob(target, "high"), /limite diário de operações/);
  assert.match(lib.compressionErrorMessage({ code: "PROCESSING_TIMEOUT", message: "Deadline" }), /tempo máximo/);
  assert.equal(lib.compressionErrorMessage({ code: "UNKNOWN", message: "Detalhe" }), "Detalhe");
});

test("real-time updates move progress without polling; terminal states and reconnection resync", () => {
  const { lib, state } = client();
  const handlers = {};
  state.socket = { on: (name, fn) => { handlers[name] = fn; }, off: (name) => { delete handlers[name]; } };
  state.cache = [job("queued", { progress: 0 })];
  lib.useCompressionJobs(target, true);
  const cleanup = state.effect();
  handlers["compression-update"]({ jobId: "job", imgId: "video", status: "processing", progress: 40 });
  assert.equal(state.cache[0].status, "processing");
  assert.equal(state.cache[0].progress, 40);
  handlers["compression-update"]({ jobId: "job", imgId: "other-video", status: "processing", progress: 90 });
  assert.equal(state.cache[0].progress, 40);
  assert.equal(state.invalidated, false);
  handlers["compression-update"]({ jobId: "job", imgId: "video", status: "completed" });
  assert.equal(state.invalidated, true);
  state.invalidated = false;
  handlers.connect();
  assert.equal(state.invalidated, true);
  cleanup();
  assert.deepEqual(Object.keys(handlers), []);
});

test("cancel sends an authenticated POST and replaces cached queued state", async () => {
  const { lib, state } = client();
  state.response = job("cancelled");
  const result = await lib.cancelCompressionJob(target, "job");
  assert.equal(result.status, "cancelled");
  assert.equal(state.calls[0].args[0], "/projects/owner/project/compression/job/cancel");
  assert.equal(state.calls[0].args[2].headers.Authorization, "Bearer secret");
  lib.useCancelCompression(target);
  assert.equal(state.mutation.retry, false);
  state.cache = [job()];
  await state.mutation.onSuccess(result);
  assert.equal(state.cache[0].status, "cancelled");
  await state.mutation.onSettled();
  assert.equal(state.invalidated, true);
});

test("cancel button appears for queued and processing jobs and cancelled state is displayed", () => {
  for (const status of ["queued", "processing", "completed", "failed", "cancelled"]) {
    const { tree } = panel(job(status));
    const button = nodes(tree).find((node) => node.type === "Button" && text(node) === "Cancelar");
    assert.equal(Boolean(button), ["queued", "processing"].includes(status));
    if (status === "cancelled") {
      assert.ok(text(tree).includes("Cancelada"));
      assert.equal(nodes(tree).some((node) => node.type === "Progress"), false);
      assert.equal(Boolean(nodes(tree).find((node) => node.props?.["data-testid"] === "start-compression-button").props.disabled), false);
    }
  }
});

test("queued and processing cancellation sends the displayed job id", () => {
  for (const status of ["queued", "processing"]) {
    const calls = [];
    const { tree } = panel(job(status), { cancel: { mutate: (id) => calls.push(id) } });
    const button = nodes(tree).find((node) => node.type === "Button" && text(node) === "Cancelar");
    assert.equal(button.props.disabled, false);
    button.props.onClick();
    assert.deepEqual(calls, ["job"]);
  }
});

test("pending POST and accepted processing cancellation prevent repeated clicks", () => {
  for (const [current, cancelState] of [
    [job("queued"), { isPending: true }],
    [job("processing"), { isPending: true }],
    [job("processing", { cancelRequested: true }), { isPending: false }],
  ]) {
    const calls = [];
    const { tree } = panel(current, { cancel: { ...cancelState, mutate: (id) => calls.push(id) } });
    const button = nodes(tree).find((node) => node.type === "Button" && text(node) === "A cancelar…");
    assert.equal(button.props.disabled, true);
    button.props.onClick();
    button.props.onClick();
    assert.deepEqual(calls, []);
    assert.ok(text(tree).includes("A aguardar confirmação do cancelamento"));
    assert.equal(nodes(tree).find((node) => node.props?.["data-testid"] === "start-compression-button").props.disabled, true);
  }
});

test("accepted processing cancellation stays cached and polls until cancelled", async () => {
  const { lib, state } = client();
  state.cache = [job("processing")];
  state.response = job("processing", { cancelRequested: true });
  lib.useCancelCompression(target);
  const mutation = state.mutation;
  const accepted = await mutation.mutationFn("job");
  await mutation.onSuccess(accepted);
  await mutation.onSettled();
  assert.equal(state.cancelled, true);
  assert.equal(state.invalidated, true);
  assert.equal(state.cache[0].status, "processing");
  assert.equal(state.cache[0].cancelRequested, true);
  lib.useCompressionJobs(target, true);
  assert.equal(state.query.refetchInterval({ state: { data: state.cache } }), 5000);

  state.response = [job("cancelled", { cancelRequested: true })];
  const confirmed = await state.query.queryFn();
  assert.equal(state.query.refetchInterval({ state: { data: confirmed } }), false);
  const { tree } = panel(confirmed[0]);
  assert.ok(text(tree).includes("Cancelada"));
  assert.equal(text(tree).includes("A cancelar…"), false);
  assert.equal(nodes(tree).some((node) => node.type === "Progress"), false);
});

test("cancelled jobs never display or download a result, even with stale result metadata", async () => {
  const cancelled = job("cancelled", { cancelRequested: true, result: { sizeBytes: 2_000_000, reductionPercent: 50 } });
  const { tree } = panel(cancelled);
  assert.ok(text(tree).includes("Cancelada"));
  assert.equal(text(tree).includes("Descarregar resultado"), false);
  assert.equal(text(tree).includes("Tamanho final"), false);
  const { lib, state } = client();
  await assert.rejects(lib.downloadCompressionResult(target, cancelled), /ainda não está disponível/);
  assert.equal(state.calls.length, 0);
});

test("a rejected cancellation allows retry and resyncs if completion won", async () => {
  const calls = [];
  const { tree } = panel(job("processing"), { cancel: {
    isPending: false, error: new Error("Unable to cancel"), mutate: (id) => calls.push(id),
  } });
  const button = nodes(tree).find((node) => node.type === "Button" && text(node) === "Cancelar");
  assert.equal(button.props.disabled, false);
  button.props.onClick();
  assert.deepEqual(calls, ["job"]);
  assert.ok(text(tree).includes("Unable to cancel"));
  const { lib, state } = client();
  lib.useCancelCompression(target);
  await state.mutation.onSettled();
  assert.equal(state.invalidated, true);
});
