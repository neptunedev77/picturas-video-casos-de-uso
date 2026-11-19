// Tests of utils/dead_letter.js (DA-R3) with injected dependencies (no MongoDB, no RabbitMQ).
const test = require('node:test');
const assert = require('node:assert');

const { handle_dead_letter, processMsgId } = require('../utils/dead_letter');

function deps({ process = null, failGet = false, failDelete = false, unconfirmed = false,
                pendingOps = 0, failRefund = 0, locked = false } = {}) {
  const d = { published: [], deleted: [], refunds: [], log: [], retryDelayMs: 1, publishTimeoutMs: 20 };
  // project with an optimistic version, as Project.updateIfVersion sees it
  d.project = { _id: 'proj', user_id: 'owner', version: 1, pendingAdvancedOps: pendingOps };
  d.locks = new Set(locked ? ['request-1'] : []);
  d.acquireLock = (id) => (d.locks.has(id) ? false : (d.locks.add(id), true));
  d.releaseLock = (id) => d.locks.delete(id);
  d.getProject = async () => ({ ...d.project });
  d.setPendingOps = async (project, value) => {
    if (project.version !== d.project.version) return null;
    d.project = { ...d.project, pendingAdvancedOps: value, version: d.project.version + 1 };
    return { ...d.project };
  };
  let refundFailures = failRefund;
  d.refund = async (user, n) => {
    if (refundFailures > 0) { refundFailures -= 1; throw new Error('users down'); }
    d.refunds.push([user, n]);
    d.log.push('refund');
  };
  d.getProcess = async (id) => {
    if (failGet) throw new Error('mongo down');
    d.lookedUp = id;
    return process;
  };
  d.deleteProcess = async (p) => {
    if (failDelete) throw new Error('mongo down');
    d.deleted.push(p._id);
    d.log.push('delete');
  };
  d.publish = (msg, queue) => {
    d.published.push({ msg, queue });
    d.log.push('notify');
    return unconfirmed ? new Promise(() => {}) : Promise.resolve();
  };
  return d;
}

const msg = (body) => ({ content: Buffer.from(JSON.stringify(body)) });
const proc = (msg_id) => ({ _id: 'p1', msg_id, user_id: 'owner', runner_id: 'runner', project_id: 'proj' });

test('a request (messageId) and a tool reply (correlationId) map to the process id', () => {
  assert.strictEqual(processMsgId({ messageId: 'request-1' }), 'request-1');
  assert.strictEqual(processMsgId({ messageId: 'border-0-request-1', correlationId: 'request-1' }), 'request-1');
});

test('a dead-lettered job is reported as process-error to its runner and the process is removed', async () => {
  const d = deps({ process: proc('request-1') });
  await handle_dead_letter(msg({ messageId: 'request-1', procedure: 'border' }), d);
  assert.strictEqual(d.lookedUp, 'request-1');
  assert.strictEqual(d.published.length, 1);
  const { msg: event, queue } = d.published[0];
  assert.strictEqual(queue, 'ws_queue');
  assert.match(event.messageId, /^update-client-process-/);      // wsGateway -> process-error
  assert.deepStrictEqual([event.user, event.status, event.errorCode], ['runner', 'error', '30001']);
  assert.match(event.errorMsg, /several attempts/);
  assert.deepStrictEqual(d.deleted, ['p1']);
});

test('a dead-lettered preview job is reported as preview-error', async () => {
  const d = deps({ process: proc('preview-request-1') });
  await handle_dead_letter(msg({ messageId: 'preview-request-1' }), d);
  assert.match(d.published[0].msg.messageId, /^update-client-preview-/);
});

test('a message without a process is acked with only a log line', async () => {
  const d = deps({ process: null });
  await handle_dead_letter(msg({ messageId: 'gone-1' }), d);
  assert.deepStrictEqual([d.published, d.deleted], [[], []]);
  await handle_dead_letter({ content: Buffer.from('not json') }, d);   // must not throw either
});

test('a transient failure is not swallowed: the handler throws so the message is requeued', async () => {
  await assert.rejects(handle_dead_letter(msg({ messageId: 'request-1' }), deps({ failGet: true })));
  const d = deps({ process: proc('request-1'), failDelete: true });
  await assert.rejects(handle_dead_letter(msg({ messageId: 'request-1' }), d));
  assert.strictEqual(d.published.length, 1);   // notified before the failed delete: at-least-once
});

test('an error event not confirmed by the broker keeps the process for a retry', async () => {
  const d = deps({ process: proc('request-1'), unconfirmed: true });
  await assert.rejects(handle_dead_letter(msg({ messageId: 'request-1' }), d));
  assert.deepStrictEqual(d.deleted, []);
});

test('a dead-lettered job refunds the operations reserved for its run, after notifying', async () => {
  const d = deps({ process: proc('request-1'), pendingOps: 3 });
  await handle_dead_letter(msg({ messageId: 'request-1' }), d);
  assert.deepStrictEqual(d.refunds, [['runner', 3]]);          // to whoever ran the job
  assert.deepStrictEqual(d.log, ['notify', 'refund', 'delete']);
  assert.strictEqual(d.project.pendingAdvancedOps, 0);
  assert.strictEqual(d.locks.size, 0);                          // lock released
});

test('nothing reserved: no call to the users service', async () => {
  const d = deps({ process: proc('request-1'), pendingOps: 0 });
  await handle_dead_letter(msg({ messageId: 'request-1' }), d);
  assert.deepStrictEqual([d.refunds, d.deleted], [[], ['p1']]);
});

test('a failed refund keeps the process and is retried, refunding only once', async () => {
  const d = deps({ process: proc('request-1'), pendingOps: 2, failRefund: 1 });
  await assert.rejects(handle_dead_letter(msg({ messageId: 'request-1' }), d));
  assert.deepStrictEqual([d.refunds, d.deleted], [[], []]);
  assert.strictEqual(d.project.pendingAdvancedOps, 2);          // claim rolled back
  assert.strictEqual(d.locks.size, 0);
  await handle_dead_letter(msg({ messageId: 'request-1' }), d);  // the redelivery
  await handle_dead_letter(msg({ messageId: 'request-1' }), d);  // a duplicate copy
  assert.deepStrictEqual(d.refunds, [['runner', 2]]);
});

test('a process being handled (msg_id lock held) is left for a retry, untouched', async () => {
  const d = deps({ process: proc('request-1'), pendingOps: 2, locked: true });
  await assert.rejects(handle_dead_letter(msg({ messageId: 'request-1' }), d));
  assert.deepStrictEqual([d.published, d.refunds, d.deleted], [[], [], []]);
  assert.ok(d.locks.has('request-1'));                          // the holder's lock is kept
});
