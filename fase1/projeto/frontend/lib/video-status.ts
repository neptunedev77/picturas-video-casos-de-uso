// The five states shared by every video tool (RNG-06, REQ-VID-STATUS-001). Each tool maps
// its own internal states to these names, so the user sees the same words everywhere.
export type VideoJobStatus = "queued" | "processing" | "completed" | "failed" | "cancelled";

export const VIDEO_STATUS_LABELS: Record<VideoJobStatus, string> = {
  queued: "Em fila",
  processing: "A processar",
  completed: "Concluída",
  failed: "Falhada",
  cancelled: "Cancelada",
};

/** Review step of the tools that ask for confirmation before the result (silences, subtitles). */
export const VIDEO_REVIEW_LABEL = "Pronta para revisão";
