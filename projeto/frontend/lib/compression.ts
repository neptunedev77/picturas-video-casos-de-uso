// UC-VID-002: independent REST client and polling; no pipeline or WebSocket state.
import axios from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./axios";

export type CompressionQuality = "high" | "balanced" | "small";
export type CompressionStatus = "queued" | "processing" | "completed" | "failed" | "cancelled";

export const COMPRESSION_QUALITIES: Record<CompressionQuality, string> = {
  high: "Alta",
  balanced: "Equilibrada",
  small: "Tamanho reduzido",
};

export const COMPRESSION_STATUS: Record<CompressionStatus, string> = {
  queued: "Em fila",
  processing: "Em processamento",
  completed: "Concluído",
  failed: "Falhado",
  cancelled: "Cancelado",
};

export interface CompressionTarget {
  uid: string;
  pid: string;
  imgId: string;
  token: string;
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
  } | null;
  error?: { code?: string; message?: string } | null;
  createdAt: string;
  updatedAt: string;
}

export function isCompressionActive(job?: CompressionJob) {
  return job?.status === "queued" || job?.status === "processing";
}

function basePath(t: CompressionTarget) {
  return `/projects/${encodeURIComponent(t.uid)}/${encodeURIComponent(t.pid)}/compression`;
}

function config(t: CompressionTarget) {
  return { headers: { Authorization: `Bearer ${t.token}` } };
}

async function apiError(error: unknown): Promise<Error> {
  if (axios.isAxiosError(error)) {
    let data: unknown = error.response?.data;
    // Axios also returns error bodies as Blobs for authenticated downloads.
    if (typeof Blob !== "undefined" && data instanceof Blob) {
      try { data = JSON.parse(await data.text()); } catch { data = null; }
    }
    if (data && typeof data === "object" && "message" in data && typeof data.message === "string") {
      return new Error(data.message);
    }
    if (error.response?.status === 401) return new Error("A sessão expirou. Volte a iniciar sessão.");
    if (error.response?.status === 403) return new Error("A compressão está disponível apenas para o proprietário do vídeo.");
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
  return { blob, filename: `${name}-${job.quality}.mp4` };
}

export const compressionKey = (t: CompressionTarget) => ["compression", t.uid, t.pid, t.imgId, t.token];

export function useCompressionJobs(t: CompressionTarget, enabled: boolean) {
  return useQuery({
    queryKey: compressionKey(t),
    queryFn: () => fetchCompressionJobs(t),
    enabled: enabled && Boolean(t.imgId),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    retry: 1,
    refetchInterval: (query) => query.state.data?.some(isCompressionActive) ? 2000 : false,
  });
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
    // Also resync on 409: the worker may have claimed the job since the last poll.
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
