// Tests of utils/watchdog.js (DA-R4) with injected dependencies (no MongoDB, RabbitMQ or users service).
const test = require('node:test');
const assert = require('node:assert');

const { runCycle, deadlineS } = require('../utils/watchdog');
const { acquireMsgLock, releaseMsgLock } = require('../utils/idempotency');

const CFG = { imageS: 30, videoMinS: 120, videoFactor: 1, intervalMs: 10000 };
const NOW = Date.parse('2026-11-19T12:00:00Z');
const ago = (s) => new Date(NOW - s * 1000);

function world({ processes, project, refundFails = 0, unconfirmed = false }) {
  const w = { processes: [...processes], project: { version: 1, ...project }, published: [], refunds: [], locks: [] };
  w.deps = {
    now: () => NOW,
    publishTimeoutMs: 20,
    listProcesses: async () => [...w.processes],
    getProcess: async (msg_id) => w.processes.find((p) => p.msg_id === msg_id) || null,
    // the real lock used by process_msg (same key: the process msg_id)
    acquireLock: (msg_id) => { w.locks.push(msg_id); return acquireMsgLock(msg_id); },
    releaseLock: releaseMsgLock,
    getProject: async () => ({ ...w.project }),
    // optimistic update, like Project.updateIfVersion: null when the version moved on
    setPendingOps: async (p, value) => {
      if (p.version !== w.project.version) return null;
      w.project = { ...w.project, pendingAdvancedOps: value, version: w.project.version + 1 };
      return { ...w.project };
    },
    refund: async (user, n) => {
      if (refundFails > 0) { refundFails -= 1; throw new Error('users service down'); }
      w.refunds.push([user, n]);
    },
    deleteProcess: async (p) => {
      const before = w.processes.length;
      w.processes = w.processes.filter((x) => x._id !== p._id);
      return w.processes.length < before;
    },
    publish: (msg, queue) => {
      w.published.push({ msg, queue });
      return unconfirmed ? new Promise(() => {}) : Promise.resolve();
    },
  };
  return w;
}

const img = { _id: 'i1', media_type: 'image' };
const vid = (duration) => ({ _id: 'v1', media_type: 'video', video: { duration } });
const proc = (id, img_id, s, msg_id = `request-${id}`) =>
  ({ _id: id, msg_id, img_id, user_id: 'owner', runner_id: 'runner', project_id: 'proj', updatedAt: ago(s) });

test('deadlines: image 30 s, video max(120 s, 1 x duration), extraction barriers wait for the videos', () => {
  const project = { imgs: [img, vid(600)], tools: [] };
  assert.strictEqual(deadlineS(proc('a', 'i1', 0), project, CFG), 30);
  assert.strictEqual(deadlineS(proc('b', 'v1', 0), project, CFG), 600);
  assert.strictEqual(deadlineS(proc('c', 'v1', 0), { imgs: [vid(10)] }, CFG), 120);
  assert.strictEqual(deadlineS(proc('d', 'i1', 0), { ...project, tools: [{ procedure: 'extract_frames' }] }, CFG), 600);
});

test('an expired image step: user notified, reserved ops refunded once, process removed', async () => {
  const w = world({ processes: [proc('a', 'i1', 45)], project: { imgs: [img], pendingAdvancedOps: 2 } });
  assert.deepStrictEqual(await runCycle(w.deps, CFG), ['expired']);
  assert.match(w.published[0].msg.messageId, /^update-client-process-/);
  assert.strictEqual(w.published[0].msg.errorCode, '30002');
  assert.deepStrictEqual(w.refunds, [['runner', 2]]);
  assert.strictEqual(w.project.pendingAdvancedOps, 0);
  assert.deepStrictEqual(w.processes, []);
});

test('processes within their deadline are left alone (including a long video)', async () => {
  const w = world({ processes: [proc('a', 'i1', 10), proc('b', 'v1', 300)],
                    project: { imgs: [img, vid(600)], pendingAdvancedOps: 2 } });
  assert.deepStrictEqual(await runCycle(w.deps, CFG), ['ok', 'ok']);
  assert.deepStrictEqual([w.published, w.refunds, w.processes.length], [[], [], 2]);
});

test('a preview step is reported as preview-error', async () => {
  const w = world({ processes: [proc('a', 'i1', 45, 'preview-request-a')], project: { imgs: [img] } });
  await runCycle(w.deps, CFG);
  assert.match(w.published[0].msg.messageId, /^update-client-preview-/);
});

test('two cycles and two expired steps of the same run refund the reserved ops only once', async () => {
  const w = world({ processes: [proc('a', 'i1', 45), proc('b', 'i1', 50)],
                    project: { imgs: [img], pendingAdvancedOps: 3 } });
  await runCycle(w.deps, CFG);
  await runCycle(w.deps, CFG);
  assert.deepStrictEqual(w.refunds, [['runner', 3]]);
  assert.strictEqual(w.published.length, 2);   // each failed step is reported
});

test('an error event not confirmed keeps the process and refunds nothing (retried next cycle)', async () => {
  const w = world({ processes: [proc('a', 'i1', 45)], project: { imgs: [img], pendingAdvancedOps: 2 },
                    unconfirmed: true });
  assert.deepStrictEqual(await runCycle(w.deps, CFG), ['retry']);
  assert.deepStrictEqual([w.refunds, w.project.pendingAdvancedOps, w.processes.length], [[], 2, 1]);
});

test('a failed refund restores the reserved ops and keeps the process; the next cycle completes', async () => {
  const w = world({ processes: [proc('a', 'i1', 45)], project: { imgs: [img], pendingAdvancedOps: 2 },
                    refundFails: 1 });
  assert.deepStrictEqual(await runCycle(w.deps, CFG), ['retry']);
  assert.deepStrictEqual([w.refunds, w.project.pendingAdvancedOps, w.processes.length], [[], 2, 1]);
  assert.deepStrictEqual(await runCycle(w.deps, CFG), ['expired']);
  assert.deepStrictEqual([w.refunds, w.project.pendingAdvancedOps, w.processes.length], [[['runner', 2]], 0, 0]);
});

test('a step whose reply is being handled by process_msg is skipped, then checked on the next cycle', async () => {
  const w = world({ processes: [proc('a', 'i1', 45)], project: { imgs: [img], pendingAdvancedOps: 2 } });
  assert.strictEqual(acquireMsgLock('request-a'), true);       // process_msg is handling its reply
  assert.deepStrictEqual(await runCycle(w.deps, CFG), ['busy']);
  assert.deepStrictEqual([w.published, w.refunds, w.processes.length], [[], [], 1]);
  releaseMsgLock('request-a');
  // process_msg finished the step: the process is gone, so no error and no refund
  w.processes = [];
  assert.deepStrictEqual(await runCycle(w.deps, CFG), []);
  assert.deepStrictEqual([w.published, w.refunds], [[], []]);
});

test('a step handled between the listing and the lock is not failed (fresh read under the lock)', async () => {
  const w = world({ processes: [proc('a', 'i1', 45)], project: { imgs: [img], pendingAdvancedOps: 2 } });
  const listed = [...w.processes];
  w.deps.listProcesses = async () => listed;     // stale listing
  w.processes = [];                              // process_msg removed it meanwhile
  assert.deepStrictEqual(await runCycle(w.deps, CFG), ['gone']);
  assert.deepStrictEqual([w.published, w.refunds], [[], []]);
});

test('healthy steps never take the lock, and the lock is released even when acting fails', async () => {
  const w = world({ processes: [proc('a', 'i1', 10), proc('b', 'i1', 45)],
                    project: { imgs: [img], pendingAdvancedOps: 2 }, unconfirmed: true });
  assert.deepStrictEqual(await runCycle(w.deps, CFG), ['ok', 'retry']);
  assert.deepStrictEqual(w.locks, ['request-b']);              // only the expired one
  assert.strictEqual(acquireMsgLock('request-b'), true);       // released after the failure
  releaseMsgLock('request-b');
});
