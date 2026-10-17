const mongoose = require("mongoose");

// UC-VID-002 only. No pipeline state, cancellation or expiration.
const compressionJobSchema = new mongoose.Schema({
  owner_id: { type: mongoose.Schema.Types.ObjectId, required: true },
  project_id: { type: mongoose.Schema.Types.ObjectId, required: true },
  img_id: { type: mongoose.Schema.Types.ObjectId, required: true },
  quality: { type: String, enum: ["high", "balanced", "small"], required: true },
  profile_version: { type: Number, default: 1 },
  user_type: { type: String, enum: ["free", "premium"], required: true },
  worker_token_hash: { type: String, select: false },
  start_claimed: { type: Boolean, default: false },
  quota_charged: { type: Boolean, default: false },
  quota_refund_claimed: { type: Boolean, default: false },
  status: {
    type: String, enum: ["queued", "processing", "completed", "failed"], default: "queued",
  },
  progress: { type: Number, default: 0, min: 0, max: 100 },
  source_name: { type: String, required: true },
  input_path: { type: String, required: true, select: false },
  output_path: { type: String, required: true, select: false },
  result: {
    sizeBytes: Number, originalSizeBytes: Number, durationSec: Number,
    width: Number, height: Number, reductionPercent: Number,
  },
  error: { code: String, message: String },
  started_at: Date,
  finished_at: Date,
}, { timestamps: true });

compressionJobSchema.index({ owner_id: 1, project_id: 1, createdAt: -1 });
module.exports = mongoose.model("compressionJob", compressionJobSchema);
