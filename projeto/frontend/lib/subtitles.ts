"use client";

import axios from "axios";
import { useEffect, useMemo, useState } from "react";
import {
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "./axios";
import { useGetSocket } from "./queries/projects";

export const SUBTITLE_LANGUAGES = { pt: "Português", en: "Inglês" } as const;
export type SubtitleLanguage = keyof typeof SUBTITLE_LANGUAGES;
export type SubtitleStatus =
  | "queued"
  | "processing"
  | "transcribed"
  | "completed"
  | "failed"
  | "cancelled";
export interface SubtitleSegment {
  start: number;
  end: number;
  text: string;
}
export interface SubtitleTarget {
  uid: string;
  pid: string;
  imgId: string;
  token: string;
  ownerId?: string;
  shareId?: string;
}
export interface SubtitleJob {
  jobId: string;
  projectId: string;
  imgId: string;
  runnerId: string;
  language: string;
  model: "base" | "small";
  status: SubtitleStatus;
  operation: "transcribe" | "generate_srt";
  phase: string;
  cancellationRequested: boolean;
  segments?: SubtitleSegment[];
  duration?: number;
  result: {
    key: string;
    name: string;
    contentType: string;
    sizeBytes: number;
    sha256: string;
    url?: string;
  } | null;
  error: { code: string; message: string; retryable?: boolean } | null;
  createdAt: string;
  updatedAt: string;
}
export type SubtitleCommand =
  | { action: "start"; language: SubtitleLanguage }
  | { action: "confirm" | "reject" | "cancel"; jobId: string };

export const isSubtitleActive = (job?: SubtitleJob) =>
  job?.status === "queued" || job?.status === "processing";
export const isSubtitleTerminal = (job?: SubtitleJob) =>
  Boolean(job && ["completed", "failed", "cancelled"].includes(job.status));
export function subtitleStatusLabel(job: SubtitleJob) {
  if (job.cancellationRequested && !isSubtitleTerminal(job))
    return "A cancelar…";
  if (isSubtitleActive(job) && job.operation === "generate_srt")
    return "A gerar ficheiro";
  return {
    queued: "Em fila",
    processing: "A processar",
    transcribed: "Transcrição pronta",
    completed: "Concluído",
    failed: "Falhou",
    cancelled: "Cancelado",
  }[job.status];
}
export function subtitlePhaseLabel(job: SubtitleJob) {
  const phases: Record<string, string> = {
    authorizing: "A preparar o pedido",
    queued: "A aguardar processamento",
    preparing: "A preparar o vídeo",
    starting: "A iniciar",
    validating: "A validar o vídeo",
    extracting_audio: "A extrair o áudio",
    transcribing: "A reconhecer a fala",
    already_running: "O processamento continua em curso",
    review: "Reveja as legendas antes de confirmar",
    generating_srt: "A gerar o ficheiro SRT",
    uploading: "A guardar o ficheiro SRT",
    cancelling: "A aguardar confirmação do cancelamento",
  };
  return phases[job.phase] || "";
}

function safeMessage(value: unknown): string | undefined {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > 500 ||
    /[<>]|Traceback|node_modules|\/app\/|\bat .+:\d|[A-Z]:\\|\n\s*at\s/i.test(
      value,
    )
  )
    return;
  return value;
}
export function subtitleErrorMessage(
  code: string,
  status = 0,
  message?: unknown,
) {
  if (status === 401) return "A sessão expirou. Volte a iniciar sessão.";
  if (status === 403)
    return "Não tem permissão para executar esta ação neste projeto.";
  if (status === 404) return "O job, projeto ou vídeo já não está disponível.";
  if (status === 429 || code === "QUOTA_EXCEEDED")
    return "Não tem quota disponível para gerar legendas. Tente mais tarde.";
  if (code.includes("AUDIO"))
    return "O vídeo não tem uma faixa de áudio utilizável.";
  if (code === "INVALID_LANGUAGE")
    return "O idioma selecionado não é suportado.";
  if (code === "STT_FAILED")
    return "Não foi possível reconhecer a fala. Pode iniciar uma nova geração.";
  if (code.includes("STORAGE") || code === "UPLOAD_FAILED")
    return "Não foi possível guardar ou obter as legendas. Tente novamente mais tarde.";
  if (code.includes("TIMEOUT"))
    return "O pedido excedeu o tempo de resposta. Consulte o estado antes de repetir a operação.";
  if (status === 409)
    return (
      safeMessage(message) ||
      "O estado do job mudou ou já existe uma geração ativa. Atualize o estado."
    );
  if (status >= 500)
    return "O serviço de legendas está indisponível. Tente consultar o estado novamente.";
  return (
    safeMessage(message) ||
    "Não foi possível concluir o pedido. Tente novamente mais tarde."
  );
}
export class SubtitleApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: unknown,
    public jobId?: string,
  ) {
    super(subtitleErrorMessage(code, status, message));
    this.name = "SubtitleApiError";
  }
}
function basePath(t: SubtitleTarget) {
  return `/projects/${encodeURIComponent(t.uid)}/${encodeURIComponent(t.pid)}/subtitles`;
}
function config(t: SubtitleTarget) {
  const params: Record<string, string> = {};
  if (t.shareId) {
    params.share = t.shareId;
    if (t.ownerId) params.owner = t.ownerId;
  }
  return {
    headers: { Authorization: `Bearer ${t.token}` },
    params,
    timeout: 20000,
  };
}
async function call<T>(request: () => Promise<{ data: T }>): Promise<T> {
  try {
    return (await request()).data;
  } catch (e) {
    if (!axios.isAxiosError(e)) throw new SubtitleApiError(0, "UNEXPECTED");
    const data = e.response?.data;
    const code =
      typeof data?.code === "string"
        ? data.code
        : e.code === "ECONNABORTED"
          ? "REQUEST_TIMEOUT"
          : "REQUEST_FAILED";
    throw new SubtitleApiError(
      e.response?.status || 0,
      code,
      data?.message,
      typeof data?.jobId === "string" && /^[0-9a-f-]{36}$/.test(data.jobId)
        ? data.jobId
        : undefined,
    );
  }
}
export async function fetchSubtitleJob(
  t: SubtitleTarget,
  jobId: string,
  signal?: AbortSignal,
) {
  const job = await call<SubtitleJob>(() =>
    api.get(`${basePath(t)}/${encodeURIComponent(jobId)}`, {
      ...config(t),
      signal,
    }),
  );
  if (job.jobId !== jobId || job.projectId !== t.pid || job.imgId !== t.imgId)
    throw new SubtitleApiError(404, "NOT_FOUND");
  return job;
}
export function startSubtitleJob(
  t: SubtitleTarget,
  language: SubtitleLanguage,
) {
  return call<SubtitleJob>(() =>
    api.post(basePath(t), { imgId: t.imgId, language }, config(t)),
  );
}
export function actOnSubtitleJob(
  t: SubtitleTarget,
  jobId: string,
  action: "confirm" | "reject" | "cancel",
) {
  // Confirmation deliberately contains no segments: the backend uses its draft.
  return call<SubtitleJob>(() =>
    api.post(
      `${basePath(t)}/${encodeURIComponent(jobId)}/${action}`,
      {},
      config(t),
    ),
  );
}

export async function downloadSubtitleResult(t: SubtitleTarget, jobId: string) {
  // Obtain a fresh signed URL at click time; never derive S3 URLs from keys.
  const job = await fetchSubtitleJob(t, jobId);
  if (job.status !== "completed" || !job.result?.url)
    throw new SubtitleApiError(
      409,
      "RESULT_UNAVAILABLE",
      "O ficheiro ainda não está disponível para descarregar.",
    );
  let url: URL;
  try {
    url = new URL(job.result.url, window.location.origin);
  } catch {
    throw new SubtitleApiError(502, "INVALID_RESULT_URL");
  }
  if (!["https:", "http:"].includes(url.protocol))
    throw new SubtitleApiError(502, "INVALID_RESULT_URL");
  try {
    // No JWT is sent to storage: the URL already carries the backend signature.
    const response = await axios.get<Blob>(url.href, {
      responseType: "blob",
      timeout: 60000,
    });
    if (!response.data.size) throw new Error("empty result");
    return {
      blob: response.data,
      filename: job.result.name.replace(/[\\/]/g, "_"),
    };
  } catch {
    throw new SubtitleApiError(
      503,
      "DOWNLOAD_FAILED",
      "Não foi possível descarregar o SRT. Tente novamente.",
    );
  }
}

// A browser bookmark, not job state: never store tokens, segments or signed URLs.
export const subtitleBookmarkKey = (t: SubtitleTarget) =>
  ["subtitle-job", t.uid, t.ownerId || t.uid, t.pid, t.imgId]
    .map(encodeURIComponent)
    .join(":");
export const subtitleJobKey = (t: SubtitleTarget, jobId: string | null) => [
  "subtitles",
  t.uid,
  t.ownerId,
  t.pid,
  t.imgId,
  t.shareId,
  t.token,
  jobId,
];

export function useSubtitleJob(
  { uid, pid, imgId, token, ownerId, shareId }: SubtitleTarget,
  enabled: boolean,
) {
  const t = useMemo(
    () => ({ uid, pid, imgId, token, ownerId, shareId }),
    [uid, pid, imgId, token, ownerId, shareId],
  );
  const qc = useQueryClient();
  const socket = useGetSocket(t.token);
  const bookmark = subtitleBookmarkKey(t);
  const pending =
    useIsMutating({ mutationKey: ["subtitle-command", bookmark] }) > 0;
  // Subscribe to the bookmark so a POST completing after modal unmount also
  // updates a newly opened panel. A one-time localStorage read would miss it.
  const bookmarkQuery = useQuery<string | null>({
    queryKey: [bookmark],
    queryFn: () => null,
    enabled: false,
    gcTime: 24 * 60 * 60 * 1000,
  });
  const jobId = bookmarkQuery.data || null;
  const [ready, setReady] = useState(false);
  const key = useMemo(() => subtitleJobKey(t, jobId), [t, jobId]);

  useEffect(() => {
    let saved = qc.getQueryData<string | null>([bookmark]) || null;
    try {
      saved = window.localStorage.getItem(bookmark) || saved;
    } catch {
      /* Session cache remains usable. */
    }
    qc.setQueryData(
      [bookmark],
      saved && /^[0-9a-f-]{36}$/.test(saved) ? saved : null,
    );
    setReady(true);
  }, [bookmark, qc]);

  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => fetchSubtitleJob(t, jobId!, signal),
    enabled: enabled && ready && Boolean(jobId),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    retry: false,
    refetchInterval: (q) =>
      isSubtitleActive(q.state.data) ||
      (q.state.data?.cancellationRequested && !isSubtitleTerminal(q.state.data))
        ? 4000
        : false,
  });

  function remember(id: string | null) {
    qc.setQueryData([bookmark], id);
    try {
      if (id) window.localStorage.setItem(bookmark, id);
      else window.localStorage.removeItem(bookmark);
    } catch {
      /* Storage can be disabled. */
    }
  }
  const mutation = useMutation({
    mutationKey: ["subtitle-command", bookmark],
    mutationFn: (command: SubtitleCommand) =>
      command.action === "start"
        ? startSubtitleJob(t, command.language)
        : actOnSubtitleJob(t, command.jobId, command.action),
    retry: false,
    onSuccess: async (job) => {
      // Abort older GETs before adopting a POST response, including after unmount.
      await qc.cancelQueries({
        queryKey: ["subtitles", t.uid, t.ownerId, t.pid, t.imgId],
      });
      qc.setQueryData(subtitleJobKey(t, job.jobId), job);
      remember(job.jobId);
      void qc.invalidateQueries({ queryKey: subtitleJobKey(t, job.jobId) });
    },
    onError: (error) => {
      if (error instanceof SubtitleApiError && error.jobId)
        remember(error.jobId);
      if (jobId) void qc.invalidateQueries({ queryKey: key });
    },
  });

  useEffect(() => {
    const s = socket.data;
    if (!s || !enabled || !jobId) return;
    const onUpdate = (msg: unknown) => {
      if (
        !msg ||
        typeof msg !== "object" ||
        !("jobId" in msg) ||
        !("projectId" in msg) ||
        !("imgId" in msg)
      )
        return;
      if (
        msg.jobId !== jobId ||
        msg.projectId !== t.pid ||
        msg.imgId !== t.imgId
      )
        return;
      // Even terminal WS events are hints. Fetch persisted segments/result/state.
      void qc.invalidateQueries({ queryKey: key });
    };
    const recover = () => {
      void qc.invalidateQueries({ queryKey: key });
    };
    s.on("subtitle-update", onUpdate);
    s.on("connect", recover);
    return () => {
      s.off("subtitle-update", onUpdate);
      s.off("connect", recover);
    };
  }, [socket.data, enabled, jobId, t.pid, t.imgId, key, qc]);

  return {
    query,
    mutation,
    jobId,
    ready,
    pending,
    reset: () => {
      remember(null);
      mutation.reset();
    },
  };
}
