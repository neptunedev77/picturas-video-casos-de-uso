const http = require("http");
const socketIo = require('socket.io');
const jwt = require("jsonwebtoken");

const { read_rabbit_msg } = require("./utils/rabbit_mq.js");
const httpServer = http.createServer();
httpServer.listen(4000);

const io = socketIo(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
    },
    // options
});

io.on("connection", (socket) => {
    console.log("a user connected");

    const token = socket.handshake.auth.token;
    if (token != null) {
        jwt.verify(token, process.env.JWT_SECRET_KEY, (e, payload) => {
            if (e) {
                socket.emit('authError', e);
                return;
            }

            console.log("Connecting to room:", payload.id)
            socket.join(payload.id);
        });
    }

    socket.on("join-project", (projectId) => {
        if (typeof projectId === "string" && projectId.length > 0) {
            socket.join(`project:${projectId}`);
        }
        });


    socket.on("leave-project", (projectId) => {
        if (typeof projectId === "string" && projectId.length > 0) {
            socket.leave(`project:${projectId}`);
        }
        });
        
    socket.on("disconnect", () => {
        console.log("A user disconnected");
    });

});

// id do user como room id

// Subtitle updates use the existing JWT user room, never a project room (which
// clients can join independently). Only a small, validated envelope is forwarded.
function forwardSubtitleUpdate(message) {
    const objectId = value => typeof value === "string" && /^[a-f0-9]{24}$/i.test(value);
    const statuses = ["queued", "processing", "transcribed", "completed", "failed", "cancelled"];
    if (!objectId(message.user) || !objectId(message.projectId) || !objectId(message.imgId) ||
        typeof message.jobId !== "string" || !/^[0-9a-f-]{36}$/.test(message.jobId) ||
        typeof message.messageId !== "string" || !message.messageId.length || message.messageId.length > 200 ||
        !statuses.includes(message.status) || !["transcribe", "generate_srt"].includes(message.operation) ||
        typeof message.phase !== "string" || !message.phase.length || message.phase.length > 80 ||
        typeof message.timestamp !== "string" || !Number.isFinite(Date.parse(message.timestamp))) return;
    let error = null;
    if (message.error != null) {
        if (typeof message.error !== "object" || Array.isArray(message.error) ||
            typeof message.error.code !== "string" || !message.error.code.length || message.error.code.length > 80 ||
            typeof message.error.message !== "string" || message.error.message.length > 1024) return;
        error = { code: message.error.code, message: message.error.message };
        if (typeof message.error.retryable === "boolean") error.retryable = message.error.retryable;
    }
    io.to(message.user).emit("subtitle-update", {
        jobId: message.jobId, projectId: message.projectId, imgId: message.imgId,
        status: message.status, operation: message.operation, phase: message.phase,
        error, timestamp: message.timestamp,
    });
}

function process_msg() {
    read_rabbit_msg('ws_queue', (msg) => {
        let msg_content;
        try { msg_content = JSON.parse(msg.content.toString()); }
        catch (_) { console.warn("[WS] invalid JSON envelope ignored"); return; }
        if (!msg_content || typeof msg_content !== "object" || Array.isArray(msg_content)) return;
        // Exact type dispatch precedes the legacy messageId regular expressions.
        if (msg_content.type === "subtitle-update") {
            forwardSubtitleUpdate(msg_content);
            return;
        }
        const msg_id = msg_content.messageId;
        const timestamp = msg_content.timestamp
        const status = msg_content.status;
        const user = msg_content.user;

        console.log('Received msg:', JSON.stringify(msg_content));

        if (/update-client-preview/.test(msg_id)) {
            if (status == "error") {
                const error_code = msg_content.errorCode;
                const error_msg = msg_content.errorMsg;

                io.to(user).emit("preview-error", { error_code, error_msg }); 

                return;
            }

            const img_url = msg_content.img_url;

            io.to(user).emit("preview-ready", img_url);
        }

        else if (/update-client-process/.test(msg_id)) {

            if (status == "error") {
                const error_code = msg_content.errorCode;
                const error_msg = msg_content.errorMsg;

                io.to(user).emit("process-error", { error_code, error_msg }); 

                return;
            }

            io.to(user).emit("process-update", msg_id);
        }

        else if (msg_content.type === "project-op") {
            const projectId = msg_content.projectId;
            const op = msg_content.op;

            if (projectId && op) {
                io.to(`project:${projectId}`).emit("project-op", { projectId, op });
            }
        }

        else if (msg_content.type === "video-progress") {
            const user = msg_content.user;
            const progress = msg_content.progress;
            const status = msg_content.status;

            if (user) {
                io.to(user).emit("video-progress", { progress, status, messageId: msg_id });
            }
        }

        // UC-VID-001: estado e progresso da remoção de silêncios
        else if (msg_content.type === "silence-update") {
            if (user) {
                io.to(user).emit("silence-update", {
                    jobId: msg_content.jobId,
                    projectId: msg_content.projectId,
                    imgId: msg_content.imgId,
                    status: msg_content.status,
                    phase: msg_content.phase,
                    progress: msg_content.progress,
                    error: msg_content.error,
                });
            }
        }

        // UC-VID-002: estado e progresso da compressão (REQ-VID-STATUS-001)
        else if (msg_content.type === "compression-update") {
            if (user) {
                io.to(user).emit("compression-update", {
                    jobId: msg_content.jobId,
                    projectId: msg_content.projectId,
                    imgId: msg_content.imgId,
                    status: msg_content.status,
                    progress: msg_content.progress,
                    cancelRequested: msg_content.cancelRequested,
                    error: msg_content.error,
                });
            }
        }

        //  project updated
        else if (/project-updated/.test(msg_id) || msg_content.type === "project-updated") {
            const projectId = msg_content.projectId;
            const version = msg_content.version;

            if (projectId) {
                io.to(`project:${projectId}`).emit("project-updated", { projectId, version });
            }
        }
    })
}

process_msg();
