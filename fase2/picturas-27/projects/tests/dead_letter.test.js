// Tests of utils/dead_letter.js (DA-R3) with injected dependencies (no MongoDB, no RabbitMQ).
const test = require('node:test');
const assert = require('node:assert');

const { handle_dead_letter, processMsgId } = require('../utils/dead_letter');

function deps({ process = null, failGet = false, failDelete = false, unconfirmed = false } = {}) {
  const d = { published: [], deleted: [], retryDelayMs: 1, publishTimeoutMs: 20 };
  d.getProcess = async (id) => {
    if (failGet) throw new Error('mongo down');
    d.lookedUp = id;
    return process;
  };
  d.deleteProcess = async (p) => {
    if (failDelete) throw new Error('mongo down');
    d.deleted.push(p._id);
  };
  d.publish = (msg, queue) => {
    d.published.push({ msg, queue });
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
