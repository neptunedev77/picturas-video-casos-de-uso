// Dedicated UC-VID-002 connection: never declares or consumes colleagues' queues.
const amqp = require("amqplib");
const EXCHANGE = "picturas";
// Priority queue (REQ-VID-QUOTA-003). A new name: a durable queue's arguments cannot change in place.
const REQUESTS = "video_compression_requests_queue";
const RESULTS = "video_compression_results_queue";
const WS_QUEUE = "ws_queue";
const PRIORITY = { premium: 5, free: 0 };
let channelPromise;

async function openChannel() {
  const connection = await amqp.connect({
    hostname: process.env.RABBITMQ_HOST || "rabbitmq",
    port: Number(process.env.RABBITMQ_PORT || 5672),
    username: process.env.RABBITMQ_USER || "user",
    password: process.env.RABBITMQ_PASS || "password",
  });
  connection.on("error", (e) => console.error("[COMPRESSION][MQ]", e.message));
  connection.on("close", () => { channelPromise = null; });
  const ch = await connection.createConfirmChannel();
  ch.on("error", (e) => console.error("[COMPRESSION][MQ]", e.message));
  ch.on("close", () => { channelPromise = null; });
  await ch.assertExchange(EXCHANGE, "direct", { durable: true });
  await ch.assertQueue(REQUESTS, { durable: true, arguments: { "x-max-priority": 10 } });
  await ch.bindQueue(REQUESTS, EXCHANGE, REQUESTS);
  await ch.assertQueue(RESULTS, { durable: true });
  await ch.bindQueue(RESULTS, EXCHANGE, RESULTS);
  return ch;
}

function channel() {
  if (!channelPromise) {
    channelPromise = openChannel().catch((e) => { channelPromise = null; throw e; });
  }
  return channelPromise;
}

async function publish(routingKey, body, options = {}) {
  const ch = await channel();
  await new Promise((resolve, reject) => ch.publish(
    EXCHANGE, routingKey, Buffer.from(JSON.stringify(body)),
    { persistent: true, contentType: "application/json", ...options },
    (err) => err ? reject(err) : resolve(),
  ));
}

function sendRequest(body) {
  return publish(REQUESTS, body, { priority: PRIORITY[body.userType] ?? 0 });
}

// Real-time state for the browser of whoever ran the job, forwarded by wsGateway (REQ-VID-STATUS-001).
function sendClientUpdate(userId, payload) {
  if (!userId) return Promise.resolve();
  return publish(WS_QUEUE, {
    messageId: `compression-update-${payload.jobId || ""}`,
    timestamp: new Date().toISOString(),
    type: "compression-update",
    user: String(userId),
    ...payload,
  }).catch((e) => console.error("[COMPRESSION][MQ] Update not delivered:", e.message));
}

function consumeResults(handler) {
  let retry;
  function schedule() {
    if (!retry) retry = setTimeout(() => { retry = null; start(); }, 5000);
  }
  async function start() {
    try {
      const ch = await channel();
      ch.once("close", schedule);
      await ch.prefetch(1);
      await ch.consume(RESULTS, async (msg) => {
        if (!msg) { schedule(); return; }
        let body;
        try { body = JSON.parse(msg.content.toString()); }
        catch (_) { ch.reject(msg, false); return; }
        try {
          await handler(body);
          ch.ack(msg);
        } catch (e) {
          console.error("[COMPRESSION] Failed to persist worker response:", e.message);
          // Reconnect before retrying, avoiding an immediate requeue loop on DB errors.
          await ch.close().catch(() => {});
        }
      });
    } catch (e) {
      console.error("[COMPRESSION][MQ]", e.message);
      schedule();
    }
  }
  start();
}

module.exports = { sendRequest, sendClientUpdate, consumeResults, REQUESTS };
