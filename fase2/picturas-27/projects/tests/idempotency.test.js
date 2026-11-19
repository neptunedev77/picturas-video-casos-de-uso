// Tests of utils/idempotency.js and of the frame-result guard (DA-R5, part 2).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  acquireMsgLock, releaseMsgLock, successorMsgId, createSuccessorOnce, resultExists,
} = require('../utils/idempotency');
const { persistFrameResults } = require('../utils/frameResults');

// In-memory stand-ins for the Process and Result collections (Model.exists semantics).
function store() {
  const s = { processes: [], results: [], sent: [] };
  const match = (doc, q) => Object.entries(q).every(([k, v]) => String(doc[k]) === String(v));
  s.processExists = async (q) => s.processes.some((d) => match(d, q));
  s.resultExists = async (q) => s.results.some((d) => match(d, q));
  return s;
}

// The idempotent part of handling one tool reply, in the order process_msg uses.
async function handleReply(s, process, reply) {
  if (!acquireMsgLock(process.msg_id)) return 'skipped';
  try {
    if (!(await resultExists(s.resultExists, process, reply.file_name))) {
      s.results.push({ project_id: process.project_id, img_id: process.img_id,
                       token: process.token, file_name: reply.file_name });
    }
    const successor = { ...process, msg_id: successorMsgId(process.msg_id, process.cur_pos + 1),
                        cur_pos: process.cur_pos + 1 };
    if (await createSuccessorOnce(s.processExists, async (p) => s.processes.push(p), successor)) {
      s.sent.push(successor.msg_id);
    }
    return 'handled';
  } finally {
    releaseMsgLock(process.msg_id);
  }
}

const proc = { msg_id: 'request-abc', cur_pos: 0, project_id: 'p', img_id: 'i', token: 3 };

test('successor ids are deterministic and keep the preview prefix', () => {
  assert.strictEqual(successorMsgId('request-abc', 1), 'request-abc-s1');
  assert.strictEqual(successorMsgId('request-abc-s1', 2), 'request-abc-s2');
  assert.strictEqual(successorMsgId('preview-abc-s2', 3), 'preview-abc-s3');
  assert.match(successorMsgId('preview-abc', 1), /preview/);
});

test('the same reply delivered twice creates one successor, one result and one request', async () => {
  const s = store();
  assert.strictEqual(await handleReply(s, proc, { file_name: 'x_obj_ai_1.txt' }), 'handled');
  assert.strictEqual(await handleReply(s, proc, { file_name: 'x_obj_ai_1.txt' }), 'handled');  // redelivery
  assert.strictEqual(s.processes.length, 1);
  assert.strictEqual(s.results.length, 1);
  assert.deepStrictEqual(s.sent, ['request-abc-s1']);
});

test('a copy arriving while the first is still handled is skipped', async () => {
  assert.strictEqual(acquireMsgLock('request-xyz'), true);
  assert.strictEqual(acquireMsgLock('request-xyz'), false);   // concurrent copy
  releaseMsgLock('request-xyz');
  assert.strictEqual(acquireMsgLock('request-xyz'), true);    // free again after the first ends
  releaseMsgLock('request-xyz');
});

test('a distinct step of the same image is not mistaken for a duplicate', async () => {
  const s = store();
  await handleReply(s, proc, { file_name: 'x_obj_ai_1.txt' });
  await handleReply(s, { ...proc, msg_id: 'request-abc-s1', cur_pos: 1 }, { file_name: 'x_people_ai_2.txt' });
  assert.strictEqual(s.results.length, 2);
  assert.deepStrictEqual(s.sent, ['request-abc-s1', 'request-abc-s2']);
});

test('frame results already stored are skipped when the reply is redelivered', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'frames-'));
  const dir = path.join(root, 'out', 'frames');
  fs.mkdirSync(dir, { recursive: true });
  for (const f of ['f1.png', 'f2.png']) fs.writeFileSync(path.join(dir, f), 'x');
  const process = { img_id: 'v1', project_id: 'p', user_id: 'u', token: 1, new_img_uri: 'out/video.mp4' };
  const output = { imageURI: 'out/frames', frames: [{ file: 'out/frames/f1.png', time: 0 }, { file: 'out/frames/f2.png', time: 1 }] };
  const results = [];
  const storage = {
    upload: async (file, name) => `key-${name}`,
    create: async (r) => { results.push(r); return { _id: r.file_name }; },
    removeResult: async () => {}, removeImage: async () => {},
    exists: async (name) => results.some((r) => r.file_name === name),
  };
  await persistFrameResults(output, process, storage, root);
  await persistFrameResults(output, process, storage, root);   // redelivered reply
  assert.deepStrictEqual(results.map((r) => r.file_name), ['v1-f1.png', 'v1-f2.png']);
  fs.rmSync(root, { recursive: true, force: true });
});
