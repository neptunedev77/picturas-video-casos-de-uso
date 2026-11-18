// RabbitMQ access for the projects orchestrator (DA-R2).
//
// - One long-lived connection, reused: a confirm channel for publishing and one
//   channel per consumer. Lost connections are re-opened with backoff instead of
//   crashing the process.
// - Every publish is persistent and confirmed by the broker. send_rabbit_msg keeps
//   its signature; it returns a Promise that callers may ignore.
// - While disconnected, publishes wait in memory and are sent after reconnecting
//   (this buffer does not survive the death of the process).
// - A consumed message is acked only after its (async) handler has finished and
//   the publishes made meanwhile are confirmed, so a result is never acked before
//   the next pipeline step is safely on the broker.
const amqp = require('amqplib');

const rabbit_host = process.env.RABBITMQ_HOST;
const rabbit_port = process.env.RABBITMQ_PORT;
const rabbit_username = process.env.RABBITMQ_USER;
const rabbit_password = process.env.RABBITMQ_PASS;
const exchange = "picturas";

const rabbit_mq_sv = `amqp://${rabbit_username}:${rabbit_password}@${rabbit_host}:${rabbit_port}`;

const BACKOFF_MAX_MS = 30000;

let connectFn = (url) => amqp.connect(url);
let state = null;        // { conn, pubCh } while connected
let connecting = null;   // pending connect() promise
let backoff_ms = 1000;
const pending = [];      // publishes waiting for a connection
const consumers = [];    // { queue, callback } to (re)start on every connection

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function connect() {
    if (state) return Promise.resolve(state);
    if (connecting) return connecting;
    connecting = (async () => {
        for (;;) {
            try {
                const conn = await connectFn(rabbit_mq_sv);
                const pubCh = await conn.createConfirmChannel();
                await pubCh.assertExchange(exchange, 'direct', { durable: true });
                conn.on('error', (err) => console.error(`[rabbit] connection error: ${err.message}`));
                conn.on('close', () => {
                    if (state && state.conn === conn) state = null;
                    console.error('[rabbit] connection closed, reconnecting');
                    connect();
                });
                state = { conn, pubCh };
                backoff_ms = 1000;
                for (const c of consumers) await startConsumer(state, c);
                flush();
                return state;
            } catch (err) {
                console.error(`[rabbit] connect failed (${err.message}), retrying in ${backoff_ms} ms`);
                await sleep(backoff_ms);
                backoff_ms = Math.min(backoff_ms * 2, BACKOFF_MAX_MS);
            }
        }
    })().finally(() => { connecting = null; });
    return connecting;
}

function doPublish(item) {
    const s = state;
    if (!s) { pending.push(item); connect(); return; }
    try {
        s.pubCh.publish(exchange, item.queue, item.content, { persistent: true }, (err) => {
            if (err) { pending.push(item); connect(); }   // not confirmed: send again later
            else item.resolve();
        });
    } catch (err) {
        pending.push(item);
        connect();
    }
}

function flush() {
    while (state && pending.length) doPublish(pending.shift());
}

function send_rabbit_msg(msg, queue) {
    return new Promise((resolve) => {
        doPublish({ queue, content: Buffer.from(JSON.stringify(msg)), resolve });
    });
}

async function startConsumer(s, { queue, callback }) {
    const ch = await s.conn.createChannel();
    await ch.assertExchange(exchange, 'direct', { durable: true });
    await ch.assertQueue(queue, { durable: true });
    await ch.consume(queue, async (msg) => {
        if (msg == null) return;
        let failed = null;
        try {
            await callback(msg);
        } catch (err) {
            failed = err;
        }
        try {
            // every publish the handler made is on the broker before the ack
            await s.pubCh.waitForConfirms();
            if (failed) {
                // Same outcome as before DA-R2 (the message was always acked): no
                // redelivery loop. The failure policy is decided separately (R2-b).
                console.error(`[rabbit] handler failed on ${queue}: ${failed.message}`);
            }
            ch.ack(msg);
        } catch (err) {
            // connection lost: no ack, the broker redelivers the message
            console.error(`[rabbit] message on ${queue} left for redelivery: ${err.message}`);
        }
    }, { noAck: false });
}

function read_rabbit_msg(queue, callback) {
    const c = { queue, callback };
    consumers.push(c);
    if (state) startConsumer(state, c).catch((err) => console.error(`[rabbit] consume failed: ${err.message}`));
    else connect();
}

// test seam: replace amqplib.connect and reset the module state
function _setConnectForTests(fn) {
    connectFn = fn;
    state = null;
    connecting = null;
    backoff_ms = 1000;
    pending.length = 0;
    consumers.length = 0;
}

module.exports = { send_rabbit_msg, read_rabbit_msg, _setConnectForTests };
