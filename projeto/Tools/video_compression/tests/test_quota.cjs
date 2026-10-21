const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { matches, apply } = require("./mongo_helpers.cjs");
const id = "c".repeat(24);
const token = "private-worker-secret";
const validMedia = { format: "mp4", videoCodec: "h264", sizeBytes: 1000, durationSec: 10 };

function setup() {
  const state = {
    job: { _id: id, owner_id: "owner", project_id: "project", img_id: "video", status: "queued",
      worker_token_hash: crypto.createHash("sha256").update(token).digest("hex") },
    user: { type: "free", remaining_operations: 1 }, debits: 0, refunds: 0, project: true,
  };
  const model = {
    findById: () => ({ select: async () => ({ ...state.job }) }),
    findOne: async () => ({ ...state.job }),
    findOneAndUpdate: (filter, update) => {
      const execute = async () => {
        if (!matches(state.job, filter)) return null;
        apply(state.job, update);
        return { ...state.job };
      };
      return { select: execute, then: (resolve, reject) => execute().then(resolve, reject) };
    },
    updateOne: async (filter, update) => {
      if (!matches(state.job, filter)) return { matchedCount: 0 };
      apply(state.job, update);
      return { matchedCount: 1 };
    },
  };
  const mocks = {
    axios: {
      get: async (url) => {
        if (!url.endsWith("/process/1")) return { data: state.user };
        if (state.reservationFails) return { status: 701, data: "No more daily_operations available" };
        state.debits++;
        state.user.remaining_operations--;
        if (state.duringDebit) await state.duringDebit();
        return { status: 200 };
      },
      post: async () => { state.refunds++; state.user.remaining_operations++; return { status: 200 }; },
    },
    "../models/compressionJob": model,
    "../models/project": { findOne: async (filter) => state.project && filter.user_id === state.job.owner_id
      ? { imgs: { id: () => state.source !== false } } : null },
    "../utils/httpsAgent": {},
  };
  const context = { module: { exports: {} }, require: (name) => mocks[name] || require(name), Buffer, Date };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, "../../../projects/services/compressionAccess.js"), "utf8"), context);
  const routes = [];
  const router = { post: (url, ...handlers) => routes.push({ url, handlers }), get() {} };
  const routeMocks = { ...mocks,
    express: { Router: () => router }, mongoose: {}, jsonwebtoken: {},
    "../utils/imageStorage": {}, "../utils/compression_mq": {},
    "../services/compressionAccess": context.module.exports,
    fs: { promises: { rm: async () => {} } },
  };
  const routeContext = { module: { exports: {} }, process, console,
    require: (name) => routeMocks[name] || require(name) };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, "../../../projects/routes/compression.js"), "utf8"), routeContext);
  state.cancel = async () => {
    const res = { statusCode: 200, status(n) { this.statusCode = n; return this; },
      set() { return this; }, json(body) { this.body = body; return this; } };
    await routes.find((r) => r.url.endsWith("/cancel")).handlers[1]({
      params: { jobId: id, user: "owner", project: "project" },
    }, res, (e) => { throw e; });
    return res;
  };
  return { state, ...context.module.exports };
}

test("limits accept exact boundaries and reject one byte/second over, for both profiles", () => {
  const { validateMedia } = setup();
  for (const [type, sizeBytes, durationSec] of [["free", 500_000_000, 600], ["premium", 2_000_000_000, 3600]]) {
    const media = { ...validMedia, sizeBytes, durationSec };
    validateMedia(media, type);
    assert.throws(() => validateMedia({ ...media, sizeBytes: sizeBytes + 1 }, type), { code: "SIZE_LIMIT" });
    assert.throws(() => validateMedia({ ...media, durationSec: durationSec + 1 }, type), { code: "DURATION_LIMIT" });
  }
});

test("non-MP4/H264, anonymous and malformed metadata are rejected", () => {
  const { validateMedia } = setup();
  assert.throws(() => validateMedia({ ...validMedia, format: "mov" }, "free"), { code: "UNSUPPORTED_VIDEO" });
  assert.throws(() => validateMedia({ ...validMedia, videoCodec: "hevc" }, "premium"), { code: "UNSUPPORTED_VIDEO" });
  assert.throws(() => validateMedia(validMedia, "anonymous"), { code: "REGISTERED_ONLY" });
  assert.throws(() => validateMedia({ ...validMedia, durationSec: NaN }, "free"), { code: "INVALID_VIDEO" });
});

test("free start consumes exactly one existing operation, and duplicate start cannot debit again", async () => {
  const { state, authorizeStart } = setup();
  const result = await authorizeStart(id, token, validMedia);
  assert.equal(result.userType, "free");
  assert.equal(state.debits, 1);
  assert.equal(state.job.status, "processing");
  assert.equal(state.job.quota_charged, true);
  await assert.rejects(authorizeStart(id, token, validMedia), { code: "START_ALREADY_CLAIMED" });
  assert.equal(state.debits, 1);
});

test("simultaneous requests for the same job claim only one quota debit", async () => {
  const { state, authorizeStart } = setup();
  const results = await Promise.allSettled([authorizeStart(id, token, validMedia), authorizeStart(id, token, validMedia)]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(state.debits, 1);
});

test("no quota prevents start; quota exhausted after preflight is also rejected", async () => {
  for (const atReservation of [false, true]) {
    const { state, authorizeStart } = setup();
    if (atReservation) state.reservationFails = true;
    else state.user.remaining_operations = 0;
    await assert.rejects(authorizeStart(id, token, validMedia), { code: "NO_QUOTA" });
    assert.equal(state.debits, 0);
    assert.equal(state.job.status, "failed");
  }
});

test("premium is unlimited and bypasses the daily operation debit", async () => {
  const { state, authorizeStart } = setup();
  state.user = { type: "premium", remaining_operations: null };
  await authorizeStart(id, token, { ...validMedia, durationSec: 3600 });
  assert.equal(state.debits, 0);
  assert.equal(state.job.status, "processing");
  assert.equal(state.job.quota_charged, false);
});

test("profile is read at actual start; a premium-to-free downgrade enforces free limits", async () => {
  const { state, authorizeStart } = setup();
  state.job.user_type = "premium";
  await assert.rejects(authorizeStart(id, token, { ...validMedia, durationSec: 601 }), { code: "DURATION_LIMIT" });
  assert.equal(state.debits, 0);
});

test("invalid token, deleted source and wrong project owner never debit quota", async () => {
  const { state, authorizeStart } = setup();
  await assert.rejects(authorizeStart(id, "wrong", validMedia), { code: "INVALID_WORKER_TOKEN" });
  state.source = false;
  await assert.rejects(authorizeStart(id, token, validMedia), { code: "NOT_FOUND" });
  state.source = true;
  state.project = false;
  await assert.rejects(authorizeStart(id, token, validMedia), { code: "NOT_FOUND" });
  assert.equal(state.debits, 0);
});

test("failed process launch refunds once; repeated release is harmless", async () => {
  const { state, authorizeStart, releaseFailedLaunch } = setup();
  await authorizeStart(id, token, validMedia);
  await releaseFailedLaunch(id, token);
  await releaseFailedLaunch(id, token);
  assert.equal(state.refunds, 1);
  assert.equal(state.job.quota_charged, false);
});

test("failed encoding remains charged after an effective start", async () => {
  const { state, authorizeStart, releaseFailedLaunch } = setup();
  await authorizeStart(id, token, validMedia);
  state.job.status = "failed";
  await releaseFailedLaunch(id, token);
  assert.equal(state.debits, 1);
  assert.equal(state.refunds, 0);
});

test("cancellation winning before authorization prevents any quota debit", async () => {
  const { state, authorizeStart } = setup();
  assert.equal((await state.cancel()).statusCode, 200);
  await assert.rejects(authorizeStart(id, token, validMedia), { code: "JOB_CANCELLED" });
  assert.equal(state.job.status, "cancelled");
  assert.equal(state.debits, 0);
});

test("start and cancel race on the same job: only one transition wins", async () => {
  for (const cancelFirst of [true, false]) {
    const { state, authorizeStart } = setup();
    const cancel = () => state.cancel();
    const start = () => authorizeStart(id, token, validMedia);
    await Promise.allSettled(cancelFirst ? [cancel(), start()] : [start(), cancel()]);
    if (state.job.status === "cancelled") assert.equal(state.debits, 0);
    else {
      assert.equal(state.job.status, "processing");
      assert.equal(state.debits, 1);
    }
    assert.ok(["processing", "cancelled"].includes(state.job.status));
  }
});

test("an active job accepts cancellation and retains quota after FFmpeg starts", async () => {
  const { state, authorizeStart, markLaunched, releaseFailedLaunch } = setup();
  await authorizeStart(id, token, validMedia);
  await markLaunched(id, token);
  const cancelled = await state.cancel();
  assert.equal(cancelled.statusCode, 202);
  assert.equal(state.job.status, "processing");
  assert.ok(state.job.cancel_requested_at);
  assert.equal(state.debits, 1);
  await releaseFailedLaunch(id, token);
  assert.equal(state.refunds, 0);
});

test("cancellation during debit survives authorization and permits compensation before Popen", async () => {
  const { state, authorizeStart, releaseFailedLaunch, control } = setup();
  state.duringDebit = async () => assert.equal((await state.cancel()).statusCode, 202);
  await authorizeStart(id, token, validMedia);
  assert.equal((await control(id, token)).cancelRequested, true);
  await releaseFailedLaunch(id, token);
  await releaseFailedLaunch(id, token);
  assert.equal(state.debits, 1);
  assert.equal(state.refunds, 1);
  assert.equal(state.job.quota_charged, false);
  assert.equal(state.user.remaining_operations, 1);
});

test("control and launch acknowledgement require the private job token", async () => {
  const { state, control, markLaunched } = setup();
  await assert.rejects(control(id, "wrong"), { code: "INVALID_WORKER_TOKEN" });
  await assert.rejects(markLaunched(id, "wrong"), { code: "INVALID_WORKER_TOKEN" });
  assert.equal(state.job.ffmpeg_started_at, undefined);
});

test("launch acknowledgement records Popen even with cancellation already pending", async () => {
  const { state, authorizeStart, markLaunched, releaseFailedLaunch } = setup();
  await authorizeStart(id, token, validMedia);
  await state.cancel();
  assert.equal((await markLaunched(id, token)).cancelRequested, true);
  assert.ok(state.job.ffmpeg_started_at);
  await releaseFailedLaunch(id, token);
  assert.equal(state.refunds, 0);
});

test("authorization failure cannot overwrite cancellation or a terminal state", async () => {
  const { state, authorizeStart } = setup();
  state.duringDebit = async () => {
    await state.cancel();
    throw new Error("lost debit response");
  };
  await assert.rejects(authorizeStart(id, token, validMedia), { code: "USERS_UNAVAILABLE" });
  assert.equal(state.job.status, "processing");
  assert.ok(state.job.cancel_requested_at);
});
