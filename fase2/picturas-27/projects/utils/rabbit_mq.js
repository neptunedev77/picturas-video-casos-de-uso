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
// - A handler that fails gets its message requeued (DA-R3): the work queues are
//   quorum queues whose policy limits the deliveries and then dead-letters the
//   message to picturas.dlq.
const amqp = require('amqplib');

const rabbit_host = process.env.RABBITMQ_HOST;
const rabbit_port = process.env.RABBITMQ_PORT;
const rabbit_username = process.env.RABBITMQ_USER;
const rabbit_password = process.env.RABBITMQ_PASS;
const exchange = "picturas";

const rabbit_mq_sv = `amqp://${rabbit_username}:${rabbit_password}@${rabbit_host}:${rabbit_port}`;

const BACKOFF_MAX_MS = 30000;
const NACK_RETRY_MS = 1000;   // pause before resending a publish the broker refused

let connectFn = (url) => amqp.connect(url);
let state = null;        // { conn, pubCh } while connected
let connecting = null;   // pending connect() promise
let backoff_ms = 1000;
const pending = [];      // publishes waiting for a connection
const consumers = [];    // { queue, callback, queueType } to (re)start on every connection

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

// Keeps a publish that was not confirmed and sends it again later. While connected,
// connect() returns at once and does not flush, so the retry is scheduled here; without it a
// publish refused by the broker (nack) would wait for the next reconnection.
function retryLater(item) {
    pending.push(item);
    if (!state) { connect(); return; }
    setTimeout(flush, NACK_RETRY_MS);
}

function doPublish(item) {
    const s = state;
    if (!s) { pending.push(item); connect(); return; }
    try {
        s.pubCh.publish(exchange, item.queue, item.content, { persistent: true }, (err) => {
            if (err) {
                console.error(`[rabbit] publish to ${item.queue} not confirmed, sending it again`);
                retryLater(item);
            } else item.resolve();
        });
    } catch (err) {
        retryLater(item);
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

async function startConsumer(s, { queue, callback, queueType }) {
    const ch = await s.conn.createChannel();
    await ch.assertExchange(exchange, 'direct', { durable: true });
    // the type must match rabbitMQ/definitions.json, or RabbitMQ refuses the declaration
    await ch.assertQueue(queue, { durable: true, arguments: { 'x-queue-type': queueType } });
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
                // requeue; the delivery limit of the queue policy bounds the retries
                console.error(`[rabbit] handler failed on ${queue}, requeueing: ${failed.message}`);
                ch.nack(msg, false, true);
            } else {
                ch.ack(msg);
            }
        } catch (err) {
            // a publish was refused (nack) or the connection was lost. Requeue the message so
            // it is not left unacked on a channel that is still open (the broker would not
            // redeliver it until the connection closes); the delivery limit bounds the retries.
            // If the channel is gone the nack fails and the broker redelivers it anyway.
            console.error(`[rabbit] publishes of a message on ${queue} not confirmed, requeueing: ${err.message}`);
            try {
                ch.nack(msg, false, true);
            } catch (nackErr) {
                console.error(`[rabbit] message on ${queue} left for redelivery: ${nackErr.message}`);
            }
        }
    }, { noAck: false });
}

function read_rabbit_msg(queue, callback, { queueType = 'quorum' } = {}) {
    const c = { queue, callback, queueType };
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
