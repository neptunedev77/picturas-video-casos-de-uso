const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const id = "c".repeat(24);
const token = "private-worker-secret";
const validMedia = { format: "mp4", videoCodec: "h264", sizeBytes: 1000, durationSec: 10 };

function setup() {
  const state = {
    job: { _id: id, owner_id: "owner", project_id: "project", img_id: "video", status: "queued",
      worker_token_hash: crypto.createHash("sha256").update(token).digest("hex") },
    user: { type: "free", remaining_operations: 1 }, debits: 0, refunds: 0, project: true,
  };
  const matches = (filter) => Object.entries(filter).every(([key, value]) =>
    value && typeof value === "object" && "$ne" in value ? state.job[key] !== value.$ne : state.job[key] === value);
  const model = {
    findById: () => ({ select: async () => state.job }),
    findOneAndUpdate: async (filter, update) => {
      if (!matches(filter)) return null;
      Object.assign(state.job, update.$set);
      return state.job;
    },
    updateOne: async (filter, update) => { Object.assign(state.job, update.$set); },
  };
  const mocks = {
    axios: {
      get: async (url) => {
        if (!url.endsWith("/process/1")) return { data: state.user };
        if (state.reservationFails) return { status: 701, data: "No more daily_operations available" };
        state.debits++;
        state.user.remaining_operations--;
        return { status: 200 };
      },
      post: async () => { state.refunds++; return { status: 200 }; },
    },
    "../models/compressionJob": model,
    "../models/project": { findOne: async (filter) => state.project && filter.user_id === state.job.owner_id
      ? { imgs: { id: () => state.source !== false } } : null },
    "../utils/httpsAgent": {},
  };
  const context = { module: { exports: {} }, require: (name) => mocks[name] || require(name), Buffer, Date };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, "../../../projects/services/compressionAccess.js"), "utf8"), context);
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
