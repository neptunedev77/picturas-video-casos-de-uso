// Idempotent handling of tool replies in process_msg (DA-R5, part 2).
//
// projects runs as a single instance, so replies being handled are tracked in memory:
// a second copy of the same reply (a redelivery) that arrives while the first is still
// being handled is skipped. Nothing is lost: if the first attempt crashes the process,
// both copies are unacked and RabbitMQ redelivers them; if it ends normally, the job is
// done (or reported as failed) and the copy is useless.
const inFlight = new Set();

function acquireMsgLock(msg_id) {
    if (!msg_id || inFlight.has(msg_id)) return false;
    inFlight.add(msg_id);
    return true;
}

function releaseMsgLock(msg_id) {
    inFlight.delete(msg_id);
}

// Deterministic id of the next step, so a redelivered reply finds the successor it
// created before instead of creating a second one. Keeps the "preview" prefix that
// process_msg relies on: preview-<uuid> -> preview-<uuid>-s1 -> preview-<uuid>-s2.
function successorMsgId(msg_id, next_pos) {
    const base = String(msg_id).replace(/-s\d+$/, '');
    return `${base}-s${next_pos}`;
}

// Creates the successor process only if it does not exist yet. Returns true when it was
// created now (the request must then be sent), false when it already existed: it is then
// in processing (its request was already sent) and must not be sent again; if that request
// had been lost, the watchdog reports the step.
async function createSuccessorOnce(exists, create, new_process) {
    if (await exists({ msg_id: new_process.msg_id })) return false;
    await create(new_process);
    return true;
}

// True when this step's result is already stored (a redelivered reply after a crash).
// The output file name identifies the step: image steps write the image in place and the
// text tools add the tool name and a counter.
async function resultExists(exists, process, file_name) {
    return Boolean(await exists({
        project_id: process.project_id,
        img_id: process.img_id,
        token: process.token || 0,
        file_name,
    }));
}

module.exports = { acquireMsgLock, releaseMsgLock, successorMsgId, createSuccessorOnce, resultExists };
