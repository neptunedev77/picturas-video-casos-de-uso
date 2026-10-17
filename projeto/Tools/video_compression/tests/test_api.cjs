// Dependency-free tests of the new REST guards and result transitions. No servers.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { Readable, Writable } = require("node:stream");
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
  const query = () => ({ select: async () => state.doc });
  const model = {
    findById: query, findOne: query,
    create: async (data) => {
      state.created = { ...data, status: "queued", progress: 0, profile_version: 1 };
      return state.created;
    },
    updateOne: async (filter, update) => { state.writes.push({ filter, update }); },
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
        return new Writable({ write(chunk, encoding, done) { state.copy.bytes.push(chunk); done(); } });
      },
      promises: {
        mkdir: async () => {},
        stat: async () => {
          if (!state.exists) throw Object.assign(new Error("missing"), { code: "ENOENT" });
          return { isFile: () => true, size: 42 };
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

test("all four public routes have an owner guard; requests without a JWT are rejected", () => {
  const { routes } = harness();
  const publicRoutes = routes.filter((r) => !r.url.startsWith("/internal/"));
  assert.equal(publicRoutes.length, 4);
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
