// Refund of a run's reserved advanced operations, at most once (DA-R4), shared by the
// watchdog and the dead-letter consumer (DA-R3): a job that fails in either way gives the
// user back the operations reserved for its run.
//
// The reserved count is claimed with the project's optimistic version (N -> 0); only the
// caller that wins the claim calls the users service. If that call fails, the claim is
// rolled back (0 -> N) and the error is thrown, so the caller retries later.
const https = require('https');

const CLAIM_ATTEMPTS = 3;

function refundDeps() {
    const axios = require('axios');
    const Project = require('../controllers/project');
    // same call as the cancel route; the users service does not request a client certificate
    const httpsAgent = new https.Agent({ rejectUnauthorized: false });
    return {
        getProject: (user_id, project_id) => Project.getOne(user_id, project_id),
        setPendingOps: (project, value) =>
            Project.updateIfVersion(project.user_id, project._id, { pendingAdvancedOps: value }, project.version),
        refund: (user, n) => axios.post(`https://users:10001/${user}/process/refund/${n}`, {}, { httpsAgent }),
    };
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
            if (!restored) console.error(`[refund] could not restore ${n} reserved ops of project ${process.project_id}`);
            throw err;
        }
    }
    throw new Error('could not claim the reserved operations');
}

module.exports = { refundOnce, refundDeps };
