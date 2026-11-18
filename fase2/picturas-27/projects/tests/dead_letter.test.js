// Tests of utils/dead_letter.js (DA-R3) with injected dependencies (no MongoDB, no RabbitMQ).
const test = require('node:test');
const assert = require('node:assert');

const { handle_dead_letter, processMsgId } = require('../utils/dead_letter');

function deps({ process = null, failGet = false, failDelete = false } = {}) {
  const d = { errors: [], previewErrors: [], deleted: [], retryDelayMs: 1 };
  d.getProcess = async (id) => {
    if (failGet) throw new Error('mongo down');
    d.lookedUp = id;
    return process;
  };
  d.deleteProcess = async (p) => {
    if (failDelete) throw new Error('mongo down');
    d.deleted.push(p._id);
  };
  d.sendError = (...args) => d.errors.push(args);
  d.sendPreviewError = (...args) => d.previewErrors.push(args);
  return d;
}

const msg = (body) => ({ content: Buffer.from(JSON.stringify(body)) });
const proc = { _id: 'p1', user_id: 'owner', runner_id: 'runner', project_id: 'proj' };

test('a request (messageId) and a tool reply (correlationId) map to the process id', () => {
  assert.strictEqual(processMsgId({ messageId: 'request-1' }), 'request-1');
  assert.strictEqual(processMsgId({ messageId: 'border-0-request-1', correlationId: 'request-1' }), 'request-1');
});

test('a dead-lettered job is reported as process-error to its runner and the process is removed', async () => {
  const d = deps({ process: proc });
  await handle_dead_letter(msg({ messageId: 'request-1', procedure: 'border' }), d);
  assert.strictEqual(d.lookedUp, 'request-1');
  assert.strictEqual(d.errors.length, 1);
  const [, , user, code, text] = d.errors[0];
  assert.deepStrictEqual([user, code], ['runner', '30001']);
  assert.match(text, /several attempts/);
  assert.deepStrictEqual(d.previewErrors, []);
  assert.deepStrictEqual(d.deleted, ['p1']);
});

test('a dead-lettered preview job is reported as preview-error', async () => {
  const d = deps({ process: proc });
  await handle_dead_letter(msg({ messageId: 'preview-request-1' }), d);
  assert.strictEqual(d.previewErrors.length, 1);
  assert.deepStrictEqual(d.errors, []);
});

test('a message without a process is acked with only a log line', async () => {
  const d = deps({ process: null });
  await handle_dead_letter(msg({ messageId: 'gone-1' }), d);
  assert.deepStrictEqual([d.errors, d.previewErrors, d.deleted], [[], [], []]);
  await handle_dead_letter({ content: Buffer.from('not json') }, d);   // must not throw either
});

test('a transient failure is not swallowed: the handler throws so the message is requeued', async () => {
  await assert.rejects(handle_dead_letter(msg({ messageId: 'request-1' }), deps({ failGet: true })));
  const d = deps({ process: proc, failDelete: true });
  await assert.rejects(handle_dead_letter(msg({ messageId: 'request-1' }), d));
  assert.strictEqual(d.errors.length, 1);   // notified before the failed delete: at-least-once
});
