const mongoose = require("mongoose");

const segment = new mongoose.Schema({
  text: { type: String, required: true },
  start: { type: Number, required: true },
  end: { type: Number, required: true },
}, { _id: false });

// One immutable worker job ID per attempt. No TTL: drafts remain available for
// explicit confirmation/rejection; stored results follow their source's lifetime.
const schema = new mongoose.Schema({
  job_id: { type: String, required: true, unique: true },
  owner_id: { type: mongoose.Schema.Types.ObjectId, required: true },
  project_id: { type: mongoose.Schema.Types.ObjectId, required: true },
  img_id: { type: mongoose.Schema.Types.ObjectId, required: true },
  runner_id: { type: mongoose.Schema.Types.ObjectId, required: true },
  runner_type: { type: String, enum: ["free", "premium"], required: true },
  source_name: { type: String, required: true },
  source_key: { type: String, required: true },
  source_sha256: String,
  // Duration from the project's metadata: the projects watchdog's time limit before transcription.
  source_duration: Number,
  language: { type: String, required: true },
  model: { type: String, enum: ["base", "small"], default: "base" },
  // queued covers authorization, download and durable dispatch before worker ACK.
  status: { type: String, enum: ["queued", "processing", "transcribed", "completed", "failed", "cancelled"], default: "queued" },
  active: { type: Boolean, default: true },
  phase: { type: String, default: "authorizing" },
  current_operation: { type: String, enum: ["transcribe", "generate_srt"], default: "transcribe" },
  current_request_id: { type: String, required: true },
  operation_requested_at: { type: Date, default: Date.now },
  dispatched_at: Date,
  started_at: Date,
  finished_at: Date,
  segments: { type: [segment], default: [] },
  duration: Number,
  input_path: { type: String, required: true },
  output_path: { type: String, required: true },
  // Durable outbox + finite lease recover preparation/publication after restart.
  dispatch_state: { type: String, enum: ["pending", "sent", "stopped"], default: "pending" },
  dispatch_claim: String,
  dispatch_until: Date,
  cancel_requested_at: Date,
  cancel_reason: { type: String, enum: ["user", "rejected", "failure", "source_removed"] },
  cancel_dispatch_state: { type: String, enum: ["none", "pending", "sent"], default: "none" },
  cancel_local: { type: Boolean, default: false },
  worker_terminal_at: Date,
  quota: {
    user_id: { type: mongoose.Schema.Types.ObjectId, required: true },
    state: { type: String, enum: ["pending", "reserving", "charged", "exempt", "not_charged", "uncertain"], default: "pending" },
    charged: { type: Boolean, default: false },
    in_flight: { type: Boolean, default: false },
    day: String,
    reserve_claimed_at: Date,
    refund_state: { type: String, enum: ["none", "claimed", "refunded", "uncertain"], default: "none" },
    refund_claimed_at: Date,
    refunded_at: Date,
    reconciliation_required: { type: Boolean, default: false },
    reconciliation_reason: String,
  },
  storage_state: { type: String, enum: ["none", "uploading", "uploaded", "stored", "uncertain"], default: "none" },
  storage_claim: String,
  storage_until: Date,
  storage_key: String,
  storage_cleanup_pending: { type: Boolean, default: false },
  result: {
    key: String,
    name: String,
    contentType: String,
    sizeBytes: Number,
    sha256: String,
  },
  error: { code: String, message: String, retryable: Boolean },
  orphaned: { type: Boolean, default: false },
  orphan_checked_at: { type: Date, default: () => new Date(0) },
  cleanup_pending: { type: Boolean, default: false },
}, { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } });

schema.index({ project_id: 1, img_id: 1 }, { unique: true, partialFilterExpression: { active: true } });
schema.index({ owner_id: 1, project_id: 1, created_at: -1 });
schema.index({ status: 1, dispatch_state: 1 });
schema.index({ orphaned: 1, orphan_checked_at: 1 });
// Serialize this UC's debit/refund calls per payer. The existing User Service
// uses read/modify/write, so overlapping calls from our own jobs are unsafe.
schema.index({ "quota.user_id": 1, "quota.in_flight": 1 }, {
  unique: true, partialFilterExpression: { "quota.in_flight": true },
});
module.exports = mongoose.model("subtitleJob", schema);
