"use client";

import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  LoaderCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  SUBTITLE_LANGUAGES,
  SubtitleApiError,
  downloadSubtitleResult,
  isSubtitleActive,
  isSubtitleTerminal,
  subtitleErrorMessage,
  subtitlePhaseLabel,
  subtitleStatusLabel,
  useSubtitleJob,
  type SubtitleCommand,
  type SubtitleLanguage,
  type SubtitleTarget,
} from "@/lib/subtitles";
import { SubtitlePreview, SubtitleVideoPreview } from "./subtitle-preview";

interface Props {
  target: SubtitleTarget;
  videoName: string;
  videoUrl: string;
  open: boolean;
}

export function SubtitleGenerationPanel({
  target,
  videoName,
  videoUrl,
  open,
}: Props) {
  const [language, setLanguage] = useState<SubtitleLanguage | "">("");
  const lock = useRef(false);
  const { query, mutation, ready, jobId, pending, reset } = useSubtitleJob(
    target,
    open,
  );
  const job = query.data;
  const active = isSubtitleActive(job);
  const cancelling = Boolean(
    job?.cancellationRequested && !isSubtitleTerminal(job),
  );
  const previewSegments =
    !cancelling &&
    (job?.status === "transcribed" || job?.status === "completed")
      ? job.segments
      : undefined;
  const locked = pending || mutation.isPending;
  const loading = !ready || Boolean(jobId && query.isPending);
  const [action, setAction] = useState<SubtitleCommand["action"] | null>(null);
  const segmentCount = useRef<{ jobId: string; count: number } | null>(null);
  if (job?.segments)
    segmentCount.current = { jobId: job.jobId, count: job.segments.length };

  const download = useMutation({
    mutationFn: async () => {
      if (!jobId) return;
      const { blob, filename } = await downloadSubtitleResult(target, jobId);
      const url = URL.createObjectURL(blob);
      try {
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
      } finally {
        window.setTimeout(() => URL.revokeObjectURL(url), 30000);
      }
    },
    retry: false,
  });

  async function run(command: SubtitleCommand) {
    if (lock.current || locked || cancelling) return;
    lock.current = true;
    setAction(command.action);
    download.reset();
    try {
      await mutation.mutateAsync(command);
    } catch {
      /* Render the structured mutation error below; never retry POSTs. */
    } finally {
      lock.current = false;
      setAction(null);
    }
  }
  function configureAgain() {
    if (
      lock.current ||
      locked ||
      (active && !missing) ||
      (cancelling && !missing)
    )
      return;
    reset();
    download.reset();
    setLanguage("");
    segmentCount.current = null;
  }
  const error = mutation.error || query.error || download.error;
  const missing =
    query.error instanceof SubtitleApiError && query.error.status === 404;
  const authenticationError =
    error instanceof SubtitleApiError && [401, 403].includes(error.status);
  const canAct =
    !locked && !cancelling && !query.isError && !authenticationError;

  return (
    <div
      className="space-y-5"
      data-testid="subtitle-generation-panel"
      aria-busy={loading || locked || active || cancelling}
    >
      <div className="space-y-2">
        <p className="break-all text-sm font-medium">{videoName}</p>
        <SubtitleVideoPreview
          videoUrl={videoUrl}
          videoName={videoName}
          segments={previewSegments}
        />
        <p className="text-xs text-muted-foreground">
          Vídeo original · O vídeo não será alterado. As legendas são um
          ficheiro SRT separado.
        </p>
      </div>

      {loading && (
        <p role="status" className="flex items-center gap-2 text-sm">
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> A
          recuperar o estado das legendas…
        </p>
      )}

      {!loading && !jobId && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (language) void run({ action: "start", language });
          }}
        >
          <div className="space-y-2">
            <label
              htmlFor={`subtitle-language-${target.imgId}`}
              className="text-sm font-medium"
            >
              Idioma do conteúdo falado
            </label>
            <select
              id={`subtitle-language-${target.imgId}`}
              required
              value={language}
              disabled={locked}
              onChange={(e) => {
                setLanguage(e.target.value as SubtitleLanguage | "");
                mutation.reset();
              }}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="" disabled>
                Selecione o idioma
              </option>
              {Object.entries(SUBTITLE_LANGUAGES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={!language || locked || authenticationError}
            >
              {locked && (
                <LoaderCircle
                  className="mr-2 h-4 w-4 animate-spin"
                  aria-hidden="true"
                />
              )}
              {locked ? "A iniciar…" : "Gerar legendas"}
            </Button>
          </div>
        </form>
      )}

      {job && (
        <div className="space-y-4 rounded-md border p-4">
          <div role="status" aria-live="polite" className="space-y-1">
            <p className="flex items-center gap-2 text-sm font-medium">
              {(active || cancelling) && (
                <LoaderCircle
                  className="h-4 w-4 animate-spin"
                  aria-hidden="true"
                />
              )}
              {job.status === "completed" && (
                <CheckCircle2
                  className="h-4 w-4 text-green-600"
                  aria-hidden="true"
                />
              )}
              {job.status === "failed" && (
                <AlertTriangle
                  className="h-4 w-4 text-destructive"
                  aria-hidden="true"
                />
              )}
              {locked && ["cancel", "reject"].includes(action || "")
                ? "A cancelar…"
                : subtitleStatusLabel(job)}
            </p>
            <p className="text-sm text-muted-foreground">
              {subtitlePhaseLabel(job)}
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            Idioma:{" "}
            {SUBTITLE_LANGUAGES[job.language as SubtitleLanguage] ||
              job.language}
          </p>
          {(active || cancelling) && (
            <p className="text-xs text-muted-foreground">
              Pode fechar este diálogo e regressar mais tarde neste browser.
            </p>
          )}

          {previewSegments && <SubtitlePreview segments={previewSegments} />}

          {job.status === "transcribed" && !cancelling && (
            <>
              {!job.segments && (
                <p role="status" className="text-sm">
                  A obter os segmentos guardados…
                </p>
              )}
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  variant="outline"
                  disabled={!canAct}
                  onClick={() =>
                    void run({ action: "reject", jobId: job.jobId })
                  }
                >
                  Rejeitar
                </Button>
                <Button
                  disabled={!canAct || !job.segments?.length}
                  onClick={() =>
                    void run({ action: "confirm", jobId: job.jobId })
                  }
                >
                  {locked && action === "confirm"
                    ? "A confirmar…"
                    : "Confirmar e gerar SRT"}
                </Button>
              </div>
            </>
          )}

          {!isSubtitleTerminal(job) && (
            <Button
              variant="outline"
              disabled={!canAct}
              onClick={() => void run({ action: "cancel", jobId: job.jobId })}
            >
              {cancelling || (locked && action === "cancel")
                ? "A cancelar…"
                : "Cancelar"}
            </Button>
          )}
          {job.status === "failed" && (
            <p role="alert" className="text-sm text-destructive">
              {subtitleErrorMessage(
                job.error?.code || "FAILED",
                0,
                job.error?.message,
              )}
            </p>
          )}
          {job.status === "cancelled" && (
            <p className="text-sm">
              A geração foi encerrada. Não foi criado um ficheiro SRT.
            </p>
          )}
          {job.status === "completed" && job.result && (
            <div className="space-y-3">
              <p className="text-sm font-medium">
                Legendas geradas com sucesso
              </p>
              <p className="break-all text-sm text-muted-foreground">
                {job.result.name}
              </p>
              {segmentCount.current?.jobId === job.jobId && (
                <p className="text-sm text-muted-foreground">
                  {segmentCount.current.count} segmentos
                </p>
              )}
              <Button
                variant="outline"
                disabled={download.isPending || locked}
                onClick={() => download.mutate()}
              >
                {download.isPending ? (
                  <LoaderCircle
                    className="mr-2 h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                )}
                {download.isPending ? "A descarregar…" : "Descarregar SRT"}
              </Button>
            </div>
          )}
          {isSubtitleTerminal(job) && (
            <Button
              variant="outline"
              disabled={locked || download.isPending || authenticationError}
              onClick={configureAgain}
            >
              Gerar novamente
            </Button>
          )}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="space-y-2 rounded-md border border-destructive/40 p-3 text-sm"
        >
          <p>{error.message}</p>
          {jobId && !authenticationError && (
            <Button
              variant="outline"
              size="sm"
              disabled={query.isFetching || locked}
              onClick={() => {
                mutation.reset();
                void query.refetch();
              }}
            >
              Atualizar estado
            </Button>
          )}
          {missing && (
            <Button
              variant="outline"
              size="sm"
              disabled={locked}
              onClick={configureAgain}
            >
              Voltar à configuração
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
