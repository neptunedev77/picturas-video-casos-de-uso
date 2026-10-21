"use client";

import { useState, useEffect } from "react";
import { EyeOff, Clock, Plus, Trash2, AlertTriangle } from "lucide-react";
import { ToolbarButton } from "./toolbar-button";
import {
  PrivacyBlurMode,
  PrivacyBlurTargets,
  PrivacyBlurStyle,
  PrivacyBlurIntensity,
  ManualBoundingBox,
  TimeInterval,
} from "@/lib/tool-types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useCurrentImage } from "@/providers/project-provider";

export default function PrivacyBlurTool({ disabled }: { disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const currentImage = useCurrentImage();

  // Duração real do vídeo em segundos (obtida de metadata ou DOM)
  const [videoDuration, setVideoDuration] = useState<number | null>(
    currentImage?.duration || null
  );

  useEffect(() => {
    if (currentImage?.duration) {
      setVideoDuration(currentImage.duration);
      return;
    }

    const isVideo =
      currentImage?.name?.toLowerCase().endsWith(".mp4") ||
      currentImage?.url?.toLowerCase().includes(".mp4");

    if (isVideo && currentImage?.url) {
      // 1. Tentar ler do elemento <video> já presente no DOM
      const domVideo = document.querySelector("video") as HTMLVideoElement | null;
      if (domVideo && domVideo.duration && !isNaN(domVideo.duration) && isFinite(domVideo.duration)) {
        setVideoDuration(domVideo.duration);
        return;
      }

      // 2. Carregar metadados do vídeo em background
      const tempVideo = document.createElement("video");
      tempVideo.preload = "metadata";
      tempVideo.src = currentImage.url;
      tempVideo.onloadedmetadata = () => {
        if (tempVideo.duration && !isNaN(tempVideo.duration) && isFinite(tempVideo.duration)) {
          setVideoDuration(tempVideo.duration);
        }
      };
    }
  }, [currentImage?.url, currentImage?.duration, currentImage?.name]);

  // Modo: Automático (IA), Manual (Área Retangular) ou Híbrido
  const [mode, setMode] = useState<PrivacyBlurMode>("auto");

  // Parâmetros automáticos
  const [targets, setTargets] = useState<PrivacyBlurTargets>("both");
  const [blurType, setBlurType] = useState<PrivacyBlurStyle>("gaussian");
  const [intensity, setIntensity] = useState<PrivacyBlurIntensity>("medium");

  // Parâmetros manuais (percentagens 0-100%)
  const [manualBox, setManualBox] = useState<ManualBoundingBox>({
    x: 30,
    y: 20,
    width: 40,
    height: 35,
  });

  // Âmbito temporal: "all" (Todo o vídeo) ou "intervals" (Intervalos específicos em segundos)
  const [timeScope, setTimeScope] = useState<"all" | "intervals">("all");
  const [intervals, setIntervals] = useState<Array<{ id: number; start: number; end: number }>>([
    { id: 1, start: 0, end: 3 },
    { id: 2, start: 5, end: 6 },
  ]);
  const [intervalsText, setIntervalsText] = useState("0-3, 5-6");

  const maxSec = videoDuration ? Math.round(videoDuration * 10) / 10 : undefined;

  // Verifica se algum intervalo excede a duração real do vídeo
  const hasOverDuration = Boolean(
    videoDuration &&
    timeScope === "intervals" &&
    intervals.some((i) => i.end > videoDuration || i.start >= videoDuration)
  );

  function clampToDuration() {
    if (!videoDuration) return;
    const dur = Math.round(videoDuration * 10) / 10;
    const clamped = intervals
      .filter((i) => i.start < videoDuration)
      .map((i) => ({
        ...i,
        end: Math.min(i.end, dur),
      }));
    if (clamped.length === 0) {
      clamped.push({ id: 1, start: 0, end: dur });
    }
    setIntervals(clamped);
    setIntervalsText(clamped.map((i) => `${i.start}-${i.end}`).join(", "));
  }

  function handleTextChange(val: string) {
    setIntervalsText(val);
    const parsed: Array<{ id: number; start: number; end: number }> = [];
    const parts = val.split(",").map((p) => p.trim()).filter(Boolean);
    let idCounter = 1;
    for (const p of parts) {
      if (p.includes("-")) {
        const [sStr, eStr] = p.split("-");
        const s = parseFloat(sStr);
        const e = parseFloat(eStr);
        if (!isNaN(s) && !isNaN(e)) {
          parsed.push({ id: idCounter++, start: s, end: e });
        }
      }
    }
    if (parsed.length > 0) {
      setIntervals(parsed);
    }
  }

  function handleIntervalChange(id: number, field: "start" | "end", value: number) {
    const updated = intervals.map((item) =>
      item.id === id ? { ...item, [field]: value } : item
    );
    setIntervals(updated);
    setIntervalsText(updated.map((i) => `${i.start}-${i.end}`).join(", "));
  }

  function handleAddInterval() {
    const last = intervals[intervals.length - 1];
    const newStart = last ? Math.max(0, last.end + 1) : 0;
    const maxBound = videoDuration ? Math.round(videoDuration) : newStart + 3;
    const newEnd = Math.min(maxBound, newStart + 3);
    const newId = (intervals[intervals.length - 1]?.id || 0) + 1;
    const updated = [...intervals, { id: newId, start: newStart, end: newEnd }];
    setIntervals(updated);
    setIntervalsText(updated.map((i) => `${i.start}-${i.end}`).join(", "));
  }

  function handleRemoveInterval(id: number) {
    const updated = intervals.filter((item) => item.id !== id);
    setIntervals(updated);
    setIntervalsText(updated.map((i) => `${i.start}-${i.end}`).join(", "));
  }

  return (
    <ToolbarButton
      icon={EyeOff}
      label="Anonimizar rostos e matrículas"
      disabled={disabled}
      isPremium={false}
      open={open}
      setOpen={setOpen}
      noPreview={true}
      contentClassName="!w-auto !min-w-[340px] max-w-sm p-3"
      tool={{
        procedure: "privacy_blur",
        params: {
          mode,
          targets,
          blurType,
          intensity,
          confidenceThreshold: 0.65,
          ...(mode === "manual" || mode === "hybrid" ? { manualBox } : {}),
          ...(timeScope === "intervals" && intervals.length > 0
            ? {
                timeIntervals: intervals
                  .filter((i) => (videoDuration ? i.start < videoDuration : true))
                  .map((i) => ({
                    start: Number(i.start),
                    end: Number(videoDuration ? Math.min(i.end, videoDuration) : i.end),
                  })),
                timeIntervalsStr: intervals
                  .filter((i) => (videoDuration ? i.start < videoDuration : true))
                  .map((i) => `${i.start}-${videoDuration ? Math.min(i.end, videoDuration) : i.end}`)
                  .join(", "),
              }
            : {}),
        },
      }}
    >
      <div className="flex flex-col gap-3 p-1 w-full min-w-[320px] max-h-[75vh] overflow-y-auto">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Configuração de Privacidade
        </div>

        {/* Modo de Operação */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium">Modo de Anonimização</label>
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            value={mode}
            onChange={(e) => setMode(e.target.value as PrivacyBlurMode)}
          >
            <option value="auto">Automático (Deteção com IA)</option>
            <option value="manual">Manual (Definir Área/Coordenadas)</option>
            <option value="hybrid">Híbrido (IA + Área Manual)</option>
          </select>
        </div>

        {/* Seletor de alvos automáticos (se não for puramente manual) */}
        {mode !== "manual" && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium">Alvos Automáticos (IA)</label>
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              value={targets}
              onChange={(e) => setTargets(e.target.value as PrivacyBlurTargets)}
            >
              <option value="both">Rostos e Matrículas (Ambos)</option>
              <option value="faces">Apenas Rostos</option>
              <option value="plates">Apenas Matrículas</option>
            </select>
          </div>
        )}

        {/* Área manual de exclusão / anonimização (se manual ou híbrido) */}
        {(mode === "manual" || mode === "hybrid") && (
          <div className="flex flex-col gap-2 p-2.5 rounded-md border border-border/70 bg-muted/20">
            <div className="flex justify-between items-center">
              <label className="text-xs font-medium">Área Manual (% do vídeo)</label>
              {/* Presets rápidos */}
              <div className="flex gap-1 text-[10px]">
                <button
                  type="button"
                  className="px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 text-foreground"
                  onClick={() => setManualBox({ x: 30, y: 20, width: 40, height: 35 })}
                >
                  Centro
                </button>
                <button
                  type="button"
                  className="px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 text-foreground"
                  onClick={() => setManualBox({ x: 25, y: 10, width: 50, height: 30 })}
                >
                  Topo
                </button>
                <button
                  type="button"
                  className="px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 text-foreground"
                  onClick={() => setManualBox({ x: 20, y: 60, width: 60, height: 30 })}
                >
                  Fundo
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <span className="text-[11px] text-muted-foreground">Posição X (%)</span>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  className="h-8 text-xs"
                  value={manualBox.x}
                  onChange={(e) =>
                    setManualBox((prev) => ({ ...prev, x: Math.max(0, Math.min(100, Number(e.target.value))) }))
                  }
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[11px] text-muted-foreground">Posição Y (%)</span>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  className="h-8 text-xs"
                  value={manualBox.y}
                  onChange={(e) =>
                    setManualBox((prev) => ({ ...prev, y: Math.max(0, Math.min(100, Number(e.target.value))) }))
                  }
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[11px] text-muted-foreground">Largura (%)</span>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  className="h-8 text-xs"
                  value={manualBox.width}
                  onChange={(e) =>
                    setManualBox((prev) => ({ ...prev, width: Math.max(1, Math.min(100, Number(e.target.value))) }))
                  }
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[11px] text-muted-foreground">Altura (%)</span>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  className="h-8 text-xs"
                  value={manualBox.height}
                  onChange={(e) =>
                    setManualBox((prev) => ({ ...prev, height: Math.max(1, Math.min(100, Number(e.target.value))) }))
                  }
                />
              </div>
            </div>
          </div>
        )}

        {/* Estilo de ocultação */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium">Estilo de Máscara</label>
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            value={blurType}
            onChange={(e) => setBlurType(e.target.value as PrivacyBlurStyle)}
          >
            <option value="gaussian">Desfocagem Gaussiana (Blur)</option>
            <option value="pixelate">Mosaico (Pixelate)</option>
          </select>
        </div>

        {/* Nível de intensidade */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium">Nível de Intensidade</label>
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            value={intensity}
            onChange={(e) => setIntensity(e.target.value as PrivacyBlurIntensity)}
          >
            <option value="low">Baixa</option>
            <option value="medium">Média (Recomendado)</option>
            <option value="high">Alta</option>
          </select>
        </div>

        {/* Intervalo de Tempo / Segundos */}
        <div className="flex flex-col gap-2 p-2.5 rounded-md border border-border/70 bg-muted/20">
          <div className="flex justify-between items-center">
            <label className="text-xs font-medium flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-primary" />
              <span>Intervalo(s) de Tempo (Segundos)</span>
            </label>
            {videoDuration !== null && (
              <span className="text-[10px] text-muted-foreground font-mono bg-muted/60 px-1.5 py-0.5 rounded">
                Duração: {videoDuration.toFixed(1)}s
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              className={`py-1 text-xs rounded-md border font-medium transition-colors ${
                timeScope === "all"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background hover:bg-muted text-muted-foreground border-input"
              }`}
              onClick={() => setTimeScope("all")}
            >
              Todo o Vídeo
            </button>
            <button
              type="button"
              className={`py-1 text-xs rounded-md border font-medium transition-colors ${
                timeScope === "intervals"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background hover:bg-muted text-muted-foreground border-input"
              }`}
              onClick={() => setTimeScope("intervals")}
            >
              Definir Segundos
            </button>
          </div>

          {timeScope === "intervals" && (
            <div className="flex flex-col gap-2 mt-1">
              {/* Alerta caso o tempo inserido exceda a duração real do vídeo */}
              {hasOverDuration && videoDuration !== null && (
                <div className="p-2 rounded bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-[11px] flex flex-col gap-1">
                  <div className="font-semibold flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Tempo excede a duração do vídeo ({videoDuration.toFixed(1)}s)
                  </div>
                  <div>
                    Inseriste intervalos superiores a {videoDuration.toFixed(1)}s. Podes ajustar automaticamente:
                  </div>
                  <button
                    type="button"
                    className="mt-0.5 text-left text-[11px] underline font-medium hover:text-amber-700 dark:hover:text-amber-300"
                    onClick={clampToDuration}
                  >
                    ➜ Ajustar intervalos para o limite do vídeo (0-{Math.round(videoDuration)}s)
                  </button>
                </div>
              )}

              {/* Atalho de texto rápido com presets adaptativos */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-center">
                  <span className="text-[11px] text-muted-foreground">
                    Ex: 0-3, 5-6 (segundos)
                  </span>
                  <div className="flex gap-1 text-[10px]">
                    {videoDuration && videoDuration <= 5 ? (
                      <>
                        <button
                          type="button"
                          className="px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 text-foreground"
                          onClick={() => handleTextChange(`0-${Math.round(videoDuration)}`)}
                        >
                          0-{Math.round(videoDuration)}s
                        </button>
                        <button
                          type="button"
                          className="px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 text-foreground"
                          onClick={() =>
                            handleTextChange(`0-${Math.max(1, Math.floor(videoDuration / 2))}`)
                          }
                        >
                          0-{Math.max(1, Math.floor(videoDuration / 2))}s
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 text-foreground"
                          onClick={() => handleTextChange("0-3, 5-6")}
                        >
                          0-3s, 5-6s
                        </button>
                        <button
                          type="button"
                          className="px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 text-foreground"
                          onClick={() => handleTextChange("0-5")}
                        >
                          0-5s
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <Input
                  type="text"
                  placeholder={videoDuration ? `0-${Math.round(videoDuration)}` : "0-3, 5-6"}
                  className={`h-8 text-xs font-mono ${
                    hasOverDuration ? "border-amber-500 focus-visible:ring-amber-500" : ""
                  }`}
                  value={intervalsText}
                  onChange={(e) => handleTextChange(e.target.value)}
                />
              </div>

              {/* Lista de intervalos individuais */}
              <div className="flex flex-col gap-1.5 max-h-36 overflow-y-auto pr-0.5">
                {intervals.map((item, idx) => {
                  const isExceeded = videoDuration !== null && item.end > videoDuration;
                  return (
                    <div
                      key={item.id}
                      className={`flex items-center gap-1.5 bg-background p-1.5 rounded border text-xs ${
                        isExceeded ? "border-amber-500/70 bg-amber-500/5" : "border-border/60"
                      }`}
                    >
                      <span className="text-[11px] font-semibold text-muted-foreground w-4">
                        #{idx + 1}
                      </span>
                      <span className="text-[11px] text-muted-foreground">De</span>
                      <Input
                        type="number"
                        min={0}
                        max={maxSec}
                        step={0.5}
                        className="h-7 w-16 text-xs px-1.5"
                        value={item.start}
                        onChange={(e) =>
                          handleIntervalChange(item.id, "start", Math.max(0, Number(e.target.value)))
                        }
                      />
                      <span className="text-[11px] text-muted-foreground">s até</span>
                      <Input
                        type="number"
                        min={0}
                        max={maxSec}
                        step={0.5}
                        className={`h-7 w-16 text-xs px-1.5 ${
                          isExceeded ? "border-amber-500 text-amber-600 font-semibold" : ""
                        }`}
                        value={item.end}
                        onChange={(e) =>
                          handleIntervalChange(item.id, "end", Math.max(0, Number(e.target.value)))
                        }
                      />
                      <span className="text-[11px] text-muted-foreground">s</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveInterval(item.id)}
                        className="ml-auto text-red-500 hover:text-red-700 p-1"
                        title="Remover intervalo"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs w-full flex items-center gap-1"
                onClick={handleAddInterval}
              >
                <Plus className="w-3 h-3" /> Adicionar Intervalo
              </Button>
            </div>
          )}
        </div>

        <div className="text-[11px] text-muted-foreground pt-1 border-t border-border/50">
          * Deteção com IA e preservação automática de áudio original.
        </div>
      </div>
    </ToolbarButton>
  );
}
