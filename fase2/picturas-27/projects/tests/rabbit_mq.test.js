// Tests of utils/rabbit_mq.js (DA-R2) with an in-memory amqplib double.
const test = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');

const rabbit = require('../utils/rabbit_mq');

function fakeBroker({ failFirstConnects = 0, confirmFails = false } = {}) {
  const broker = { connects: 0, published: [], acks: [], nacks: [], log: [], consumers: {}, queueTypes: {} };
  broker.connect = async () => {
    broker.connects += 1;
    if (broker.connects <= failFirstConnects) throw new Error('broker down');
    const conn = new EventEmitter();
    conn.createConfirmChannel = async () => ({
      assertExchange: async () => {},
      publish(ex, queue, content, opts, cb) {
        broker.published.push({ queue, msg: JSON.parse(content), persistent: opts.persistent });
        broker.log.push(`publish:${queue}`);
        setImmediate(() => cb(null));
      },
      waitForConfirms: async () => {
        await new Promise((r) => setImmediate(r));
        if (confirmFails) throw new Error('channel closed');
        broker.log.push('confirmed');
      },
    });
    conn.createChannel = async () => ({
      assertExchange: async () => {},
      assertQueue: async (queue, opts) => { broker.queueTypes[queue] = opts.arguments['x-queue-type']; },
      consume: async (queue, onMsg, opts) => { broker.consumers[queue] = { onMsg, opts }; },
      ack: (msg) => { broker.acks.push(msg.id); broker.log.push(`ack:${msg.id}`); },
      nack: (msg, allUpTo, requeue) => { broker.nacks.push([msg.id, requeue]); },
    });
    return conn;
  };
  broker.deliver = (queue, id) => broker.consumers[queue].onMsg({ id, content: Buffer.from('{}') });
  return broker;
}

const until = async (cond, ms = 3000) => {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 5));
  }
};

test('publishes are persistent, confirmed, and share one connection', async () => {
  const broker = fakeBroker();
  rabbit._setConnectForTests(broker.connect);
  await Promise.all([
    rabbit.send_rabbit_msg({ n: 1 }, 'border_queue'),
    rabbit.send_rabbit_msg({ n: 2 }, 'ws_queue'),
    rabbit.send_rabbit_msg({ n: 3 }, 'video_queue'),
  ]);
  assert.strictEqual(broker.connects, 1);
  assert.deepStrictEqual(broker.published.map((p) => [p.queue, p.msg.n, p.persistent]),
    [['border_queue', 1, true], ['ws_queue', 2, true], ['video_queue', 3, true]]);
});

test('a result is acked only after its async handler and its publishes are done', async () => {
  const broker = fakeBroker();
  rabbit._setConnectForTests(broker.connect);
  rabbit.read_rabbit_msg('project_queue', async () => {
    await new Promise((r) => setTimeout(r, 30));
    rabbit.send_rabbit_msg({ next: 'step' }, 'contrast_queue');   // not awaited, like the callers
    await new Promise((r) => setTimeout(r, 10));
  });
  await until(() => broker.consumers.project_queue);
  assert.strictEqual(broker.consumers.project_queue.opts.noAck, false);
  assert.strictEqual(broker.queueTypes.project_queue, 'quorum');   // as in definitions.json
  broker.deliver('project_queue', 'm1');
  await until(() => broker.acks.length === 1);
  assert.deepStrictEqual(broker.log, ['publish:contrast_queue', 'confirmed', 'ack:m1']);
});

test('no ack when the publishes cannot be confirmed (left for redelivery)', async () => {
  const broker = fakeBroker({ confirmFails: true });
  rabbit._setConnectForTests(broker.connect);
  rabbit.read_rabbit_msg('project_queue', async () => {});
  await until(() => broker.consumers.project_queue);
  broker.deliver('project_queue', 'm1');
  await new Promise((r) => setTimeout(r, 50));
  assert.deepStrictEqual(broker.acks, []);
});

test('a failing handler gets its message requeued (bounded by the queue delivery limit)', async () => {
  const broker = fakeBroker();
  rabbit._setConnectForTests(broker.connect);
  rabbit.read_rabbit_msg('project_queue', async () => { throw new Error('boom'); });
  await until(() => broker.consumers.project_queue);
  broker.deliver('project_queue', 'm1');
  await until(() => broker.nacks.length === 1);
  assert.deepStrictEqual(broker.nacks, [['m1', true]]);
  assert.deepStrictEqual(broker.acks, []);
});

test('the dead-letter queue can be consumed as a classic queue', async () => {
  const broker = fakeBroker();
  rabbit._setConnectForTests(broker.connect);
  rabbit.read_rabbit_msg('picturas.dlq', async () => {}, { queueType: 'classic' });
  await until(() => broker.consumers['picturas.dlq']);
  assert.strictEqual(broker.queueTypes['picturas.dlq'], 'classic');
});

test('publishes made while the broker is down are sent after reconnecting', async () => {
  const broker = fakeBroker({ failFirstConnects: 1 });
  rabbit._setConnectForTests(broker.connect);
  const sent = rabbit.send_rabbit_msg({ n: 1 }, 'ws_queue');
  assert.deepStrictEqual(broker.published, []);
  await sent;                                   // resolves after the retry (1 s backoff)
  assert.strictEqual(broker.connects, 2);
  assert.deepStrictEqual(broker.published.map((p) => p.msg.n), [1]);
});
