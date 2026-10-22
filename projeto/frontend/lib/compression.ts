// UC-VID-002: REST client; state updated in real time by the "compression-update" WebSocket
// event, with a slower polling fallback while a job is active (REQ-VID-STATUS-001).
import { useEffect } from "react";
import axios from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./axios";
import { useGetSocket } from "./queries/projects";
import { VIDEO_STATUS_LABELS } from "./video-status";

export type CompressionQuality = "high" | "balanced" | "small";
export type CompressionStatus = "queued" | "processing" | "completed" | "failed" | "cancelled";

export const COMPRESSION_QUALITIES: Record<CompressionQuality, string> = {
  high: "Alta",
  balanced: "Equilibrada",
  small: "Tamanho reduzido",
};

// The five states shared by every video tool (RNG-06).
export const COMPRESSION_STATUS: Record<CompressionStatus, string> = VIDEO_STATUS_LABELS;

// Errors in Portuguese, with the cause and a possible action (REQ-VID-STATUS-002).
export const COMPRESSION_ERRORS: Record<string, string> = {
  NO_QUOTA: "Atingiu o limite diário de operações. Pode comprimir de novo amanhã ou passar para o plano Premium.",
  SIZE_LIMIT: "O vídeo excede o tamanho máximo do seu plano (500 MB no Gratuito, 2 GB no Premium).",
  DURATION_LIMIT: "O vídeo excede a duração máxima do seu plano (10 minutos no Gratuito, 60 minutos no Premium).",
  UNSUPPORTED_VIDEO: "Só são suportados vídeos MP4 com vídeo H.264. Converta o vídeo e tente novamente.",
  INVALID_VIDEO: "Não foi possível ler o vídeo. Verifique se o ficheiro não está corrompido.",
  NO_CAPACITY: "O serviço não tem espaço suficiente neste momento. Tente novamente mais tarde.",
  PROCESSING_TIMEOUT: "A compressão excedeu o tempo máximo e foi interrompida. A operação não foi descontada.",
  PROCESSING_FAILED: "Não foi possível comprimir o vídeo. A operação não foi descontada; pode tentar novamente.",
  INVALID_RESULT: "O vídeo comprimido não ficou válido. A operação não foi descontada; pode tentar novamente.",
  STORE_FAILED: "Não foi possível guardar o vídeo comprimido no projeto. A operação não foi descontada.",
  PREPARATION_FAILED: "Não foi possível preparar o vídeo para compressão. Tente novamente.",
  WORKER_INTERRUPTED: "O serviço de compressão foi interrompido. Inicie um novo pedido.",
  REGISTERED_ONLY: "A compressão está disponível apenas para utilizadores registados.",
  EDIT_REQUIRED: "O link de partilha não tem permissão de edição.",
  SHARE_INVALID: "O link de partilha é inválido ou foi revogado.",
  NO_PERMISSION: "Não tem permissão sobre este projeto.",
  CANNOT_CANCEL: "Este pedido já terminou e não pode ser cancelado.",
};

export function compressionErrorMessage(error?: { code?: string; message?: string } | null) {
  if (!error) return "Não foi possível comprimir o vídeo. Pode iniciar um novo pedido.";
  return (error.code && COMPRESSION_ERRORS[error.code]) || error.message || "Não foi possível comprimir o vídeo.";
}

export interface CompressionTarget {
  uid: string; // utilizador da sessão
  pid: string;
  imgId: string;
  token: string;
  ownerId?: string; // dono do projeto, num projeto partilhado
  shareId?: string;
}

export interface CompressionJob {
  _id: string;
  imgId: string;
  quality: CompressionQuality;
  profileVersion: number;
  status: CompressionStatus;
  cancelRequested?: boolean;
  progress: number;
  sourceName: string;
  result?: {
    sizeBytes: number;
    originalSizeBytes: number;
    durationSec: number;
    width: number;
    height: number;
    reductionPercent: number;
    imgId?: string;
    name?: string;
  } | null;
  error?: { code?: string; message?: string } | null;
  createdAt: string;
  updatedAt: string;
}

export function isCompressionActive(job?: CompressionJob) {
  return job?.status === "queued" || job?.status === "processing";
}

function basePath(t: CompressionTarget) {
  const owner = t.shareId ? t.ownerId ?? t.uid : t.uid;
  return `/projects/${encodeURIComponent(owner)}/${encodeURIComponent(t.pid)}/compression`;
}

function config(t: CompressionTarget) {
  const headers = { Authorization: `Bearer ${t.token}` };
  if (!t.shareId) return { headers };
  const params: Record<string, string> = { share: t.shareId };
  if (t.ownerId) params.owner = t.ownerId;
  return { headers, params };
}

async function apiError(error: unknown): Promise<Error> {
  if (axios.isAxiosError(error)) {
    let data: unknown = error.response?.data;
    // Axios also returns error bodies as Blobs for authenticated downloads.
    if (typeof Blob !== "undefined" && data instanceof Blob) {
      try { data = JSON.parse(await data.text()); } catch { data = null; }
    }
    if (data && typeof data === "object") {
      const body = data as { code?: unknown; message?: unknown };
      if (typeof body.code === "string" && COMPRESSION_ERRORS[body.code]) return new Error(COMPRESSION_ERRORS[body.code]);
      if (typeof body.message === "string") return new Error(body.message);
    }
    if (error.response?.status === 401) return new Error("A sessão expirou. Volte a iniciar sessão.");
    if (error.response?.status === 403) return new Error("Não tem permissão para comprimir vídeos neste projeto.");
    return new Error("Não foi possível comunicar com o serviço de compressão. Tente novamente.");
  }
  return error instanceof Error ? error : new Error("Não foi possível concluir o pedido.");
}

async function call<T>(request: () => Promise<{ data: T }>): Promise<T> {
  try { return (await request()).data; }
  catch (error) { throw await apiError(error); }
}

export async function fetchCompressionJobs(t: CompressionTarget): Promise<CompressionJob[]> {
  const jobs = await call(() => api.get<CompressionJob[]>(basePath(t), config(t)));
  // The backend lists this project's latest jobs; the panel belongs to one video.
  return jobs.filter((job) => job.imgId === t.imgId);
}

export function createCompressionJob(t: CompressionTarget, quality: CompressionQuality) {
  return call(() => api.post<CompressionJob>(basePath(t), { imgId: t.imgId, quality }, config(t)));
}

export function cancelCompressionJob(t: CompressionTarget, jobId: string) {
  return call(() => api.post<CompressionJob>(`${basePath(t)}/${encodeURIComponent(jobId)}/cancel`, {}, config(t)));
}

export async function downloadCompressionResult(t: CompressionTarget, job: CompressionJob) {
  if (job.status !== "completed") throw new Error("O resultado ainda não está disponível.");
  const blob = await call(() => api.get<Blob>(`${basePath(t)}/${encodeURIComponent(job._id)}/result`, {
    ...config(t), responseType: "blob",
  }));
  if (!blob.size) throw new Error("O resultado recebido está vazio. Tente novamente.");
  const name = job.sourceName.replace(/\.mp4$/i, "").replace(/[\\/]/g, "_");
  return { blob, filename: job.result?.name || `${name}-${job.quality}.mp4` };
}

export const compressionKey = (t: CompressionTarget) =>
  ["compression", t.uid, t.pid, t.imgId, t.token, t.ownerId, t.shareId];

export function useCompressionJobs(t: CompressionTarget, enabled: boolean) {
  const queryClient = useQueryClient();
  const socket = useGetSocket(t.token);
  const key = compressionKey(t);
  const query = useQuery({
    queryKey: key,
    queryFn: () => fetchCompressionJobs(t),
    enabled: enabled && Boolean(t.imgId),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    retry: 1,
    // Fallback only: the WebSocket event normally updates the state first.
    refetchInterval: (q) => q.state.data?.some(isCompressionActive) ? 5000 : false,
  });

  useEffect(() => {
    const s = socket?.data;
    if (!s || !enabled) return;
    const onUpdate = (msg: { jobId?: string; imgId?: string; status?: CompressionStatus; progress?: number;
      cancelRequested?: boolean; error?: CompressionJob["error"] }) => {
      if (!msg || String(msg.imgId) !== String(t.imgId)) return;
      const active = msg.status === "queued" || msg.status === "processing";
      if (!active) {
        // Terminal states carry the result: read it from the server.
        void queryClient.invalidateQueries({ queryKey: key });
        return;
      }
      queryClient.setQueryData<CompressionJob[]>(key, (previous) => {
        if (!previous?.some((job) => job._id === msg.jobId)) return previous;
        return previous.map((job) => job._id === msg.jobId ? {
          ...job, status: msg.status ?? job.status, progress: msg.progress ?? job.progress,
          cancelRequested: msg.cancelRequested ?? job.cancelRequested,
        } : job);
      });
    };
    // Restore the current state after the real-time connection comes back.
    const onReconnect = () => { void queryClient.invalidateQueries({ queryKey: key }); };
    s.on("compression-update", onUpdate);
    s.on("connect", onReconnect);
    return () => {
      s.off("compression-update", onUpdate);
      s.off("connect", onReconnect);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket?.data, enabled, t.imgId, t.pid, t.token, t.shareId]);

  return query;
}

export function useCreateCompression(t: CompressionTarget) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (quality: CompressionQuality) => createCompressionJob(t, quality),
    retry: false, // POST is not idempotent: never automatically submit twice.
    onSuccess: async (job) => {
      // Prevent an older in-flight GET from replacing the newly created job.
      await queryClient.cancelQueries({ queryKey: compressionKey(t) });
      queryClient.setQueryData<CompressionJob[]>(compressionKey(t), (previous) => [
        job, ...(previous || []).filter((old) => old._id !== job._id),
      ]);
      void queryClient.invalidateQueries({ queryKey: compressionKey(t) });
    },
  });
}

export function useCancelCompression(t: CompressionTarget) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => cancelCompressionJob(t, jobId),
    retry: false,
    onSuccess: async (job) => {
      await queryClient.cancelQueries({ queryKey: compressionKey(t) });
      queryClient.setQueryData<CompressionJob[]>(compressionKey(t), (previous) =>
        (previous || []).map((old) => old._id === job._id ? job : old));
    },
    // Also resync on 409: the worker may have claimed the job since the last update.
    onSettled: () => queryClient.invalidateQueries({ queryKey: compressionKey(t) }),
  });
}

export function formatCompressionBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1000) return `${bytes} B`;
  const unit = bytes < 1_000_000 ? "KB" : bytes < 1_000_000_000 ? "MB" : "GB";
  const divisor = unit === "KB" ? 1000 : unit === "MB" ? 1_000_000 : 1_000_000_000;
  return `${(bytes / divisor).toLocaleString("pt-PT", { maximumFractionDigits: 2 })} ${unit}`;
}
