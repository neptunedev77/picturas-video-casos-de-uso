"use client";

// UC-VID-001: Remover silêncios e pausas de um vídeo.
// Opções e perfis -> análise (com progresso) -> revisão dos troços -> aplicar cortes -> resultado.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Download,
  Info,
  LoaderCircle,
  Pause,
  Play,
  RotateCcw,
  Scissors,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  SILENCE_BUSY,
  SilenceApiError,
  SilenceOptions,
  SilenceProfile,
  SilenceSegment,
  SilenceState,
  SilenceTarget,
  analyzeSilence,
  applySilenceCuts,
  canChangeSegment,
  cancelSilence,
  computeSavings,
  fetchVideoUrl,
  formatTime,
  saveSilenceReview,
  silenceKey,
  useSilenceState,
} from "@/lib/silence";
import { SilenceTimeline } from "./silence-timeline";

const PROFILE_LABELS: Record<SilenceProfile, { name: string; hint: string }> = {
  suave: { name: "Suave", hint: "Remove só pausas longas" },
  equilibrado: { name: "Equilibrado", hint: "Recomendado para a maioria dos vídeos" },
  agressivo: { name: "Agressivo", hint: "Remove também pausas curtas" },
};

const STATUS_LABEL: Record<string, string> = {
  queued: "Em fila",
  analyzing: "A analisar o áudio",
  processing: "A gerar o novo vídeo",
};

type Confirm =
  | { kind: "discard"; message: string }
  | { kind: "large"; message: string }
  | null;

interface Props {
  target: SilenceTarget;
  videoUrl: string;
  videoName: string;
  open: boolean;
  userType: string;
  remainingOperations?: number | null;
  onOperationsChanged: () => void;
}

export function SilenceRemovalPanel({
  target,
  videoUrl,
  videoName,
  open,
  userType,
  remainingOperations,
  onOperationsChanged,
}: Props) {
  const qc = useQueryClient();
  const query = useSilenceState(target, open);
  const state = query.data;

  const [options, setOptions] = useState<SilenceOptions>({
    profile: "equilibrado",
    thresholdDb: -35,
    minPauseSec: 0.7,
    marginMs: 150,
    backgroundMusic: false,
  });
  const [showOptions, setShowOptions] = useState(false);
  const [review, setReview] = useState<SilenceSegment[]>([]);
  const [reviewDirty, setReviewDirty] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [segmentError, setSegmentError] = useState<{ index: number; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [playhead, setPlayhead] = useState<number | null>(null);
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const stopAtRef = useRef<number | null>(null);
  const loadedAnalysisRef = useRef<string | null>(null);
  const prevStatusRef = useRef<string | null>(null);

  const analysis = state?.analysis ?? null;
  const duration = analysis?.video.durationSec ?? 0;
  const status = state?.status ?? "none";
  const busy = SILENCE_BUSY.includes(status);

  const setState = useCallback(
    (s: SilenceState) => qc.setQueryData(silenceKey(target), (prev: SilenceState | undefined) => ({ ...prev, ...s })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [qc, target.pid, target.imgId, target.token],
  );

  // opções iniciais: as da última análise (ou o perfil Equilibrado)
  useEffect(() => {
    if (state?.options) setOptions(state.options);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.options?.profile, state?.options?.thresholdDb, state?.options?.minPauseSec, state?.options?.marginMs]);

  // carregar a revisão guardada no servidor (FA5); enquanto há alterações locais por guardar,
  // a versão local prevalece
  useEffect(() => {
    if (!state?.review || !analysis || reviewDirty) return;
    const sig = String(state.updatedAt ?? "");
    if (loadedAnalysisRef.current === sig) return;
    const first = loadedAnalysisRef.current === null;
    loadedAnalysisRef.current = sig;
    setReview(state.review.map((s) => ({ start: s.start, end: s.end, selected: s.selected })));
    if (first) setActiveIndex(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.updatedAt, analysis, reviewDirty]);

  // reações a mudanças de estado vindas do servidor
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;
    if (!prev || prev === status) return;
    if (status === "analyzed" || status === "none") setShowOptions(false);
    if (status === "completed" || (prev === "processing" && status !== "processing")) onOperationsChanged();
    if (status === "completed") setResultUrl(null);
  }, [status, onOperationsChanged]);

  // URL do novo vídeo para reprodução e transferência (REQ-VID-SIL-025)
  useEffect(() => {
    if (status !== "completed" || !state?.result?.imgId || resultUrl) return;
    fetchVideoUrl(target, state.result.imgId)
      .then((r) => setResultUrl(r.url))
      .catch(() => setResultUrl(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, state?.result?.imgId]);

  // guardar a revisão no servidor (debounce) para se poder retomar mais tarde (FA5)
  useEffect(() => {
    if (!reviewDirty || busy || !analysis) return;
    const t = setTimeout(() => {
      saveSilenceReview(target, review)
        .then((s) => {
          loadedAnalysisRef.current = String(s.updatedAt ?? "");
          setReviewDirty(false);
          setState(s);
        })
        .catch((e: SilenceApiError) => setError(e.message));
    }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [review, reviewDirty, busy]);

  const savings = useMemo(() => computeSavings(duration, review), [duration, review]);
  const selectedCount = review.filter((s) => s.selected).length;

  // ---------------------------------------------------------------- ações
  async function run(name: string, fn: () => Promise<void>) {
    setBusyAction(name);
    setError(null);
    try {
      await fn();
    } catch (e: any) {
      const err = e as SilenceApiError;
      if (err.code === "REVIEW_WILL_BE_LOST") setConfirm({ kind: "discard", message: err.message });
      else if (err.code === "CONFIRM_LARGE_REMOVAL") setConfirm({ kind: "large", message: err.message });
      else setError(err.message || "Ocorreu um erro. Tente novamente.");
    } finally {
      setBusyAction(null);
    }
  }

  const doAnalyze = (confirmDiscard = false) =>
    run("analyze", async () => {
      setConfirm(null);
      // FA3: ajustes ainda não guardados também se perdem
      if (reviewDirty && !confirmDiscard) {
        setConfirm({
          kind: "discard",
          message: "Os ajustes manuais feitos na revisão serão perdidos se analisar de novo. Confirme para continuar.",
        });
        return;
      }
      const s = await analyzeSilence(target, options, confirmDiscard);
      setReviewDirty(false);
      loadedAnalysisRef.current = null;
      setState(s);
    });

  const doApply = (confirmLargeRemoval = false) =>
    run("apply", async () => {
      setConfirm(null);
      const s = await applySilenceCuts(target, review, confirmLargeRemoval);
      setReviewDirty(false);
      setState(s);
    });

  const doCancel = () =>
    run("cancel", async () => {
      const s = await cancelSilence(target);
      setState(s);
      loadedAnalysisRef.current = null;
      qc.invalidateQueries({ queryKey: silenceKey(target) });
    });

  function chooseProfile(p: SilenceProfile) {
    const v = state?.profiles?.[p] ?? { thresholdDb: -35, minPauseSec: 0.7, marginMs: 150 };
    setOptions((o) => ({ ...o, profile: p, ...v }));
  }

  function updateSegment(index: number, start: number, end: number) {
    const msg = canChangeSegment(review, index, start, end, duration);
    if (msg) {
      // REQ-VID-SIL-011: alteração inválida recusada; o troço mantém o valor anterior
      setSegmentError({ index, message: msg });
      return false;
    }
    setSegmentError(null);
    setReview((r) => r.map((s, i) => (i === index ? { ...s, start: round2(start), end: round2(end) } : s)));
    setReviewDirty(true);
    return true;
  }

  function toggleSegment(index: number, selected: boolean) {
    setReview((r) => r.map((s, i) => (i === index ? { ...s, selected } : s)));
    setReviewDirty(true);
  }

  function setAll(selected: boolean) {
    setReview((r) => r.map((s) => ({ ...s, selected })));
    setReviewDirty(true);
  }

  // ouvir o troço com 1 s antes e depois (REQ-VID-SIL-011)
  function playSegment(index: number) {
    const v = videoRef.current;
    if (!v) return;
    if (playingIndex === index && !v.paused) {
      v.pause();
      setPlayingIndex(null);
      return;
    }
    const s = review[index];
    setActiveIndex(index);
    v.currentTime = Math.max(0, s.start - 1);
    stopAtRef.current = Math.min(duration, s.end + 1);
    setPlayingIndex(index);
    v.play().catch(() => setPlayingIndex(null));
  }

  function onTimeUpdate() {
    const v = videoRef.current;
    if (!v) return;
    setPlayhead(v.currentTime);
    if (stopAtRef.current != null && v.currentTime >= stopAtRef.current) {
      v.pause();
      stopAtRef.current = null;
      setPlayingIndex(null);
    }
  }

  // ---------------------------------------------------------------- render
  if (query.isLoading || !state) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-10 justify-center">
        <LoaderCircle className="animate-spin h-4 w-4" /> A carregar…
      </div>
    );
  }
  if (query.isError) {
    return <ErrorBox message={(query.error as Error)?.message || "Não foi possível obter o estado."} />;
  }

  const analysesInfo = state.analyses;
  const plan = userType === "premium" ? "Premium" : "Gratuito";
  const showReview = !!analysis && !showOptions && !busy;
  const noSegments = analysis && analysis.segments.length === 0;

  return (
    <div className="flex flex-col gap-4 min-h-0">
      {/* Cabeçalho: vídeo e quotas (passo 1) */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="font-medium text-foreground truncate max-w-[260px]" title={videoName}>{videoName}</span>
        {duration > 0 && <span>Duração: {formatTime(duration, 1)}</span>}
        <span>Plano {plan}</span>
        {userType !== "premium" && remainingOperations != null && (
          <span>Operações disponíveis hoje: <b className="text-foreground">{remainingOperations}</b></span>
        )}
        {analysesInfo?.limit != null && (
          <span>Análises restantes hoje: <b className="text-foreground">{analysesInfo.remaining}</b> / {analysesInfo.limit}</span>
        )}
      </div>

      {error && <ErrorBox message={error} onClose={() => setError(null)} />}

      {status === "failed" && state.error && !error && (
        <ErrorBox
          message={state.error.message}
          title={state.phase === "apply" ? "O processamento não foi concluído" : "A análise falhou"}
        />
      )}

      {confirm && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm flex flex-col gap-2">
          <div className="flex items-start gap-2 text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{confirm.message}</span>
          </div>
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="outline" onClick={() => setConfirm(null)}>Voltar</Button>
            <Button
              size="sm"
              variant={confirm.kind === "large" ? "destructive" : "default"}
              onClick={() => (confirm.kind === "discard" ? doAnalyze(true) : doApply(true))}
            >
              {confirm.kind === "discard" ? "Analisar de novo" : "Sim, remover"}
            </Button>
          </div>
        </div>
      )}

      {/* Pedido em curso: estado, progresso e cancelar sempre visível (passos 4 e 8) */}
      {busy && (
        <div className="flex flex-col gap-3 rounded-md border p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 font-medium">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              {STATUS_LABEL[status] ?? "A processar"}
            </span>
            <span className="font-mono text-xs">{Math.round(state.progress ?? 0)}%</span>
          </div>
          <Progress value={state.progress ?? 0} />
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">
              {state.phase === "apply"
                ? "Pode fechar esta janela: o processamento continua no servidor."
                : "A análise só lê o som do vídeo e não gasta operações."}
            </span>
            <Button size="sm" variant="outline" onClick={doCancel} disabled={busyAction === "cancel"}>
              <Ban className="h-3.5 w-3.5 mr-1" /> Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* Resultado (passo 11) */}
      {status === "completed" && state.result && !showOptions && (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" /> Novo vídeo criado: {state.result.name}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            <Stat label="Duração original" value={formatTime(state.result.originalSec, 1)} />
            <Stat label="Duração final" value={formatTime(state.result.finalSec, 1)} />
            <Stat label="Tempo poupado" value={`${state.result.removedSec.toFixed(1)} s`} />
            <Stat label="Redução" value={`${state.result.removedPct.toFixed(1)}%`} />
          </div>
          {resultUrl ? (
            <div className="flex flex-col gap-2">
              <video src={resultUrl} controls className="w-full max-h-64 rounded bg-black" />
              <a href={resultUrl} download={state.result.name} target="_blank" rel="noreferrer" className="self-end">
                <Button size="sm" variant="outline"><Download className="h-3.5 w-3.5 mr-1" /> Transferir</Button>
              </a>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">A carregar o novo vídeo…</span>
          )}
          <span className="text-xs text-muted-foreground">
            O vídeo original mantém-se inalterado. O novo vídeo já aparece na lista do projeto.
          </span>
        </div>
      )}

      {/* Opções de deteção e perfis (passos 2 e 3) */}
      {!busy && (!analysis || showOptions) && (
        <OptionsPanel
          options={options}
          setOptions={setOptions}
          chooseProfile={chooseProfile}
          ranges={state.ranges}
          onAnalyze={() => doAnalyze(false)}
          onBack={analysis ? () => setShowOptions(false) : undefined}
          analyzing={busyAction === "analyze"}
          blocked={analysesInfo?.remaining === 0}
        />
      )}

      {/* Revisão dos troços (passos 5 e 6) */}
      {showReview && analysis && (
        <div className="flex flex-col gap-3 min-h-0">
          {noSegments ? (
            <div className="rounded-md border p-4 text-sm flex flex-col gap-3">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 mt-0.5 shrink-0 text-indigo-500" />
                <span>{analysis.message ?? "Não foram encontradas pausas a remover."}</span>
              </div>
              {analysis.suggestedProfile && (
                <Button
                  size="sm"
                  className="self-start"
                  onClick={() => {
                    chooseProfile(analysis.suggestedProfile!);
                    setShowOptions(true);
                  }}
                >
                  Experimentar o perfil {PROFILE_LABELS[analysis.suggestedProfile].name}
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <Stat label="Duração original" value={formatTime(duration, 1)} />
                <Stat label="Duração final" value={formatTime(savings.finalSec, 1)} />
                <Stat label="Tempo removido" value={`${savings.removedSec.toFixed(1)} s`} />
                <Stat label="Redução" value={`${savings.removedPct.toFixed(1)}%`} highlight={savings.removedPct > 80} />
              </div>

              <SilenceTimeline
                waveform={analysis.waveform}
                durationSec={duration}
                review={review}
                activeIndex={activeIndex}
                playheadSec={playhead}
                onSelect={setActiveIndex}
                onChange={(i, s, e) => updateSegment(i, s, e)}
                onSeek={(sec) => {
                  if (videoRef.current) videoRef.current.currentTime = sec;
                  setPlayhead(sec);
                }}
              />

              <div className="grid gap-3 md:grid-cols-[240px_1fr] min-h-0">
                <video
                  ref={videoRef}
                  src={videoUrl}
                  controls
                  preload="metadata"
                  className="w-full rounded bg-black max-h-48"
                  onTimeUpdate={onTimeUpdate}
                  onPause={() => setPlayingIndex(null)}
                />
                <SegmentList
                  review={review}
                  activeIndex={activeIndex}
                  playingIndex={playingIndex}
                  segmentError={segmentError}
                  onActivate={setActiveIndex}
                  onToggle={toggleSegment}
                  onChange={updateSegment}
                  onPlay={playSegment}
                />
              </div>
            </>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowOptions(true)}>
                <RotateCcw className="h-3.5 w-3.5 mr-1" /> Analisar de novo
              </Button>
              {!noSegments && (
                <>
                  <Button size="sm" variant="ghost" onClick={() => setAll(true)}>Marcar todos</Button>
                  <Button size="sm" variant="ghost" onClick={() => setAll(false)}>Desmarcar todos</Button>
                </>
              )}
            </div>
            {!noSegments && (
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">
                  {selectedCount} de {review.length} troços selecionados
                  {userType !== "premium" && " · gasta 1 operação"}
                </span>
                <Button
                  size="sm"
                  onClick={() => doApply(false)}
                  disabled={selectedCount === 0 || busyAction === "apply"}
                  title={selectedCount === 0 ? "Selecione pelo menos um troço" : undefined}
                >
                  {busyAction === "apply" ? (
                    <LoaderCircle className="h-3.5 w-3.5 mr-1 animate-spin" />
                  ) : (
                    <Scissors className="h-3.5 w-3.5 mr-1" />
                  )}
                  Aplicar cortes
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-md border px-2 py-1.5 ${highlight ? "border-amber-500/60 bg-amber-500/10" : "bg-muted/30"}`}>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-mono text-sm font-semibold">{value}</div>
    </div>
  );
}

function ErrorBox({ message, title, onClose }: { message: string; title?: string; onClose?: () => void }) {
  return (
    <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300 flex items-start gap-2">
      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
      <div className="flex-1">
        {title && <div className="font-medium">{title}</div>}
        <div>{message}</div>
      </div>
      {onClose && (
        <button className="text-xs underline" onClick={onClose}>Fechar</button>
      )}
    </div>
  );
}

function OptionsPanel({
  options,
  setOptions,
  chooseProfile,
  ranges,
  onAnalyze,
  onBack,
  analyzing,
  blocked,
}: {
  options: SilenceOptions;
  setOptions: (fn: (o: SilenceOptions) => SilenceOptions) => void;
  chooseProfile: (p: SilenceProfile) => void;
  ranges: SilenceState["ranges"];
  onAnalyze: () => void;
  onBack?: () => void;
  analyzing: boolean;
  blocked: boolean;
}) {
  const fields: { key: "thresholdDb" | "minPauseSec" | "marginMs"; label: string; step: number; help: string }[] = [
    { key: "thresholdDb", label: "Sensibilidade ao silêncio (dB)", step: 1, help: "Som abaixo deste nível conta como silêncio" },
    { key: "minPauseSec", label: "Duração mínima da pausa (s)", step: 0.1, help: "Pausas mais curtas são mantidas" },
    { key: "marginMs", label: "Margem antes e depois da fala (ms)", step: 10, help: "Evita cortar o início e o fim das palavras" },
  ];
  const invalid = fields.find(({ key }) => {
    const v = options[key];
    const r = ranges?.[key];
    return !Number.isFinite(v) || (r && (v < r.min || v > r.max));
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-2">
        {(Object.keys(PROFILE_LABELS) as SilenceProfile[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => chooseProfile(p)}
            className={`rounded-md border p-2 text-left transition-colors ${
              options.profile === p ? "border-primary bg-primary/10" : "hover:bg-muted"
            }`}
          >
            <div className="text-sm font-medium">{PROFILE_LABELS[p].name}</div>
            <div className="text-[11px] text-muted-foreground">{PROFILE_LABELS[p].hint}</div>
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {fields.map(({ key, label, step, help }) => {
          const r = ranges?.[key];
          const v = options[key];
          const bad = !Number.isFinite(v) || (r && (v < r.min || v > r.max));
          return (
            <label key={key} className="flex flex-col gap-1">
              <span className="text-xs font-medium">{label}</span>
              <Input
                type="number"
                step={step}
                min={r?.min}
                max={r?.max}
                value={Number.isFinite(v) ? v : ""}
                className={`h-8 text-sm ${bad ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                onChange={(e) => {
                  const n = e.target.value === "" ? NaN : Number(e.target.value);
                  setOptions((o) => ({ ...o, [key]: n }));
                }}
              />
              <span className={`text-[11px] ${bad ? "text-red-600" : "text-muted-foreground"}`}>
                {bad && r ? `Entre ${r.min} e ${r.max} ${r.unit}` : help}
              </span>
            </label>
          );
        })}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={options.backgroundMusic}
          onCheckedChange={(c) => setOptions((o) => ({ ...o, backgroundMusic: c === true }))}
        />
        O vídeo tem música de fundo
        <span className="text-[11px] text-muted-foreground">(dá prioridade às frequências da voz)</span>
      </label>

      <div className="flex justify-between items-center border-t pt-3">
        <span className="text-xs text-muted-foreground">A análise não gasta operações e pode ser repetida.</span>
        <div className="flex gap-2">
          {onBack && (
            <Button size="sm" variant="outline" onClick={onBack}>Voltar à revisão</Button>
          )}
          <Button size="sm" onClick={onAnalyze} disabled={analyzing || !!invalid || blocked}>
            {analyzing && <LoaderCircle className="h-3.5 w-3.5 mr-1 animate-spin" />}
            Analisar
          </Button>
        </div>
      </div>
    </div>
  );
}

function SegmentList({
  review,
  activeIndex,
  playingIndex,
  segmentError,
  onActivate,
  onToggle,
  onChange,
  onPlay,
}: {
  review: SilenceSegment[];
  activeIndex: number | null;
  playingIndex: number | null;
  segmentError: { index: number; message: string } | null;
  onActivate: (i: number) => void;
  onToggle: (i: number, selected: boolean) => void;
  onChange: (i: number, start: number, end: number) => boolean;
  onPlay: (i: number) => void;
}) {
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  useEffect(() => {
    if (activeIndex != null) rowRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  return (
    <div className="flex flex-col border rounded-md min-h-0 max-h-56 overflow-y-auto text-xs">
      <div className="grid grid-cols-[28px_32px_1fr_1fr_64px_32px] gap-1 px-2 py-1 font-medium text-muted-foreground sticky top-0 bg-background border-b">
        <span />
        <span>#</span>
        <span>Início</span>
        <span>Fim</span>
        <span className="text-right">Duração</span>
        <span />
      </div>
      {review.map((s, i) => (
        <div
          key={i}
          ref={(el) => { rowRefs.current[i] = el; }}
          onClick={() => onActivate(i)}
          className={`grid grid-cols-[28px_32px_1fr_1fr_64px_32px] gap-1 items-center px-2 py-1 border-b last:border-b-0 ${
            i === activeIndex ? "bg-red-500/10" : ""
          } ${s.selected ? "" : "text-muted-foreground"}`}
        >
          <Checkbox
            checked={s.selected}
            onCheckedChange={(c) => onToggle(i, c === true)}
            aria-label={`Remover troço ${i + 1}`}
          />
          <span className="font-mono">{i + 1}</span>
          <TimeInput value={s.start} onCommit={(v) => onChange(i, v, s.end)} />
          <TimeInput value={s.end} onCommit={(v) => onChange(i, s.start, v)} />
          <span className="text-right font-mono">{(s.end - s.start).toFixed(2)} s</span>
          <button
            type="button"
            className="p-1 rounded hover:bg-muted"
            title="Ouvir o troço (1 s antes e depois)"
            onClick={(e) => {
              e.stopPropagation();
              onPlay(i);
            }}
          >
            {playingIndex === i ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </button>
          {segmentError?.index === i && (
            <span className="col-span-6 text-[11px] text-red-600">{segmentError.message}</span>
          )}
        </div>
      ))}
    </div>
  );
}

// Campo de tempo em segundos: só aplica ao sair do campo / Enter; se for recusado volta ao valor anterior
function TimeInput({ value, onCommit }: { value: number; onCommit: (v: number) => boolean }) {
  const [text, setText] = useState(value.toFixed(2));
  useEffect(() => setText(value.toFixed(2)), [value]);
  const commit = () => {
    const n = Number(text.replace(",", "."));
    if (!Number.isFinite(n) || !onCommit(n)) setText(value.toFixed(2));
  };
  return (
    <Input
      value={text}
      inputMode="decimal"
      className="h-6 px-1 text-xs font-mono"
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}
