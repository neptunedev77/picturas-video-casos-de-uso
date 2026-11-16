// Dependency-free tests of the new REST guards and result transitions. No servers.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { Readable, Writable } = require("node:stream");
const { matches, apply } = require("./mongo_helpers.cjs");
const projectsRoot = path.resolve(__dirname, "../../../projects");
const uid = "a".repeat(24), pid = "b".repeat(24), jid = "c".repeat(24), editor = "d".repeat(24);

test("JavaScript syntax in all new modules and shared registrations", () => {
  const appRoot = path.dirname(projectsRoot);
  for (const file of ["apiGateway/app.js", "apiGateway/routes/compression.js", "projects/app.js", "projects/services/compressionAccess.js",
    "projects/models/compressionJob.js", "projects/routes/compression.js", "projects/utils/compression_mq.js", "wsGateway/index.js"]) {
    new vm.Script(fs.readFileSync(path.join(appRoot, file), "utf8"), { filename: file });
  }
});

function harness() {
  const routes = [];
  const state = { writes: [], removed: [], doc: null, exists: true, released: [], updates: [], stored: [], ops: [],
    links: [{ id: "edit-link", permission: "edit" }, { id: "read-link", permission: "read" },
      { id: "revoked-link", permission: "edit", revoked: true }] };
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
  const imgs = Object.assign([{ _id: jid, og_uri: "/original/project/video.mp4" }], {
    id: () => ({ _id: jid, mime_type: "video/mp4", og_uri: "/original/project/video.mp4", og_img_key: "original.mp4" }),
  });
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
    axios: { get: async (url) => {
      if (url.startsWith("https://users:")) {
        state.userUrl = url;
        return { data: { type: state.userType || "free", remaining_operations: state.remaining ?? 3 } };
      }
      if (url === "signed-internal-result") return { status: 200, data: Readable.from([Buffer.from("stored result")]) };
      return { status: 200, data: Readable.from([state.original]) };
    } },
    "form-data": class { append(...args) { this.args = args; } },
    fs: {
      existsSync: () => state.exists,
      createReadStream: () => Readable.from([Buffer.from("compressed bytes")]),
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
    "../models/project": {
      findOne: async () => state.projectExists === false ? null : { imgs, sharedLinks: state.links },
      findOneAndUpdate: async (filter, update) => { state.stored.push(update.$push.imgs); return { version: 4 }; },
    },
    "../utils/imageStorage": {
      get_image_internal_url: async (user, project, type, key) => ({
        data: { url: key === "stored-key.mp4" ? "signed-internal-result" : "signed-internal-source" } }),
      post_image: async () => {
        if (state.storeFails) throw new Error("storage down");
        return { data: { data: { imageKey: `${uid}/${pid}/src/stored-key.mp4` } } };
      },
    },
    "../utils/project_msg": { send_msg_project_op: (msg) => state.ops.push(msg) },
    "../services/compressionAccess": {
      authorizeStart: async () => ({ userType: "free" }), releaseFailedLaunch: async () => {},
      releaseOperation: async (id) => { state.released.push(id); return true; },
    },
    "../utils/compression_mq": {
      consumeResults: (handler) => { state.handleResult = handler; },
      sendRequest: async (body) => { state.request = body; dispatched(); },
      sendClientUpdate: (user, payload) => { state.updates.push({ user, ...payload }); return Promise.resolve(); },
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

// Runs an access guard to its outcome: next() or a JSON response.
function guard(route, req) {
  const res = response();
  const full = { query: {}, ...req };
  return new Promise((resolve) => {
    res.json = function (value) { this.body = value; resolve({ res, passed: false }); return this; };
    route.handlers[0](full, res, () => resolve({ res, passed: true, req: full }));
  });
}

const createRoute = (routes) => routes.find((r) => r.method === "POST" && r.url.endsWith("/compression"));
const cancelRoute = (routes) => routes.find((r) => r.url.endsWith("/cancel"));
const resultRoute = (routes) => routes.find((r) => r.url.endsWith("/result"));

test("all five public routes have an access guard; requests without a JWT are rejected", () => {
  const { routes } = harness();
  const publicRoutes = routes.filter((r) => !r.url.startsWith("/internal/"));
  assert.equal(publicRoutes.length, 5);
  for (const route of publicRoutes) {
    const res = response();
    route.handlers[0]({ headers: {}, params: { user: uid, project: pid }, query: {} }, res, () => assert.fail("unauthorized"));
    assert.equal(res.statusCode, 401);
  }
});

test("another user without a share link cannot access the owner's compression", async () => {
  const { routes } = harness();
  const { res, passed } = await guard(createRoute(routes), {
    headers: { authorization: `Bearer ${editor}` }, params: { user: uid, project: pid } });
  assert.equal(passed, false);
  assert.equal(res.statusCode, 403);
});

test("share links: edit can create and cancel, read can only view, revoked links are refused", async () => {
  const { routes } = harness();
  const as = (share) => ({ headers: { authorization: `Bearer ${editor}` }, params: { user: uid, project: pid, jobId: jid }, query: { share } });
  const edit = await guard(createRoute(routes), as("edit-link"));
  assert.equal(edit.passed, true);
  assert.equal(edit.req.callerId, editor);
  assert.equal((await guard(cancelRoute(routes), as("edit-link"))).passed, true);
  const readCreate = await guard(createRoute(routes), as("read-link"));
  assert.equal(readCreate.res.statusCode, 403);
  assert.equal(readCreate.res.body.code, "EDIT_REQUIRED");
  assert.equal((await guard(resultRoute(routes), as("read-link"))).passed, true);
  for (const share of ["revoked-link", "unknown-link"]) {
    const refused = await guard(createRoute(routes), as(share));
    assert.equal(refused.res.statusCode, 410);
  }
});

test("unknown quality is rejected before creating or dispatching a job", async () => {
  const { routes } = harness();
  const res = response();
  await createRoute(routes).handlers[1]({ body: { imgId: jid, quality: "custom" } }, res, (e) => { throw e; });
  assert.equal(res.statusCode, 400);
});

test("valid POST queues a separate working copy without changing the S3 source", async () => {
  const { routes, state } = harness();
  const res = response();
  await createRoute(routes).handlers[1]({ body: { imgId: jid, quality: "balanced" },
    params: { user: uid, project: pid }, callerId: uid }, res, (e) => { throw e; });
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
  assert.equal(state.updates[0].status, "queued");
});

test("a shared-link editor's job is checked against and charged to the editor (RNG-05)", async () => {
  const { routes, state } = harness();
  state.userType = "premium";
  await createRoute(routes).handlers[1]({ body: { imgId: jid, quality: "high" },
    params: { user: uid, project: pid }, callerId: editor }, response(), (e) => { throw e; });
  assert.equal(state.userUrl, `https://users:10001/${editor}`);
  assert.equal(state.created.runner_id, editor);
  assert.equal(state.created.owner_id, uid);
  await state.dispatched;
  assert.equal(state.request.userType, "premium"); // sent with queue priority
  assert.equal(state.updates[0].user, editor);
});

test("a free account without operations is refused before anything is queued (REQ-VID-QUOTA-001)", async () => {
  const { routes, state } = harness();
  state.remaining = 0;
  const res = response();
  await createRoute(routes).handlers[1]({ body: { imgId: jid, quality: "small" },
    params: { user: uid, project: pid }, callerId: uid }, res, (e) => { throw e; });
  assert.equal(res.statusCode, 429);
  assert.equal(res.body.code, "NO_QUOTA");
  assert.equal(state.created, undefined);
  assert.equal(state.request, undefined);
});

test("anonymous account cannot create a compression job", async () => {
  const { routes, state } = harness();
  state.userType = "anonymous";
  const res = response();
  await createRoute(routes).handlers[1]({ body: { imgId: jid, quality: "high" },
    params: { user: uid, project: pid } }, res, (e) => { throw e; });
  assert.equal(res.statusCode, 403);
  assert.equal(state.created, undefined);
  assert.equal(state.request, undefined);
});

test("progress is bounded below 100, sent in real time, and terminal jobs ignore late messages", async () => {
  const { state } = harness();
  state.doc = { _id: jid, status: "queued", start_claimed: true, runner_id: editor };
  await state.handleResult({ jobId: jid, status: "processing", progress: 150 });
  assert.equal(state.writes[0].update.$max.progress, 99);
  assert.equal(state.updates.at(-1).status, "processing");
  assert.equal(state.updates.at(-1).progress, 99);
  assert.equal(state.updates.at(-1).user, editor);
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
  assert.deepEqual(state.released, [jid]);
});

test("failure is persisted, private copies are removed and the operation is returned", async () => {
  const { state } = harness();
  state.doc = { _id: jid, status: "processing", input_path: "/copy.mp4", output_path: "/result.mp4" };
  await state.handleResult({ jobId: jid, status: "failed", error: { code: "SIZE_LIMIT", message: "Too large" } });
  assert.equal(state.writes[0].update.$set.status, "failed");
  assert.equal(state.writes[0].update.$set.error.code, "SIZE_LIMIT");
  assert.deepEqual(state.removed, ["/copy.mp4", "/result.mp4"]);
  assert.deepEqual(state.released, [jid]);
  assert.equal(state.updates.at(-1).status, "failed");
});

test("an unfinished job cannot be downloaded", async () => {
  const { routes, state } = harness();
  state.doc = { _id: jid, status: "processing" };
  const res = response();
  await resultRoute(routes).handlers[1]({ params: { user: uid, project: pid, jobId: jid } }, res, (e) => { throw e; });
  assert.equal(res.statusCode, 409);
  assert.equal(res.downloaded, undefined);
});

test("a result completed before results were stored in the project is still served from its path", async () => {
  const { routes, state } = harness();
  state.doc = { _id: jid, status: "completed", output_path: "/result.mp4", source_name: "original.mp4", quality: "small",
    result: { sizeBytes: 42 } };
  const res = response();
  await resultRoute(routes).handlers[1](
    { params: { user: uid, project: pid, jobId: jid } }, res, (e) => { throw e; },
  );
  assert.equal(res.downloaded.file, "/result.mp4");
  assert.equal(res.downloaded.name, "original-small.mp4");
});

test("every public route rejects a URL user who does not own the project", async () => {
  const { routes, state } = harness();
  state.projectExists = false;
  for (const route of routes.filter((r) => !r.url.startsWith("/internal/"))) {
    const { res, passed } = await guard(route, { headers: { authorization: `Bearer ${uid}` },
      params: { user: uid, project: pid, jobId: jid } });
    assert.equal(passed, false);
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
  await cancelRoute(routes).handlers[1](
    { params: { user: uid, project: pid, jobId: jid } }, res, (e) => { throw e; });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, "cancelled");
  assert.equal(state.writes[0].filter.status, "queued");
  assert.equal(state.writes[0].filter.start_claimed.$ne, true);
  assert.deepEqual(state.removed, ["/copy.mp4", "/result.mp4"]);
  assert.equal(state.request, undefined);
  assert.equal(state.updates.at(-1).status, "cancelled");
});

test("terminal jobs cannot be cancelled; missing job returns 404", async () => {
  for (const status of ["completed", "failed", "cancelled", null]) {
    const { routes, state } = harness();
    state.doc = status ? { _id: jid, status } : null;
    const res = response();
    await cancelRoute(routes).handlers[1](
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
  await createRoute(routes).handlers[1]({ body: { imgId: jid, quality: "balanced" },
    params: { user: uid, project: pid } }, response(), (e) => { throw e; });
  // Let the mocked asynchronous stream finish, including the post-copy status check.
  await new Promise(setImmediate);
  assert.equal(state.created.status, "cancelled");
  assert.equal(state.request, undefined);
  assert.ok(state.removed.includes(state.created.input_path));
});

async function cancelJob(routes) {
  const res = response();
  await cancelRoute(routes).handlers[1](
    { params: { user: uid, project: pid, jobId: jid } }, res, (e) => { throw e; });
  return res;
}

function activeJob() {
  return { _id: jid, status: "processing", start_claimed: true, quota_charged: true,
    ffmpeg_started_at: new Date(), input_path: "/copy.mp4", output_path: "/result.mp4",
    source_name: "original.mp4", quality: "balanced" };
}

test("processing cancellation waits for the worker, then returns the operation", async () => {
  const { routes, state } = harness();
  state.doc = activeJob();
  const res = await cancelJob(routes);
  assert.equal(res.statusCode, 202);
  assert.equal(res.body.status, "processing");
  assert.equal(res.body.cancelRequested, true);
  assert.deepEqual(state.removed, []);
  assert.deepEqual(state.released, []);
  assert.equal((await cancelJob(routes)).statusCode, 202);
  await state.handleResult({ jobId: jid, status: "processing", progress: 80 });
  assert.equal(state.doc.progress, undefined);
  await state.handleResult({ jobId: jid, status: "cancelled" });
  assert.equal(state.doc.status, "cancelled");
  assert.deepEqual(state.released, [jid]);
  assert.deepEqual(state.removed, ["/copy.mp4", "/result.mp4"]);
  const download = response();
  await resultRoute(routes).handlers[1](
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
  assert.deepEqual(state.stored, []);
  assert.ok(state.removed.includes("/result.mp4"));
  for (const status of ["processing", "completed", "failed", "cancelled"]) {
    await state.handleResult({ jobId: jid, status, progress: 100, result: {} });
    assert.equal(state.doc.status, "cancelled");
  }
});

test("completion adds the result to the project; cancellation and late messages preserve it", async () => {
  const { routes, state } = harness();
  state.doc = activeJob();
  await state.handleResult({ jobId: jid, status: "completed", result: { width: 160, height: 120, durationSec: 10 } });
  assert.equal(state.doc.status, "completed");
  assert.equal(state.doc.result.name, "original-comprimido.mp4");
  assert.equal(state.doc.result.key, "stored-key.mp4");
  assert.equal(state.stored.length, 1);
  assert.equal(state.stored[0].mime_type, "video/mp4");
  assert.equal(state.stored[0].og_img_key, "stored-key.mp4");
  assert.equal(state.stored[0].og_sha256, require("node:crypto").createHash("sha256").update("compressed bytes").digest("hex"));
  assert.equal(state.ops[0].op.type, "IMAGE_ADDED");
  assert.deepEqual(state.released, []);
  assert.equal(state.updates.at(-1).status, "completed");
  assert.equal((await cancelJob(routes)).statusCode, 409);
  for (const status of ["cancelled", "failed", "processing", "completed"]) {
    await state.handleResult({ jobId: jid, status, progress: 50, result: {} });
  }
  assert.equal(state.doc.status, "completed");
  assert.equal(state.doc.result.width, 160);
  assert.deepEqual(state.removed, ["/copy.mp4", "/result.mp4"]);
});

test("while the result is being added to the project, cancellation is refused", async () => {
  const { routes, state } = harness();
  state.doc = { ...activeJob(), finalizing: true };
  const res = await cancelJob(routes);
  assert.equal(res.statusCode, 409);
  assert.equal(state.doc.cancel_requested_at, undefined);
});

test("a result that cannot be stored in the project fails and returns the operation", async () => {
  const { state } = harness();
  state.doc = activeJob();
  state.storeFails = true;
  await state.handleResult({ jobId: jid, status: "completed", result: { width: 160 } });
  assert.equal(state.doc.status, "failed");
  assert.equal(state.doc.error.code, "STORE_FAILED");
  assert.deepEqual(state.released, [jid]);
  assert.deepEqual(state.removed, ["/copy.mp4", "/result.mp4"]);
});

test("cancellation wins against a failure between its read and atomic update", async () => {
  const { routes, state } = harness();
  state.doc = activeJob();
  state.beforeUpdate = async () => cancelJob(routes);
  await state.handleResult({ jobId: jid, status: "failed", error: { code: "PROCESSING_FAILED" } });
  assert.equal(state.doc.status, "cancelled");
  assert.equal(state.doc.error, undefined);
});

test("timeout becomes failed, returns the operation and blocks late cancellation and download", async () => {
  const { routes, state } = harness();
  state.doc = activeJob();
  await state.handleResult({ jobId: jid, status: "failed", error: { code: "PROCESSING_TIMEOUT", message: "Deadline exceeded" } });
  assert.equal(state.doc.status, "failed");
  assert.equal(state.doc.error.code, "PROCESSING_TIMEOUT");
  assert.deepEqual(state.released, [jid]);
  assert.deepEqual(state.removed, ["/copy.mp4", "/result.mp4"]);
  assert.equal((await cancelJob(routes)).statusCode, 409);
  const download = response();
  await resultRoute(routes).handlers[1](
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
  assert.deepEqual(state.released, [jid]);
  assert.deepEqual(state.removed, ["/copy.mp4", "/result.mp4"]);
});

test("cancellation accepted between timeout read and failure commit still wins atomically", async () => {
  const { routes, state } = harness();
  state.doc = activeJob();
  state.beforeUpdate = async () => assert.equal((await cancelJob(routes)).statusCode, 202);
  await state.handleResult({ jobId: jid, status: "failed", error: { code: "PROCESSING_TIMEOUT" } });
  assert.equal(state.doc.status, "cancelled");
  assert.equal(state.doc.error, undefined);
  assert.deepEqual(state.released, [jid]);
});

test("NO_QUOTA is persisted without a result and its download is blocked", async () => {
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
  await resultRoute(routes).handlers[1](
    { params: { user: uid, project: pid, jobId: jid } }, download, (e) => { throw e; });
  assert.equal(download.statusCode, 409);
  assert.equal(download.downloaded, undefined);
  await state.handleResult({ jobId: jid, status: "completed", result: {} });
  assert.equal(state.doc.status, "failed");
  assert.equal(state.doc.error.code, "NO_QUOTA");
});

test("a larger result stays completed and is downloaded from the project storage", async () => {
  const { routes, state } = harness();
  state.doc = activeJob();
  state.outputSize = 1_000_001;
  await state.handleResult({ jobId: jid, status: "completed", result: {
    originalSizeBytes: 1_000_000, reductionPercent: -0, durationSec: 10, width: 160, height: 120,
  } });
  assert.equal(state.doc.status, "completed");
  assert.equal(state.doc.result.sizeBytes, 1_000_001);
  assert.equal(state.doc.result.originalSizeBytes, 1_000_000);
  assert.equal(state.doc.result.reductionPercent, -0);
  const chunks = [];
  const download = Object.assign(new Writable({ write(chunk, encoding, done) { chunks.push(chunk); done(); } }), {
    statusCode: 200, headers: {},
    status(n) { this.statusCode = n; return this; }, set() { return this; }, json(v) { this.body = v; return this; },
    attachment(name) { this.headers.name = name; }, type(t) { this.headers.type = t; },
  });
  const finished = new Promise((resolve) => download.on("finish", resolve));
  await resultRoute(routes).handlers[1]({ params: { user: uid, project: pid, jobId: jid } }, download, (e) => { throw e; });
  await finished;
  assert.equal(download.statusCode, 200);
  assert.equal(download.headers.name, "original-comprimido.mp4");
  assert.equal(download.headers.type, "video/mp4");
  assert.equal(Buffer.concat(chunks).toString(), "stored result");
  assert.equal(state.doc.result.key, "stored-key.mp4");
});

test("NO_CAPACITY cancels active jobs, removes private results and returns any reserved operation", async () => {
  for (const [status, charged] of [["queued", false], ["processing", true]]) {
    const { routes, state } = harness();
    state.doc = { ...activeJob(), status, quota_charged: charged, start_claimed: charged,
      ffmpeg_started_at: charged ? new Date() : null, result: { sizeBytes: 42 } };
    await state.handleResult({ jobId: jid, status: "failed", error: {
      code: "NO_CAPACITY", message: "Not enough disk space to compress this video.",
    } });
    assert.equal(state.doc.status, "cancelled");
    assert.equal(state.doc.error.code, "NO_CAPACITY");
    assert.equal(state.doc.error.message, "Not enough disk space to compress this video.");
    assert.deepEqual(state.released, [jid]);
    assert.ok(state.doc.finished_at);
    assert.equal(state.doc.result, undefined);
    assert.deepEqual(state.removed, ["/copy.mp4", "/result.mp4"]);
    assert.equal(state.original.toString(), "existing S3 original");
    const download = response();
    await resultRoute(routes).handlers[1](
      { params: { user: uid, project: pid, jobId: jid } }, download, (e) => { throw e; });
    assert.equal(download.statusCode, 409);
    assert.equal(download.downloaded, undefined);
    await state.handleResult({ jobId: jid, status: "completed", result: {} });
    assert.equal(state.doc.status, "cancelled");
    assert.equal(state.doc.result, undefined);
  }
});

test("late NO_CAPACITY never replaces a terminal state or deletes a completed result", async () => {
  for (const status of ["completed", "failed", "cancelled"]) {
    const { state } = harness();
    state.doc = { ...activeJob(), status, error: { code: "ORIGINAL_ERROR" } };
    await state.handleResult({ jobId: jid, status: "failed", error: { code: "NO_CAPACITY" } });
    assert.equal(state.doc.status, status);
    assert.equal(state.doc.error.code, "ORIGINAL_ERROR");
    if (status === "completed") assert.deepEqual(state.removed, []);
  }
});
