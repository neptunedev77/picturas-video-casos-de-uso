"use client";

import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Download, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  COMPRESSION_QUALITIES,
  COMPRESSION_STATUS,
  type CompressionQuality,
  type CompressionTarget,
  downloadCompressionResult,
  formatCompressionBytes,
  isCompressionActive,
  useCompressionJobs,
  useCreateCompression,
  useCancelCompression,
} from "@/lib/compression";

interface Props {
  target: CompressionTarget;
  videoName: string;
  open: boolean;
}

export function CompressionPanel({ target, videoName, open }: Props) {
  const [quality, setQuality] = useState<CompressionQuality>("balanced");
  const starting = useRef(false);
  const query = useCompressionJobs(target, open);
  const create = useCreateCompression(target);
  const cancel = useCancelCompression(target);
  // Restore active work first; otherwise show this video's most recent result.
  const job = query.data?.find(isCompressionActive) ?? query.data?.[0];
  const busy = isCompressionActive(job);
  const cancelling = busy && (cancel.isPending || job?.cancelRequested === true);
  const progress = Math.min(100, Math.max(0, job?.progress || 0));
  const download = useMutation({
    mutationFn: async () => {
      if (!job) throw new Error("Não existe um resultado para descarregar.");
      const { blob, filename } = await downloadCompressionResult(target, job);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Give the browser time to begin saving before releasing the Blob URL.
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    },
    retry: false,
  });

  async function start() {
    if (starting.current || busy || create.isPending) return;
    starting.current = true;
    download.reset();
    cancel.reset();
    try { await create.mutateAsync(quality); }
    catch { /* The mutation's error is displayed below. */ }
    finally { starting.current = false; }
  }

  return (
    <div className="space-y-5" data-testid="compression-panel">
      <p className="break-all text-sm text-muted-foreground">{videoName}</p>

      <fieldset disabled={busy || create.isPending} className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Qualidade do vídeo otimizado</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {(Object.keys(COMPRESSION_QUALITIES) as CompressionQuality[]).map((value) => (
            <label key={value} className={`flex cursor-pointer items-center gap-2 rounded-md border p-3 text-sm ${
              quality === value ? "border-primary bg-primary/5" : "border-input"
            }`}>
              <input type="radio" name={`compression-quality-${target.imgId}`} value={value}
                checked={quality === value} onChange={() => { setQuality(value); create.reset(); }} />
              {COMPRESSION_QUALITIES[value]}
            </label>
          ))}
        </div>
      </fieldset>

      {query.isPending && <p role="status" className="text-sm text-muted-foreground">A consultar os trabalhos de compressão…</p>}
      {query.error && (
        <div role="alert" className="space-y-2 rounded-md border border-destructive/40 p-3 text-sm">
          <p>{query.error.message}</p>
          <Button variant="outline" size="sm" disabled={query.isFetching} onClick={() => void query.refetch()}>
            Tentar novamente
          </Button>
        </div>
      )}

      {job && (
        <div className="space-y-3 rounded-md border p-4">
          <div role="status" aria-live="polite" className="flex items-center gap-2 text-sm font-medium">
            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" />
              : job.status === "completed" ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                : job.status === "failed" ? <AlertTriangle className="h-4 w-4 text-destructive" /> : null}
            {COMPRESSION_STATUS[job.status]}
          </div>
          <p className="text-sm text-muted-foreground">Qualidade: {COMPRESSION_QUALITIES[job.quality]}</p>
          {busy && (
            <div className="space-y-2">
              <Progress value={progress} aria-label="Progresso da compressão" />
              <p className="text-sm text-muted-foreground">
                {cancelling ? "A aguardar confirmação do cancelamento"
                  : job.status === "queued" ? "A aguardar processamento" : "A comprimir o vídeo"} · {Math.round(progress)}%
              </p>
              <p className="text-xs text-muted-foreground">Pode fechar este diálogo e consultar o trabalho mais tarde.</p>
              <Button variant="outline" disabled={cancelling} onClick={() => {
                if (!cancelling) cancel.mutate(job._id);
              }}>
                {cancelling ? "A cancelar…" : "Cancelar"}
              </Button>
            </div>
          )}
          {job.status === "failed" && (
            <p role="alert" className="text-sm text-destructive">
              {job.error?.message || "Não foi possível comprimir o vídeo. Pode iniciar um novo trabalho."}
            </p>
          )}
          {job.status === "completed" && job.result && (
            <>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <dt className="text-muted-foreground">Tamanho final</dt>
                <dd>{formatCompressionBytes(job.result.sizeBytes)}</dd>
                <dt className="text-muted-foreground">Redução</dt>
                <dd>{job.result.reductionPercent.toLocaleString("pt-PT", { maximumFractionDigits: 2 })}%</dd>
              </dl>
              {job.result.sizeBytes > job.result.originalSizeBytes && (
                <p className="text-sm text-muted-foreground">O resultado ficou maior do que o original. Vídeos já comprimidos podem não diminuir de tamanho.</p>
              )}
              <Button variant="outline" disabled={download.isPending} onClick={() => download.mutate()}>
                {download.isPending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                {download.isPending ? "A descarregar…" : "Descarregar resultado"}
              </Button>
            </>
          )}
        </div>
      )}

      {create.error && <p role="alert" className="text-sm text-destructive">{create.error.message}</p>}
      {download.error && <p role="alert" className="text-sm text-destructive">{download.error.message}</p>}
      {cancel.error && <p role="alert" className="text-sm text-destructive">{cancel.error.message}</p>}
      <div className="flex justify-end">
        <Button disabled={busy || create.isPending || cancel.isPending || query.isPending || query.isError || download.isPending}
          onClick={() => void start()} data-testid="start-compression-button">
          {create.isPending && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
          {create.isPending ? "A iniciar…" : "Comprimir vídeo"}
        </Button>
      </div>
    </div>
  );
}
