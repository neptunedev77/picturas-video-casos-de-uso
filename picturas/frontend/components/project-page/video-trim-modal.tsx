"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProjectVideo } from "@/lib/projects";
import { useTrimProjectVideo } from "@/lib/mutations/projects";
import { useProjectInfo } from "@/providers/project-provider";
import { useSession } from "@/providers/session-provider";
import { useToast } from "@/hooks/use-toast";
import { useSearchParams } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { Scissors, Play, Pause, RotateCcw, Check, Clock } from "lucide-react";

interface VideoTrimModalProps {
  video: ProjectVideo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VideoTrimModal({
  video,
  open,
  onOpenChange,
}: VideoTrimModalProps) {
  const searchParams = useSearchParams();
  const videoRef = useRef<HTMLVideoElement>(null);
  const { toast } = useToast();

  const { _id: pid, version } = useProjectInfo();
  const session = useSession();
  const ownerId = searchParams.get("owner") ?? session.user._id;
  const shareId = searchParams.get("share") ?? undefined;

  const trimMutation = useTrimProjectVideo(
    session.user._id,
    pid as string,
    session.token,
    ownerId,
    shareId
  );

  const [duration, setDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  const [startTime, setStartTime] = useState<number>(0);
  const [endTime, setEndTime] = useState<number>(0);
  const [customName, setCustomName] = useState<string>("");

  useEffect(() => {
    if (open && video) {
      setIsPlaying(false);
      setCurrentTime(0);
      setStartTime(0);
      setEndTime(0);
      const baseName = video.name.replace(/\.[^/.]+$/, "");
      setCustomName(`${baseName}_recorte.mp4`);
    }
  }, [open, video]);

  if (!video) return null;

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const d = videoRef.current.duration;
      setDuration(d);
      setStartTime(0);
      setEndTime(Math.min(d, Math.max(d, 5)));
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const cur = videoRef.current.currentTime;
      setCurrentTime(cur);

      // Loop preview between startTime and endTime when playing in trim mode
      if (cur >= endTime && isPlaying) {
        videoRef.current.pause();
        videoRef.current.currentTime = startTime;
        setIsPlaying(false);
      }
    }
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      if (videoRef.current.currentTime < startTime || videoRef.current.currentTime >= endTime) {
        videoRef.current.currentTime = startTime;
      }
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  const previewSegment = () => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = startTime;
    videoRef.current.play();
    setIsPlaying(true);
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) return "00:00.0";
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(1);
    return `${mins.toString().padStart(2, "0")}:${secs.padStart(4, "0")}`;
  };

  const handleApplyTrim = () => {
    const clipDuration = endTime - startTime;
    if (clipDuration < 1.0) {
      toast({
        title: "Intervalo inválido",
        description: "O recorte de vídeo deve ter pelo menos 1.0 segundo de duração.",
        variant: "destructive",
      });
      return;
    }

    trimMutation.mutate(
      {
        videoId: video.videoId || video._id,
        startTime: parseFloat(startTime.toFixed(2)),
        endTime: parseFloat(endTime.toFixed(2)),
        newName: customName.trim() || undefined,
        projectVersion: version,
      },
      {
        onSuccess: () => {
          toast({
            title: "Vídeo recortado com sucesso!",
            description: `O novo vídeo "${customName}" foi adicionado ao projeto.`,
          });
          onOpenChange(false);
        },
        onError: (err: any) => {
          toast({
            title: "Erro ao recortar vídeo",
            description: err?.response?.data?.message || err?.message || "Ocorreu um erro no processamento do corte.",
            variant: "destructive",
          });
        },
      }
    );
  };

  const segmentLength = Math.max(0, endTime - startTime);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden bg-neutral-950 text-white border-neutral-800">
        <DialogHeader className="p-4 pb-3 border-b border-neutral-800 bg-neutral-900/60">
          <div className="flex items-center gap-2">
            <Scissors className="w-5 h-5 text-primary" />
            <DialogTitle className="text-base font-semibold truncate text-white">
              Recortar Vídeo: {video.name}
            </DialogTitle>
          </div>
        </DialogHeader>

        {/* Video Player */}
        <div className="relative aspect-video w-full bg-black flex items-center justify-center">
          <video
            ref={videoRef}
            src={video.url}
            className="size-full object-contain cursor-pointer"
            onClick={togglePlay}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            playsInline
          />

          {!isPlaying && (
            <button
              onClick={togglePlay}
              className="absolute inset-0 m-auto size-14 rounded-full bg-primary/80 hover:bg-primary text-primary-foreground flex items-center justify-center transition-transform hover:scale-110 shadow-lg shadow-black/50"
            >
              <Play className="w-7 h-7 ml-0.5" />
            </button>
          )}
        </div>

        {/* Trim Controls */}
        <div className="p-4 bg-neutral-900/90 flex flex-col gap-4 border-t border-neutral-800">
          {/* Timeline visualization */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center text-xs text-neutral-400">
              <span className="flex items-center gap-1 font-mono">
                <Clock className="w-3.5 h-3.5 text-primary" />
                Cursor: {formatTime(currentTime)}
              </span>
              <span className="font-mono">
                Duração do corte: <strong className="text-primary">{segmentLength.toFixed(1)}s</strong> (Total: {formatTime(duration)})
              </span>
            </div>

            {/* Range controls */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-1 bg-neutral-950/70 p-3 rounded-lg border border-neutral-800/80">
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-neutral-400">Início (Start)</span>
                  <span className="font-mono text-primary font-semibold">{formatTime(startTime)}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={duration || 100}
                  step={0.1}
                  value={startTime}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    const safeVal = Math.min(val, endTime - 1.0);
                    setStartTime(safeVal >= 0 ? safeVal : 0);
                    if (videoRef.current) {
                      videoRef.current.currentTime = safeVal >= 0 ? safeVal : 0;
                    }
                  }}
                  className="w-full h-2 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-primary"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-neutral-400">Fim (End)</span>
                  <span className="font-mono text-primary font-semibold">{formatTime(endTime)}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={duration || 100}
                  step={0.1}
                  value={endTime}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    const safeVal = Math.max(val, startTime + 1.0);
                    setEndTime(safeVal <= duration ? safeVal : duration);
                    if (videoRef.current) {
                      videoRef.current.currentTime = safeVal <= duration ? safeVal : duration;
                    }
                  }}
                  className="w-full h-2 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-primary"
                />
              </div>
            </div>
          </div>

          {/* New video name input */}
          <div className="space-y-1.5">
            <Label htmlFor="trim-video-name" className="text-xs text-neutral-300">
              Nome do Novo Ficheiro
            </Label>
            <Input
              id="trim-video-name"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="ex: video_recorte.mp4"
              className="bg-neutral-950 border-neutral-800 text-white text-xs h-9"
            />
          </div>

          {/* Action buttons footer */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-neutral-800/80">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={previewSegment}
              className="text-white border-neutral-700 hover:bg-neutral-800 flex items-center gap-1.5"
            >
              <Play className="w-3.5 h-3.5 text-primary" />
              Pre-visualizar Corte
            </Button>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
                className="text-neutral-400 hover:text-white hover:bg-neutral-800"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleApplyTrim}
                disabled={trimMutation.isPending || segmentLength < 1.0}
                className="bg-primary hover:bg-primary/90 text-primary-foreground flex items-center gap-1.5 font-medium"
              >
                {trimMutation.isPending ? (
                  <>
                    <div className="size-3.5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                    A processar corte...
                  </>
                ) : (
                  <>
                    <Scissors className="w-3.5 h-3.5" />
                    Guardar Recorte
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
