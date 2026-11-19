// Watchdog of the projects orchestrator (DA-R4).
//
// Every WATCHDOG_INTERVAL_S it looks at the pending Process documents. A process is
// created when a step is dispatched and is not updated while the worker runs, so this
// measures the time since dispatch, not the real absence of progress. Deadlines:
//   - image step: WATCHDOG_IMAGE_S (30 s)
//   - video job:  max(WATCHDOG_VIDEO_MIN_S (120 s), WATCHDOG_VIDEO_FACTOR (1) x duration in s)
//     The adaptive deadline reduces, but does not rule out, false alarms on long videos.
//   - in a project with videos and frame extraction, image processes wait on purpose for the
//     videos (they are barriers of the run), so they get the video deadline too.
// An expired process is reported to its user (process-error / preview-error), the run's
// reserved advanced operations are refunded once, and the process is removed. Frozen or dead
// workers are already handled by RabbitMQ heartbeats and redelivery (DA-R1); the watchdog is
// the safety net for a step that never gets an answer.
//
// Order of the actions, so that no failure is silent and nothing is refunded twice:
//   1. notify (waits for the broker's confirmation); on failure keep the process -> retried
//   2. refund: claim pendingAdvancedOps with the project's optimistic version (N -> 0); only
//      the cycle that wins the claim calls the users service; if that call fails, the claim
//      is rolled back (0 -> N) and the process kept -> retried on the next cycle
//   3. delete the process (a late result is then ignored by process_msg)
// The watchdog and process_msg never act on the same process at once: before acting, the
// watchdog takes the in-memory lock process_msg uses (same key: the process msg_id, i.e. the
// reply's correlationId) and re-reads the process; a process being handled is skipped and
// looked at again on the next cycle, so a reply arriving near the deadline cannot produce
// both a success and an error (with a refund).
// Known limit: the cancel route refunds before saving, so a user cancel at the very same time
// as the watchdog could still refund twice (routes/projects.js is out of scope).
const https = require('https');
const { notify_failure } = require('./dead_letter');
const { acquireMsgLock, releaseMsgLock } = require('./idempotency');

const num = (name, def) => {
    const v = Number(process.env[name]);
    return Number.isFinite(v) && v > 0 ? v : def;
};

const CONFIG = {
    imageS: num('WATCHDOG_IMAGE_S', 30),
    videoMinS: num('WATCHDOG_VIDEO_MIN_S', 120),
    videoFactor: num('WATCHDOG_VIDEO_FACTOR', 1),
    intervalMs: num('WATCHDOG_INTERVAL_S', 10) * 1000,
};
const ERROR_CODE = '30002';
const ERROR_MSG = 'The job took too long and was stopped';
const CLAIM_ATTEMPTS = 3;

function defaultDeps() {
    const axios = require('axios');
    const ProcessModel = require('../models/process');
    const Process = require('../controllers/process');
    const Project = require('../controllers/project');
    const { send_rabbit_msg } = require('./rabbit_mq');
    // same call as the cancel route; the users service does not request a client certificate
    const httpsAgent = new https.Agent({ rejectUnauthorized: false });
    return {
        listProcesses: () => ProcessModel.find({}).lean().exec(),
        getProcess: (msg_id) => ProcessModel.findOne({ msg_id }).lean().exec(),
        acquireLock: acquireMsgLock,
        releaseLock: releaseMsgLock,
        getProject: (user_id, project_id) => Project.getOne(user_id, project_id),
        setPendingOps: (project, value) =>
            Project.updateIfVersion(project.user_id, project._id, { pendingAdvancedOps: value }, project.version),
        refund: (user, n) => axios.post(`https://users:10001/${user}/process/refund/${n}`, {}, { httpsAgent }),
        deleteProcess: async (p) => (await Process.delete(p.user_id, p.project_id, p._id)).deletedCount === 1,
        publish: send_rabbit_msg,
        publishTimeoutMs: 5000,
        now: () => Date.now(),
    };
}

function videoDeadline(media, cfg) {
    const duration = (media.video && media.video.duration) || 0;
    return Math.max(cfg.videoMinS, cfg.videoFactor * duration);
}

function deadlineS(process, project, cfg) {
    const imgs = (project && project.imgs) || [];
    const media = imgs.find((m) => String(m._id) === String(process.img_id));
    if (media && media.media_type === 'video') return videoDeadline(media, cfg);
    const videos = imgs.filter((m) => m.media_type === 'video');
    const extraction = ((project && project.tools) || []).some((t) => t.procedure === 'extract_frames');
    if (extraction && videos.length) return Math.max(...videos.map((m) => videoDeadline(m, cfg)));
    return cfg.imageS;
}

async function refundOnce(process, project, deps) {
    let current = project;
    for (let attempt = 0; attempt < CLAIM_ATTEMPTS; attempt++) {
        const n = (current && current.pendingAdvancedOps) || 0;
        if (n <= 0) return 0;                                    // nothing reserved, or already refunded
        const claimed = await deps.setPendingOps(current, 0);
        if (!claimed) {                                          // version changed: re-read and retry
            current = await deps.getProject(process.user_id, process.project_id);
            continue;
        }
        try {
            await deps.refund(process.runner_id || process.user_id, n);
            return n;
        } catch (err) {
            const restored = await deps.setPendingOps(claimed, n);
            if (!restored) console.error(`[watchdog] could not restore ${n} reserved ops of project ${process.project_id}`);
            throw err;
        }
    }
    throw new Error('could not claim the reserved operations');
}

function expired(process, project, deps, cfg) {
    const since = new Date(process.updatedAt || process.createdAt).getTime();
    return deps.now() - since >= deadlineS(process, project, cfg) * 1000;
}

async function checkProcess(listed, deps, cfg) {
    const project = await deps.getProject(listed.user_id, listed.project_id);
    if (!expired(listed, project, deps, cfg)) return 'ok';
    // the lock is taken only for expired processes, so replies of healthy steps are never
    // skipped because of the watchdog
    if (!deps.acquireLock(listed.msg_id)) return 'busy';          // being handled: next cycle
    try {
        const process = await deps.getProcess(listed.msg_id);    // fresh, under the lock
        if (!process) return 'gone';                             // handled meanwhile
        if (!expired(process, project, deps, cfg)) return 'ok';
        return await failProcess(process, project, deps);
    } finally {
        deps.releaseLock(listed.msg_id);
    }
}

async function failProcess(process, project, deps) {
    await notify_failure(process, ERROR_CODE, ERROR_MSG, deps);   // 1
    const refunded = await refundOnce(process, project, deps);    // 2
    const removed = await deps.deleteProcess(process);            // 3
    console.error(`[watchdog] ${process.msg_id}: expired, user notified, ${refunded} ops refunded, ` +
        `process ${removed ? 'removed' : 'already gone'}`);
    return 'expired';
}

async function runCycle(deps = defaultDeps(), cfg = CONFIG) {
    const results = [];
    for (const process of await deps.listProcesses()) {
        try {
            results.push(await checkProcess(process, deps, cfg));
        } catch (err) {
            console.error(`[watchdog] ${process.msg_id}: ${err.message}; retried on the next cycle`);
            results.push('retry');
        }
    }
    return results;
}

function start_watchdog(cfg = CONFIG) {
    let running = false;   // cycles never overlap
    const deps = defaultDeps();
    setInterval(async () => {
        if (running) return;
        running = true;
        try {
            await runCycle(deps, cfg);
        } catch (err) {
            console.error(`[watchdog] cycle failed: ${err.message}`);
        } finally {
            running = false;
        }
    }, cfg.intervalMs);
}

module.exports = { start_watchdog, runCycle, deadlineS, CONFIG };
