// UC-VID-001: ligação persistente ao RabbitMQ para o serviço silence_removal.
// (Os utilitários existentes abrem uma ligação por mensagem e não suportam prioridade.)
const amqp = require("amqplib");

const url = `amqp://${process.env.RABBITMQ_USER}:${process.env.RABBITMQ_PASS}@${process.env.RABBITMQ_HOST}:${process.env.RABBITMQ_PORT}`;
const EXCHANGE = "picturas";
const REQUESTS_QUEUE = "silence_removal_queue";
const RESULTS_QUEUE = "silence_results_queue";
const CANCEL_ROUTING_KEY = "silence_cancel";
const WS_QUEUE = "ws_queue";

let channelPromise = null;

async function openChannel() {
  const conn = await amqp.connect(url);
  conn.on("error", (e) => console.error("[SILENCE][MQ] erro na ligação:", e.message));
  conn.on("close", () => {
    console.warn("[SILENCE][MQ] ligação fechada; será reaberta no próximo uso");
    channelPromise = null;
  });
  const ch = await conn.createConfirmChannel();
  await ch.assertExchange(EXCHANGE, "direct", { durable: true });
  await ch.assertQueue(REQUESTS_QUEUE, { durable: true, arguments: { "x-max-priority": 10 } });
  await ch.bindQueue(REQUESTS_QUEUE, EXCHANGE, REQUESTS_QUEUE);
  await ch.assertQueue(RESULTS_QUEUE, { durable: true });
  await ch.bindQueue(RESULTS_QUEUE, EXCHANGE, RESULTS_QUEUE);
  return ch;
}

function getChannel() {
  if (!channelPromise) {
    channelPromise = openChannel().catch((e) => {
      channelPromise = null;
      throw e;
    });
  }
  return channelPromise;
}

async function publish(routingKey, body, options = {}) {
  const ch = await getChannel();
  await new Promise((resolve, reject) => {
    ch.publish(
      EXCHANGE,
      routingKey,
      Buffer.from(JSON.stringify(body)),
      { persistent: true, contentType: "application/json", ...options },
      (err) => (err ? reject(err) : resolve())
    );
  });
}

// Pedido de análise ou de aplicação; premium com prioridade (REQ-VID-SIL-018)
function sendRequest(msg, userType) {
  return publish(REQUESTS_QUEUE, msg, { priority: userType === "premium" ? 5 : 0 });
}

function sendCancel(jobId) {
  return publish(CANCEL_ROUTING_KEY, { jobId });
}

// Atualização em tempo real para o browser (reencaminhada pelo wsGateway)
function sendClientUpdate(userId, payload) {
  if (!userId) return Promise.resolve();
  return publish(WS_QUEUE, {
    messageId: `silence-update-${payload.jobId || ""}`,
    timestamp: new Date().toISOString(),
    type: "silence-update",
    user: String(userId),
    ...payload,
  }).catch((e) => console.error("[SILENCE][MQ] falha a enviar atualização:", e.message));
}

// Consumidor das respostas do serviço silence_removal (com nova tentativa se o RabbitMQ não estiver pronto)
function consumeResults(handler) {
  const start = async () => {
    try {
      const ch = await getChannel();
      await ch.prefetch(10);
      await ch.consume(RESULTS_QUEUE, async (msg) => {
        if (!msg) return;
        try {
          await handler(JSON.parse(msg.content.toString()));
        } catch (e) {
          console.error("[SILENCE] erro a tratar resposta:", e);
        } finally {
          ch.ack(msg);
        }
      });
      ch.on("close", () => setTimeout(start, 5000));
      console.log(`[SILENCE] à escuta de respostas em '${RESULTS_QUEUE}'`);
    } catch (e) {
      console.error("[SILENCE][MQ] não foi possível ligar ao RabbitMQ:", e.message, "- nova tentativa em 5 s");
      setTimeout(start, 5000);
    }
  };
  start();
}

module.exports = { sendRequest, sendCancel, sendClientUpdate, consumeResults };
