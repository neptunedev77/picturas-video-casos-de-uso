// UC-VID-001: remoção de silêncios e pausas de um vídeo (cliente da API e estado em tempo real)
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./axios";
import { useGetSocket } from "./queries/projects";

export type SilenceProfile = "suave" | "equilibrado" | "agressivo";

export interface SilenceOptions {
  profile: SilenceProfile;
  thresholdDb: number;
  minPauseSec: number;
  marginMs: number;
  backgroundMusic: boolean;
}

export interface SilenceSegment {
  start: number;
  end: number;
  selected: boolean;
}

export interface SilenceSavings {
  originalSec: number;
  finalSec: number;
  removedSec: number;
  removedPct: number;
}

export interface SilenceAnalysis {
  options: SilenceOptions;
  video: { durationSec: number; width: number; height: number; fps: number; sizeBytes: number };
  segments: { start: number; end: number; duration: number }[];
  savings: SilenceSavings;
  silenceRatio: number;
  waveform: number[];
  waveformWindowSec: number;
  noSegmentsReason: "none_found" | "too_silent" | null;
  suggestedProfile: SilenceProfile | null;
  message?: string;
}

export type SilenceStatus =
  | "none"
  | "queued"
  | "analyzing"
  | "analyzed"
  | "processing"
  | "completed"
  | "failed";

export interface SilenceRange {
  min: number;
  max: number;
  unit: string;
  label: string;
}

export interface SilenceState {
  status: SilenceStatus;
  phase?: "analyze" | "apply";
  progress?: number;
  jobId?: string | null;
  options?: SilenceOptions | null;
  analysis?: SilenceAnalysis | null;
  review?: SilenceSegment[];
  reviewEdited?: boolean;
  savings?: SilenceSavings | null;
  result?: {
    imgId: string;
    name: string;
    originalSec: number;
    finalSec: number;
    removedSec: number;
    removedPct: number;
    avDiffMs: number;
    segmentsRemoved: number;
  } | null;
  error?: { code?: number | string; kind?: string; message: string } | null;
  updatedAt?: string;
  profiles: Record<SilenceProfile, { thresholdDb: number; minPauseSec: number; marginMs: number }>;
  ranges: Record<"thresholdDb" | "minPauseSec" | "marginMs", SilenceRange>;
  analyses?: { type: string; used: number; limit: number | null; remaining: number | null } | null;
}

export const SILENCE_BUSY: SilenceStatus[] = ["queued", "analyzing", "processing"];

// Erro devolvido pela API, com o código para o ecrã decidir o que mostrar
export class SilenceApiError extends Error {
  code: string;
  status: number;
  data: any;
  constructor(status: number, data: any) {
    super(
      (typeof data === "object" && data?.message) ||
        (typeof data === "string" ? data : "Ocorreu um erro. Tente novamente."),
    );
    this.status = status;
    this.code = (typeof data === "object" && data?.code) || "ERROR";
    this.data = data;
  }
}

export interface SilenceTarget {
  uid: string; // utilizador da sessão
  pid: string;
  imgId: string;
  token: string;
  ownerId?: string;
  shareId?: string;
}

function basePath(t: SilenceTarget) {
  const owner = t.shareId ? t.ownerId ?? t.uid : t.uid;
  return `/projects/${owner}/${t.pid}/silence/${t.imgId}`;
}

function config(t: SilenceTarget) {
  const params: Record<string, string> = {};
  if (t.shareId) {
    if (t.ownerId) params.owner = t.ownerId;
    params.share = t.shareId;
  }
  return { headers: { Authorization: `Bearer ${t.token}` }, params };
}

async function call<T>(fn: () => Promise<{ data: T }>): Promise<T> {
  try {
    return (await fn()).data;
  } catch (e: any) {
    throw new SilenceApiError(e?.response?.status ?? 0, e?.response?.data);
  }
}

export const fetchSilenceState = (t: SilenceTarget) =>
  call<SilenceState>(() => api.get(basePath(t), config(t)));

export const analyzeSilence = (
  t: SilenceTarget,
  options: Partial<SilenceOptions>,
  confirmDiscard = false,
) => call<SilenceState>(() => api.post(`${basePath(t)}/analyze`, { options, confirmDiscard }, config(t)));

export const saveSilenceReview = (t: SilenceTarget, segments: SilenceSegment[]) =>
  call<SilenceState>(() => api.put(`${basePath(t)}/review`, { segments }, config(t)));

export const applySilenceCuts = (
  t: SilenceTarget,
  segments: SilenceSegment[],
  confirmLargeRemoval = false,
) => call<SilenceState>(() => api.post(`${basePath(t)}/apply`, { segments, confirmLargeRemoval }, config(t)));

export const cancelSilence = (t: SilenceTarget) =>
  call<SilenceState>(() => api.post(`${basePath(t)}/cancel`, {}, config(t)));

export const fetchVideoUrl = (t: SilenceTarget, imgId: string) => {
  const owner = t.shareId ? t.ownerId ?? t.uid : t.uid;
  return call<{ _id: string; name: string; url: string }>(() =>
    api.get(`/projects/${owner}/${t.pid}/img/${imgId}`, config(t)),
  );
};

export const silenceKey = (t: SilenceTarget) => ["silence", t.pid, t.imgId, t.token, t.ownerId, t.shareId];

/**
 * Estado da remoção de silêncios de um vídeo, atualizado em tempo real pelo WebSocket
 * (evento "silence-update") e reposto quando a ligação volta (REQ-VID-SIL-019).
 */
export function useSilenceState(t: SilenceTarget, enabled: boolean) {
  const qc = useQueryClient();
  const socket = useGetSocket(t.token);
  const key = silenceKey(t);

  const query = useQuery({
    queryKey: key,
    queryFn: () => fetchSilenceState(t),
    enabled: enabled && Boolean(t.imgId),
    // enquanto há um pedido em curso, confirmar o estado de vez em quando (se o WebSocket falhar)
    refetchInterval: (q) => (q.state.data && SILENCE_BUSY.includes(q.state.data.status) ? 4000 : false),
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    const s = socket.data;
    if (!s || !enabled) return;

    const onUpdate = (msg: any) => {
      if (!msg || String(msg.imgId) !== String(t.imgId)) return;
      const terminal = !SILENCE_BUSY.includes(msg.status);
      if (terminal) {
        qc.invalidateQueries({ queryKey: key });
        return;
      }
      qc.setQueryData<SilenceState>(key, (prev) =>
        prev ? { ...prev, status: msg.status, phase: msg.phase, progress: msg.progress, jobId: msg.jobId } : prev,
      );
    };
    const onReconnect = () => qc.invalidateQueries({ queryKey: key });

    s.on("silence-update", onUpdate);
    s.on("connect", onReconnect);
    return () => {
      s.off("silence-update", onUpdate);
      s.off("connect", onReconnect);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket.data, enabled, t.imgId, t.pid, t.token]);

  return query;
}

// --- cálculos locais da revisão (feita no browser, DQ-008) ---------------------------

export function computeSavings(durationSec: number, review: SilenceSegment[]): SilenceSavings {
  const removed = review.filter((s) => s.selected).reduce((acc, s) => acc + (s.end - s.start), 0);
  return {
    originalSec: durationSec,
    finalSec: Math.max(0, durationSec - removed),
    removedSec: removed,
    removedPct: durationSec > 0 ? (removed / durationSec) * 100 : 0,
  };
}

/** Valida a alteração de um troço: dentro do vídeo, sem sobreposição e com duração mínima. */
export function canChangeSegment(
  review: SilenceSegment[],
  index: number,
  start: number,
  end: number,
  durationSec: number,
): string | null {
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "Valor inválido.";
  if (start < 0) return "O início não pode ser antes do início do vídeo.";
  if (end > durationSec) return "O fim não pode ultrapassar a duração do vídeo.";
  if (end - start < 0.05) return "O troço tem de ter pelo menos 0,05 s.";
  const prev = review[index - 1];
  const next = review[index + 1];
  if (prev && start < prev.end) return "O troço não se pode sobrepor ao anterior.";
  if (next && end > next.start) return "O troço não se pode sobrepor ao seguinte.";
  return null;
}

export function formatTime(sec: number, decimals = 2) {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${String(m).padStart(2, "0")}:${s.toFixed(decimals).padStart(decimals ? 3 + decimals : 2, "0")}`;
}
