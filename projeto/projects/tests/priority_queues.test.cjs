// REQ-VID-QUOTA-003: Premium requests of the anonymization and background-removal tools go to the
// tool's own priority queue (the old high_priority_queue had no consumer). No RabbitMQ needed:
//   node --test projects/tests/priority_queues.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const definitions = JSON.parse(fs.readFileSync(path.resolve(root, "../rabbitMQ/definitions.json"), "utf8"));

function loadProjectMsg() {
  const sent = [];
  const context = { module: { exports: {} }, require: (name) => {
    if (name === "./rabbit_mq") return { send_rabbit_msg: (msg, queue, options) => sent.push({ msg, queue, options }), read_rabbit_msg() {} };
    return require(name);
  } };
  vm.runInNewContext(fs.readFileSync(path.join(root, "utils/project_msg.js"), "utf8"), context);
  return { lib: context.module.exports, sent };
}

function loadRabbit() {
  const calls = [];
  const channel = {
    assertExchange: (...args) => calls.push(["assertExchange", ...args]),
    assertQueue: (queue, options, cb) => { calls.push(["assertQueue", queue, options]); cb(null, { queue }); },
    bindQueue: (queue, exchange, key, args, cb) => { calls.push(["bindQueue", queue, exchange, key]); cb(null); },
    publish: (exchange, key, body, options) => calls.push(["publish", exchange, key, JSON.parse(body.toString()), options]),
  };
  const amqp = { connect: (url, cb) => cb(null, { createChannel: (cb2) => cb2(null, channel), close() {} }) };
  const context = { module: { exports: {} }, process, Buffer, setTimeout: () => {}, require: (name) => name === "amqplib/callback_api" ? amqp : require(name) };
  vm.runInNewContext(fs.readFileSync(path.join(root, "utils/rabbit_mq.js"), "utf8"), context);
  return { lib: context.module.exports, calls };
}

test("Premium anonymization and background-removal requests go to the tool's own queue with priority 5", () => {
  const { lib, sent } = loadProjectMsg();
  for (const tool of ["privacy_blur", "video_bg_remove"]) {
    for (const [userType, priority] of [["premium", 5], ["free", 0]]) {
      lib.send_msg_tool("id", "ts", "in.mp4", "out.mp4", tool, {}, "runner", userType);
      const request = sent.at(-1);
      assert.equal(request.queue, `${tool}_requests_queue`);
      assert.equal(request.options.priority, priority);
      assert.equal(request.options.queueArguments["x-max-priority"], 10);
      assert.equal(request.msg.procedure, tool);
    }
  }
  assert.equal(sent.some((request) => request.queue === "high_priority_queue"), false);
});

test("image tools keep their queue and the original message format", () => {
  const { lib, sent } = loadProjectMsg();
  lib.send_msg_tool("id", "ts", "in.png", "out.png", "brightness", { brightness: 1 }, "runner", "premium");
  assert.equal(sent[0].queue, "brightness_queue");
  assert.equal(sent[0].options, undefined);
});

test("the request queue is declared with priority and bound before the message is published", () => {
  const { lib, calls } = loadRabbit();
  lib.send_rabbit_msg({ procedure: "privacy_blur" }, "privacy_blur_requests_queue", { queueArguments: { "x-max-priority": 10 }, priority: 5 });
  const names = calls.map((call) => call[0]);
  assert.ok(names.indexOf("assertQueue") < names.indexOf("bindQueue"));
  assert.ok(names.indexOf("bindQueue") < names.indexOf("publish"));
  const [, , options] = calls.find((call) => call[0] === "assertQueue");
  assert.equal(options.arguments["x-max-priority"], 10);
  const publish = calls.find((call) => call[0] === "publish");
  assert.equal(publish[2], "privacy_blur_requests_queue");
  assert.equal(publish[4].priority, 5);
  assert.equal(publish[4].persistent, true);
});

test("sending without options keeps the previous behaviour (no queue declaration, no properties)", () => {
  const { lib, calls } = loadRabbit();
  lib.send_rabbit_msg({ op: "x" }, "ws_queue");
  assert.equal(calls.some((call) => call[0] === "assertQueue"), false);
  assert.equal(calls.find((call) => call[0] === "publish")[4], undefined);
});

test("RabbitMQ definitions declare both request queues with priority and no unconsumed priority queues", () => {
  const queues = Object.fromEntries(definitions.queues.map((q) => [q.name, q.arguments]));
  for (const name of ["privacy_blur_requests_queue", "video_bg_remove_requests_queue"]) {
    assert.equal(queues[name]["x-max-priority"], 10, name);
    assert.ok(definitions.bindings.some((b) => b.destination === name && b.routing_key === name), name);
  }
  for (const name of ["high_priority_queue", "video_bg_remove_queue_priority", "privacy_blur_queue", "video_bg_remove_queue"])
    assert.equal(name in queues, false, name);
});
