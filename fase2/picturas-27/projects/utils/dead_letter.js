// Consumer of picturas.dlq (DA-R3): a job message that exhausted its deliveries on a
// work queue is reported to the user through the existing process-error /
// preview-error events, and its process is removed.
//
// Delivery guarantee: at-least-once. The dead-lettered message is acked only after the
// error event is confirmed by the broker and the process deleted. A transient failure
// (e.g. MongoDB unavailable) is retried after a pause instead of being dropped; the
// user may therefore, rarely, receive the same error twice.
const { v4: uuidv4 } = require('uuid');
const { read_rabbit_msg, send_rabbit_msg } = require('./rabbit_mq');

const DLQ = 'picturas.dlq';
const RETRY_DELAY_MS = 5000;
const PUBLISH_TIMEOUT_MS = 5000;
const ERROR_CODE = '30001';
const ERROR_MSG = 'The job could not be completed after several attempts';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function defaultDeps() {
    const Process = require('../controllers/process');
    return {
        getProcess: (msg_id) => Process.getOneByMsgId(msg_id),
        deleteProcess: (p) => Process.delete(p.user_id, p.project_id, p._id),
        publish: send_rabbit_msg,
        retryDelayMs: RETRY_DELAY_MS,
        publishTimeoutMs: PUBLISH_TIMEOUT_MS,
    };
}

// The process id of a job message: a request sent by projects carries it as messageId,
// a reply from a tool as correlationId (the same convention process_msg uses).
function processMsgId(content) {
    return content.correlationId || content.messageId || null;
}

// Sends the error event of a failed process to its user (shared by the DLQ consumer and
// the watchdog) and waits for the broker to confirm it. Same message as
// project_msg.send_msg_client_error / _preview_error: wsGateway turns it into
// process-error or preview-error from the messageId prefix. Rejects if not confirmed.
async function notify_failure(process, code, text, deps) {
    const kind = /preview/.test(process.msg_id) ? 'preview' : 'process';
    const msg = {
        messageId: `update-client-${kind}-${uuidv4()}`,
        timestamp: new Date().toISOString(),
        user: process.runner_id || process.user_id,
        status: 'error',
        errorCode: code,
        errorMsg: text,
    };
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('error event not confirmed by the broker')),
            deps.publishTimeoutMs);
    });
    try {
        await Promise.race([deps.publish(msg, 'ws_queue'), timeout]);
    } finally {
        clearTimeout(timer);
    }
}

async function handle_dead_letter(msg, deps = defaultDeps()) {
    let content;
    try {
        content = JSON.parse(msg.content.toString());
    } catch (err) {
        console.error(`[dlq] unreadable message dropped: ${err.message}`);
        return;
    }
    const msg_id = processMsgId(content);
    if (!msg_id) {
        console.error('[dlq] message without messageId/correlationId dropped');
        return;
    }
    try {
        const process = await deps.getProcess(msg_id);
        if (!process) {
            console.error(`[dlq] ${msg_id}: no process (already finished or cancelled)`);
            return;
        }
        // notify first, then delete: a failure in between leads to a retry, never to silence
        await notify_failure(process, ERROR_CODE, ERROR_MSG, deps);
        await deps.deleteProcess(process);
        console.error(`[dlq] ${msg_id}: reported to the user and process removed`);
    } catch (err) {
        console.error(`[dlq] ${msg_id}: transient failure (${err.message}), retrying`);
        await sleep(deps.retryDelayMs);
        throw err;   // not acked: requeued by utils/rabbit_mq.js
    }
}

function start_dead_letter_consumer() {
    read_rabbit_msg(DLQ, (msg) => handle_dead_letter(msg), { queueType: 'classic' });
}

module.exports = { start_dead_letter_consumer, handle_dead_letter, processMsgId, notify_failure };
