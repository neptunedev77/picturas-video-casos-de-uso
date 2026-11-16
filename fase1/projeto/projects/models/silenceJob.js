// UC-VID-001: estado da remoção de silêncios de um vídeo (análise, revisão e aplicação).
// Há um documento por vídeo do projeto; é ele que guarda a revisão para retomar mais tarde (FA5).
const mongoose = require("mongoose");

const REVIEW_TTL_SEC = 7 * 24 * 60 * 60; // A12 / REQ-VID-SIL-013

const segmentSchema = new mongoose.Schema(
  {
    start: { type: Number, required: true },
    end: { type: Number, required: true },
    selected: { type: Boolean, default: true },
  },
  { _id: false }
);

const silenceJobSchema = new mongoose.Schema({
  owner_id: { type: mongoose.Schema.Types.ObjectId, required: true },
  project_id: { type: mongoose.Schema.Types.ObjectId, required: true },
  img_id: { type: mongoose.Schema.Types.ObjectId, required: true },
  // quem pediu a análise/aplicação (num projeto partilhado pode não ser o dono; Q2)
  runner_id: { type: mongoose.Schema.Types.ObjectId, required: true },
  runner_type: { type: String, default: "free" },

  // none | queued | analyzing | analyzed | processing | completed | failed
  status: { type: String, default: "none" },
  // fase do pedido em curso ou do último pedido: analyze | apply
  phase: { type: String, default: "analyze" },
  progress: { type: Number, default: 0 },
  // id do pedido atual no serviço silence_removal; respostas de outros ids são ignoradas
  current_job_id: { type: String, default: null },

  source_name: { type: String, required: true },
  local_input: { type: String, default: null },
  local_output: { type: String, default: null },

  options: { type: mongoose.Schema.Types.Mixed, default: null },
  // resultado da análise: vídeo, troços propostos, linha temporal, poupança...
  analysis: { type: mongoose.Schema.Types.Mixed, default: null },
  // revisão do utilizador (troços marcados/desmarcados e ajustados)
  review: { type: [segmentSchema], default: [] },
  review_edited: { type: Boolean, default: false },

  op_charged: { type: Boolean, default: false },
  result: { type: mongoose.Schema.Types.Mixed, default: null },
  error: { type: mongoose.Schema.Types.Mixed, default: null },

  // quando o serviço começou a tratar o pedido atual (para o tempo máximo, REQ-VID-SIL-031)
  started_at: { type: Date, default: null },
  queued_at: { type: Date, default: null },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
  // revisões sem utilização durante 7 dias são eliminadas automaticamente pelo MongoDB
  last_used_at: { type: Date, default: Date.now, index: { expireAfterSeconds: REVIEW_TTL_SEC } },
});

silenceJobSchema.index({ project_id: 1, img_id: 1 }, { unique: true });
silenceJobSchema.index({ current_job_id: 1 });

module.exports = mongoose.model("silenceJob", silenceJobSchema);
