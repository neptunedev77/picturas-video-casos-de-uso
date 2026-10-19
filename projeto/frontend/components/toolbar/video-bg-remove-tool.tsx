"use client";

import { useState, useEffect } from "react";
import { UserCheck, Sparkles, Clock, AlertTriangle } from "lucide-react";
import { ToolbarButton } from "./toolbar-button";
import { VideoBgMode, VideoBgRemoveParams, TimeInterval } from "@/lib/tool-types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useCurrentImage } from "@/providers/project-provider";

export default function VideoBgRemoveTool({ disabled }: { disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const currentImage = useCurrentImage();

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
      const domVideo = document.querySelector("video") as HTMLVideoElement | null;
      if (domVideo && domVideo.duration && !isNaN(domVideo.duration) && isFinite(domVideo.duration)) {
        setVideoDuration(domVideo.duration);
        return;
      }

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

  const [bgMode, setBgMode] = useState<VideoBgMode>("green_screen");
  const [solidColor, setSolidColor] = useState<string>("#00FF00");
  const [blurIntensity, setBlurIntensity] = useState<number>(25);

  const [useAllVideo, setUseAllVideo] = useState(true);
  const [intervalStart, setIntervalStart] = useState<number>(0);
  const [intervalEnd, setIntervalEnd] = useState<number>(10);

  const isDurationExceeded =
    !useAllVideo &&
    videoDuration !== null &&
    (intervalStart > videoDuration || intervalEnd > videoDuration);

  const intervals: TimeInterval[] | undefined = !useAllVideo
    ? [
        {
          start: Math.max(0, intervalStart),
          end: videoDuration ? Math.min(intervalEnd, videoDuration) : intervalEnd,
        },
      ]
    : undefined;

  const toolParams: VideoBgRemoveParams = {
    bgMode,
    solidColor: bgMode === "solid" ? solidColor : "#00FF00",
    blurIntensity: bgMode === "bokeh" ? blurIntensity : undefined,
    timeIntervals: intervals,
  };

  return (
    <ToolbarButton
      icon={UserCheck}
      label="Remover Fundo (IA)"
      disabled={disabled}
      isPremium={false}
      open={open}
      setOpen={setOpen}
      noPreview={true}
      contentClassName="!w-auto !min-w-[340px] max-w-sm p-3"
      tool={{
        procedure: "video_bg_remove",
        params: toolParams,
      }}
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 border-b border-border/50 pb-2">
          <Sparkles className="size-4 text-emerald-500" />
          <span className="text-sm font-semibold">Remover Fundo de Vídeo (IA)</span>
        </div>

        {/* Modo de Substituição de Fundo */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium">Modo de Fundo:</label>
          <div className="grid grid-cols-3 gap-1.5">
            <Button
              type="button"
              size="sm"
              variant={bgMode === "green_screen" ? "default" : "outline"}
              onClick={() => setBgMode("green_screen")}
              className={`h-8 text-xs ${bgMode === "green_screen" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""}`}
            >
              Chroma Key
            </Button>
            <Button
              type="button"
              size="sm"
              variant={bgMode === "solid" ? "default" : "outline"}
              onClick={() => setBgMode("solid")}
              className="h-8 text-xs"
            >
              Cor Sólida
            </Button>
            <Button
              type="button"
              size="sm"
              variant={bgMode === "bokeh" ? "default" : "outline"}
              onClick={() => setBgMode("bokeh")}
              className="h-8 text-xs"
            >
              Desfocagem
            </Button>
          </div>
        </div>

        {/* Configuração de Cor Sólida */}
        {bgMode === "solid" && (
          <div className="flex items-center justify-between rounded-md border p-2 text-xs">
            <span>Cor de Substituição:</span>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={solidColor}
                onChange={(e) => setSolidColor(e.target.value)}
                className="size-6 cursor-pointer rounded border p-0"
              />
              <span className="font-mono uppercase">{solidColor}</span>
            </div>
          </div>
        )}

        {/* Configuração de Desfocagem Bokeh */}
        {bgMode === "bokeh" && (
          <div className="flex flex-col gap-1.5 rounded-md border p-2 text-xs">
            <div className="flex justify-between">
              <span>Intensidade Bokeh:</span>
              <span className="font-semibold text-emerald-500">{blurIntensity}px</span>
            </div>
            <Slider
              value={[blurIntensity]}
              min={11}
              max={51}
              step={2}
              onValueChange={(val) => setBlurIntensity(val[0])}
            />
          </div>
        )}

        {/* Âmbito Temporal */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium">Intervalo de Aplicação:</label>
          <div className="flex gap-1.5">
            <Button
              type="button"
              size="sm"
              variant={useAllVideo ? "default" : "outline"}
              onClick={() => setUseAllVideo(true)}
              className="h-7 text-xs flex-1"
            >
              Vídeo Completo
            </Button>
            <Button
              type="button"
              size="sm"
              variant={!useAllVideo ? "default" : "outline"}
              onClick={() => setUseAllVideo(false)}
              className="h-7 text-xs flex-1"
            >
              Definir Segundos
            </Button>
          </div>

          {!useAllVideo && (
            <div className="mt-1 flex flex-col gap-1.5 rounded-md border p-2 text-xs">
              <div className="flex items-center gap-1.5">
                <Clock className="size-3.5 text-muted-foreground" />
                <span>De:</span>
                <Input
                  type="number"
                  min={0}
                  value={intervalStart}
                  onChange={(e) => setIntervalStart(parseFloat(e.target.value) || 0)}
                  className="h-7 w-16 text-center font-mono text-xs"
                />
                <span>s até:</span>
                <Input
                  type="number"
                  min={0}
                  value={intervalEnd}
                  onChange={(e) => setIntervalEnd(parseFloat(e.target.value) || 0)}
                  className="h-7 w-16 text-center font-mono text-xs"
                />
                <span>s</span>
              </div>

              {isDurationExceeded && videoDuration && (
                <div className="flex items-center gap-1 text-[11px] text-amber-500">
                  <AlertTriangle className="size-3" />
                  <span>Excede a duração ({videoDuration.toFixed(1)}s).</span>
                  <button
                    type="button"
                    onClick={() => setIntervalEnd(Math.floor(videoDuration))}
                    className="underline hover:text-amber-400"
                  >
                    Ajustar
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="text-[10px] text-muted-foreground pt-1 border-t border-border/40">
          * Segmentação neural com MediaPipe e áudio sincronizado.
        </div>
      </div>
    </ToolbarButton>
  );
}
