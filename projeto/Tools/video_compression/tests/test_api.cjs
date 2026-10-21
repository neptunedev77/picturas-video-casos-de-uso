// Dependency-free tests of the new REST guards and result transitions. No servers.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { Readable, Writable } = require("node:stream");
const { matches, apply } = require("./mongo_helpers.cjs");
const projectsRoot = path.resolve(__dirname, "../../../projects");
const uid = "a".repeat(24), pid = "b".repeat(24), jid = "c".repeat(24);

test("JavaScript syntax in all new modules and shared registrations", () => {
  const appRoot = path.dirname(projectsRoot);
  for (const file of ["apiGateway/app.js", "apiGateway/routes/compression.js", "projects/app.js", "projects/services/compressionAccess.js",
    "projects/models/compressionJob.js", "projects/routes/compression.js", "projects/utils/compression_mq.js"]) {
    new vm.Script(fs.readFileSync(path.join(appRoot, file), "utf8"), { filename: file });
  }
});

function harness() {
  const routes = [];
  const state = { writes: [], removed: [], doc: null, exists: true };
  let dispatched;
  state.dispatched = new Promise((resolve) => { dispatched = resolve; });
  state.original = Buffer.from("existing S3 original");
  const router = {
    post: (url, ...handlers) => routes.push({ method: "POST", url, handlers }),
    get: (url, ...handlers) => routes.push({ method: "GET", url, handlers }),
  };
  const snapshot = () => state.doc ? { ...state.doc } : null;
  const query = () => ({ select: async () => snapshot(),
    then: (resolve, reject) => Promise.resolve(snapshot()).then(resolve, reject) });
  const updateDoc = (filter, update) => {
    if (!matches(state.doc && { owner_id: uid, project_id: pid, ...state.doc }, filter)) return null;
    apply(state.doc, update);
    state.writes.push({ filter, update });
    return snapshot();
  };
  const model = {
    findById: query, findOne: query,
    exists: async () => state.created?.status === "queued",
    findOneAndUpdate: (filter, update) => ({ select: async () => updateDoc(filter, update),
      then: (resolve, reject) => Promise.resolve(updateDoc(filter, update)).then(resolve, reject) }),
    create: async (data) => {
      state.created = { ...data, status: "queued", progress: 0, profile_version: 1 };
      return state.created;
    },
    updateOne: async (filter, update) => {
      if (state.beforeUpdate) { const hook = state.beforeUpdate; state.beforeUpdate = null; await hook(); }
      return { matchedCount: updateDoc(filter, update) ? 1 : 0 };
    },
  };
  const mocks = {
    express: { Router: () => router },
    mongoose: {
      isValidObjectId: (id) => typeof id === "string" && /^[0-9a-f]{24}$/.test(id),
      Types: { ObjectId: class { toString() { return jid; } } },
    },
    jsonwebtoken: { verify: (token) => {
      if (token === "invalid") throw new Error("Invalid token");
      return { id: token };
    } },
    axios: { get: async (url) => url.startsWith("https://users:")
      ? { data: { type: state.userType || "free" } }
      : { data: Readable.from([state.original]) } },
    fs: {
      existsSync: () => state.exists,
      createWriteStream: (filename, options) => {
        state.copy = { filename, options, bytes: [] };
        return new Writable({ write(chunk, encoding, done) {
          state.copy.bytes.push(chunk);
          if (state.cancelDuringCopy) state.created.status = "cancelled";
          done();
        } });
      },
      promises: {
        mkdir: async () => {},
        stat: async () => {
          if (state.duringStat) await state.duringStat();
          if (!state.exists) throw Object.assign(new Error("missing"), { code: "ENOENT" });
          return { isFile: () => true, size: state.outputSize ?? 42 };
        },
        rm: async (file) => { state.removed.push(file); },
      },
    },
    "../utils/httpsAgent": {},
    "../models/compressionJob": model,
    "../models/project": { exists: async () => state.projectExists !== false, findOne: async () => ({ imgs: { id: () => ({
      _id: jid, mime_type: "video/mp4", og_uri: "/original/project/video.mp4", og_img_key: "original.mp4",
    }) } }) },
    "../utils/imageStorage": { get_image_internal_url: async () => ({ data: { url: "signed-internal-source" } }) },
    "../services/compressionAccess": { authorizeStart: async () => ({ userType: "free" }), releaseFailedLaunch: async () => {} },
    "../utils/compression_mq": {
      consumeResults: (handler) => { state.handleResult = handler; },
      sendRequest: async (body) => { state.request = body; dispatched(); },
    },
  };
  const context = {
    require: (name) => name in mocks ? mocks[name] : require(name),
    module: { exports: {} }, console, process,
  };
  vm.runInNewContext(fs.readFileSync(path.join(projectsRoot, "routes/compression.js"), "utf8"), context);
  context.module.exports.startCompressionConsumer();
  return { routes, state };
}

function response() {
  return { statusCode: 200, status(n) { this.statusCode = n; return this; },
    json(value) { this.body = value; return this; }, set() { return this; },
    download(file, name) { this.downloaded = { file, name }; } };
}

test("all five public routes have an owner guard; requests without a JWT are rejected", () => {
  const { routes } = harness();
  const publicRoutes = routes.filter((r) => !r.url.startsWith("/internal/"));
  assert.equal(publicRoutes.length, 5);
  for (const route of publicRoutes) {
    const res = response();
    route.handlers[0]({ headers: {}, params: { user: uid, project: pid }, query: {} }, res, () => assert.fail("unauthorized"));
    assert.equal(res.statusCode, 401);
  }
});

test("another owner and share links cannot access compression", () => {
  const { routes } = harness();
  for (const [token, query] of [[pid, {}], [uid, { share: "link" }], [uid, { owner: pid }]]) {
    const res = response();
    routes[0].handlers[0]({ headers: { authorization: `Bearer ${token}` }, params: { user: uid, project: pid }, query }, res, () => assert.fail("owner bypass"));
    assert.equal(res.statusCode, 403);
  }
});

test("unknown quality is rejected before creating or dispatching a job", async () => {
  const { routes } = harness();
  const res = response();
  await routes[0].handlers[1]({ body: { imgId: jid, quality: "custom" } }, res, (e) => { throw e; });
  assert.equal(res.statusCode, 400);
});

test("valid POST queues a separate working copy without changing the S3 source", async () => {
  const { routes, state } = harness();
  const res = response();
  await routes[0].handlers[1]({ body: { imgId: jid, quality: "balanced" },
    params: { user: uid, project: pid } }, res, (e) => { throw e; });
  assert.equal(res.statusCode, 202);
  assert.equal(res.body.status, "queued");
  await state.dispatched;
  assert.equal(state.request.jobId, jid);
  assert.equal(state.request.quality, "balanced");
  assert.equal(state.request.userType, "free");
  assert.notEqual(state.request.inputPath, state.request.outputPath);
  assert.equal(path.basename(state.request.inputPath), "source.mp4");
  assert.equal(path.basename(state.request.outputPath), "result.mp4");
  assert.equal(state.copy.options.flags, "wx");
  assert.equal(Buffer.concat(state.copy.bytes).toString(), "existing S3 original");
  assert.equal(state.original.toString(), "existing S3 original");
  assert.equal(res.body.input_path, undefined);
});

test("anonymous account cannot create a compression job", async () => {
  const { routes, state } = harness();
  state.userType = "anonymous";
  const res = response();
  await routes[0].handlers[1]({ body: { imgId: jid, quality: "high" },
    params: { user: uid, project: pid } }, res, (e) => { throw e; });
  assert.equal(res.statusCode, 403);
  assert.equal(state.created, undefined);
  assert.equal(state.request, undefined);
});

test("progress is bounded below 100 and terminal jobs ignore late messages", async () => {
  const { state } = harness();
  state.doc = { _id: jid, status: "queued", start_claimed: true };
  await state.handleResult({ jobId: jid, status: "processing", progress: 150 });
  assert.equal(state.writes[0].update.$max.progress, 99);
  state.doc.status = "completed";
  await state.handleResult({ jobId: jid, status: "failed" });
  assert.equal(state.writes.length, 1);
});

test("missing output becomes failed instead of publishing a completed result", async () => {
  const { state } = harness();
  state.doc = { _id: jid, status: "processing", start_claimed: true, output_path: "/missing.mp4" };
  state.exists = false;
  await state.handleResult({ jobId: jid, status: "completed", result: {} });
  assert.equal(state.writes[0].update.$set.status, "failed");
  assert.equal(state.writes[0].update.$set.error.code, "INVALID_RESULT");
});

test("failure is persisted and private working copies are removed", async () => {
  const { state } = harness();
  state.doc = { _id: jid, status: "processing", input_path: "/copy.mp4", output_path: "/result.mp4" };
  await state.handleResult({ jobId: jid, status: "failed", error: { code: "SIZE_LIMIT", message: "Too large" } });
  assert.equal(state.writes[0].update.$set.status, "failed");
  assert.equal(state.writes[0].update.$set.error.code, "SIZE_LIMIT");
  assert.deepEqual(state.removed, ["/copy.mp4", "/result.mp4"]);
});

test("an unfinished job cannot be downloaded", async () => {
  const { routes, state } = harness();
  state.doc = { _id: jid, status: "processing" };
  const res = response();
  const route = routes.find((r) => r.url.endsWith("/result"));
  await route.handlers[1]({ params: { user: uid, project: pid, jobId: jid } }, res, (e) => { throw e; });
  assert.equal(res.statusCode, 409);
  assert.equal(res.downloaded, undefined);
});

test("completed result is served from its stored path with an independent filename", async () => {
  const { routes, state } = harness();
  state.doc = { _id: jid, status: "completed", output_path: "/result.mp4", source_name: "original.mp4", quality: "small" };
  const res = response();
  await routes.find((r) => r.url.endsWith("/result")).handlers[1](
    { params: { user: uid, project: pid, jobId: jid } }, res, (e) => { throw e; },
  );
  assert.equal(res.downloaded.file, "/result.mp4");
  assert.equal(res.downloaded.name, "original-small.mp4");
});

test("every public route rejects a URL user who does not own the project", async () => {
  const { routes, state } = harness();
  state.projectExists = false;
  for (const route of routes.filter((r) => !r.url.startsWith("/internal/"))) {
    const res = response();
    await new Promise((resolve, reject) => {
      res.json = function (value) { this.body = value; resolve(); return this; };
      route.handlers[0]({ headers: { authorization: `Bearer ${uid}` },
        params: { user: uid, project: pid, jobId: jid }, query: {} }, res, () => reject(new Error("Owner bypass")));
    });
    assert.equal(res.statusCode, 404);
  }
});

test("worker messages without start authorization cannot publish a completed result", async () => {
  const { state } = harness();
  state.doc = { _id: jid, status: "queued", start_claimed: false };
  await state.handleResult({ jobId: jid, status: "completed", result: {} });
  assert.equal(state.writes[0].update.$set.error.code, "START_NOT_AUTHORIZED");
});

test("owner cancels a queued job atomically and removes its private copies", async () => {
  const { routes, state } = harness();
  state.doc = { _id: jid, status: "queued", input_path: "/copy.mp4", output_path: "/result.mp4" };
  const res = response();
  await routes.find((r) => r.url.endsWith("/cancel")).handlers[1](
    { params: { user: uid, project: pid, jobId: jid } }, res, (e) => { throw e; });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, "cancelled");
  assert.equal(state.writes[0].filter.status, "queued");
  assert.equal(state.writes[0].filter.start_claimed.$ne, true);
  assert.deepEqual(state.removed, ["/copy.mp4", "/result.mp4"]);
  assert.equal(state.request, undefined);
});

test("terminal jobs cannot be cancelled; missing job returns 404", async () => {
  for (const status of ["completed", "failed", "cancelled", null]) {
    const { routes, state } = harness();
    state.doc = status ? { _id: jid, status } : null;
    const res = response();
    await routes.find((r) => r.url.endsWith("/cancel")).handlers[1](
      { params: { user: uid, project: pid, jobId: jid } }, res, (e) => { throw e; });
    assert.equal(res.statusCode, status ? 409 : 404);
    assert.equal(state.removed.length, 0);
  }
});

test("a cancelled job ignores late progress, success and failure messages", async () => {
  const { state } = harness();
  state.doc = { _id: jid, status: "cancelled", input_path: "/copy.mp4", output_path: "/result.mp4" };
  for (const status of ["processing", "completed", "failed"]) {
    await state.handleResult({ jobId: jid, status, progress: 99, result: {} });
  }
  assert.equal(state.writes.length, 0);
  assert.equal(state.doc.status, "cancelled");
});

test("cancellation during preparation cleans the completed copy instead of publishing a request", async () => {
  const { routes, state } = harness();
  state.cancelDuringCopy = true;
  await routes[0].handlers[1]({ body: { imgId: jid, quality: "balanced" },
    params: { user: uid, project: pid } }, response(), (e) => { throw e; });
  // Let the mocked asynchronous stream finish, including the post-copy status check.
  await new Promise(setImmediate);
  assert.equal(state.created.status, "cancelled");
  assert.equal(state.request, undefined);
  assert.ok(state.removed.includes(state.created.input_path));
});

async function cancelJob(routes) {
  const res = response();
  await routes.find((r) => r.url.endsWith("/cancel")).handlers[1](
    { params: { user: uid, project: pid, jobId: jid } }, res, (e) => { throw e; });
  return res;
}

function activeJob() {
  return { _id: jid, status: "processing", start_claimed: true, quota_charged: true,
    ffmpeg_started_at: new Date(), input_path: "/copy.mp4", output_path: "/result.mp4" };
}

test("processing cancellation waits for worker confirmation before deleting active files", async () => {
  const { routes, state } = harness();
  state.doc = activeJob();
  const res = await cancelJob(routes);
  assert.equal(res.statusCode, 202);
  assert.equal(res.body.status, "processing");
  assert.equal(res.body.cancelRequested, true);
  assert.deepEqual(state.removed, []);
  assert.equal((await cancelJob(routes)).statusCode, 202);
  await state.handleResult({ jobId: jid, status: "processing", progress: 80 });
  assert.equal(state.doc.progress, undefined);
  await state.handleResult({ jobId: jid, status: "cancelled" });
  assert.equal(state.doc.status, "cancelled");
  assert.equal(state.doc.quota_charged, true);
  assert.deepEqual(state.removed, ["/copy.mp4", "/result.mp4"]);
  const download = response();
  await routes.find((r) => r.url.endsWith("/result")).handlers[1](
    { params: { user: uid, project: pid, jobId: jid } }, download, (e) => { throw e; });
  assert.equal(download.statusCode, 409);
  assert.equal(download.downloaded, undefined);
});

test("cancellation wins even after the completion consumer read the job", async () => {
  const { routes, state } = harness();
  state.doc = activeJob();
  state.duringStat = async () => assert.equal((await cancelJob(routes)).statusCode, 202);
  await state.handleResult({ jobId: jid, status: "completed", result: { sizeBytes: 42 } });
  assert.equal(state.doc.status, "cancelled");
  assert.equal(state.doc.result, undefined);
  assert.ok(state.removed.includes("/result.mp4"));
  for (const status of ["processing", "completed", "failed", "cancelled"]) {
    await state.handleResult({ jobId: jid, status, progress: 100, result: {} });
    assert.equal(state.doc.status, "cancelled");
  }
});

test("completion wins first: cancellation and late messages preserve its result", async () => {
  const { routes, state } = harness();
  state.doc = activeJob();
  await state.handleResult({ jobId: jid, status: "completed", result: { width: 160, height: 120 } });
  assert.equal(state.doc.status, "completed");
  assert.equal((await cancelJob(routes)).statusCode, 409);
  for (const status of ["cancelled", "failed", "processing", "completed"]) {
    await state.handleResult({ jobId: jid, status, progress: 50, result: {} });
  }
  assert.equal(state.doc.status, "completed");
  assert.equal(state.doc.result.width, 160);
  assert.deepEqual(state.removed, ["/copy.mp4"]);
});

test("cancellation wins against a failure between its read and atomic update", async () => {
  const { routes, state } = harness();
  state.doc = activeJob();
  state.beforeUpdate = async () => cancelJob(routes);
  await state.handleResult({ jobId: jid, status: "failed", error: { code: "PROCESSING_FAILED" } });
  assert.equal(state.doc.status, "cancelled");
  assert.equal(state.doc.error, undefined);
});

test("timeout without pending cancellation becomes failed and blocks late cancellation and download", async () => {
  const { routes, state } = harness();
  state.doc = activeJob();
  await state.handleResult({ jobId: jid, status: "failed", error: { code: "PROCESSING_TIMEOUT", message: "Deadline exceeded" } });
  assert.equal(state.doc.status, "failed");
  assert.equal(state.doc.error.code, "PROCESSING_TIMEOUT");
  assert.equal(state.doc.quota_charged, true);
  assert.deepEqual(state.removed, ["/copy.mp4", "/result.mp4"]);
  assert.equal((await cancelJob(routes)).statusCode, 409);
  const download = response();
  await routes.find((r) => r.url.endsWith("/result")).handlers[1](
    { params: { user: uid, project: pid, jobId: jid } }, download, (e) => { throw e; });
  assert.equal(download.statusCode, 409);
  assert.equal(download.downloaded, undefined);
  await state.handleResult({ jobId: jid, status: "completed", result: {} });
  await state.handleResult({ jobId: jid, status: "cancelled" });
  assert.equal(state.doc.status, "failed");
  assert.equal(state.doc.error.code, "PROCESSING_TIMEOUT");
});

test("accepted cancellation wins over a subsequent PROCESSING_TIMEOUT", async () => {
  const { routes, state } = harness();
  state.doc = activeJob();
  assert.equal((await cancelJob(routes)).statusCode, 202);
  await state.handleResult({ jobId: jid, status: "failed", error: { code: "PROCESSING_TIMEOUT" } });
  assert.equal(state.doc.status, "cancelled");
  assert.equal(state.doc.error, undefined);
  assert.equal(state.doc.quota_charged, true);
  assert.deepEqual(state.removed, ["/copy.mp4", "/result.mp4"]);
});

test("cancellation accepted between timeout read and failure commit still wins atomically", async () => {
  const { routes, state } = harness();
  state.doc = activeJob();
  state.beforeUpdate = async () => assert.equal((await cancelJob(routes)).statusCode, 202);
  await state.handleResult({ jobId: jid, status: "failed", error: { code: "PROCESSING_TIMEOUT" } });
  assert.equal(state.doc.status, "cancelled");
  assert.equal(state.doc.error, undefined);
  assert.equal(state.doc.quota_charged, true);
});

test("NO_QUOTA is persisted without a debit or result and its download is blocked", async () => {
  const { routes, state } = harness();
  state.doc = { ...activeJob(), quota_charged: false, ffmpeg_started_at: null };
  await state.handleResult({ jobId: jid, status: "failed", error: {
    code: "NO_QUOTA", message: "No daily operations remaining.",
  } });
  assert.equal(state.doc.status, "failed");
  assert.equal(state.doc.error.code, "NO_QUOTA");
  assert.equal(state.doc.error.message, "No daily operations remaining.");
  assert.equal(state.doc.quota_charged, false);
  assert.equal(state.doc.ffmpeg_started_at, null);
  assert.equal(state.doc.result, undefined);
  assert.deepEqual(state.removed, ["/copy.mp4", "/result.mp4"]);
  const download = response();
  await routes.find((r) => r.url.endsWith("/result")).handlers[1](
    { params: { user: uid, project: pid, jobId: jid } }, download, (e) => { throw e; });
  assert.equal(download.statusCode, 409);
  assert.equal(download.downloaded, undefined);
  await state.handleResult({ jobId: jid, status: "completed", result: {} });
  assert.equal(state.doc.status, "failed");
  assert.equal(state.doc.error.code, "NO_QUOTA");
});

test("a larger result stays completed and downloadable even with rounded zero savings", async () => {
  const { routes, state } = harness();
  state.doc = { ...activeJob(), source_name: "original.mp4", quality: "balanced" };
  state.outputSize = 1_000_001;
  await state.handleResult({ jobId: jid, status: "completed", result: {
    originalSizeBytes: 1_000_000, reductionPercent: -0, durationSec: 10, width: 160, height: 120,
  } });
  assert.equal(state.doc.status, "completed");
  assert.equal(state.doc.result.sizeBytes, 1_000_001);
  assert.equal(state.doc.result.originalSizeBytes, 1_000_000);
  assert.equal(state.doc.result.reductionPercent, -0);
  assert.deepEqual(state.removed, ["/copy.mp4"]);
  const download = response();
  await routes.find((r) => r.url.endsWith("/result")).handlers[1](
    { params: { user: uid, project: pid, jobId: jid } }, download, (e) => { throw e; });
  assert.equal(download.statusCode, 200);
  assert.equal(download.downloaded.file, "/result.mp4");
  assert.equal(download.downloaded.name, "original-balanced.mp4");
});
