// Dedicated UC-VID-002 connection: never declares or consumes colleagues' queues.
const amqp = require("amqplib");
const EXCHANGE = "picturas";
const REQUESTS = "video_compression_queue";
const RESULTS = "video_compression_results_queue";
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
  for (const queue of [REQUESTS, RESULTS]) {
    await ch.assertQueue(queue, { durable: true });
    await ch.bindQueue(queue, EXCHANGE, queue);
  }
  return ch;
}

function channel() {
  if (!channelPromise) {
    channelPromise = openChannel().catch((e) => { channelPromise = null; throw e; });
  }
  return channelPromise;
}

async function sendRequest(body) {
  const ch = await channel();
  await new Promise((resolve, reject) => ch.publish(
    EXCHANGE, REQUESTS, Buffer.from(JSON.stringify(body)),
    { persistent: true, contentType: "application/json" },
    (err) => err ? reject(err) : resolve(),
  ));
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

module.exports = { sendRequest, consumeResults };
