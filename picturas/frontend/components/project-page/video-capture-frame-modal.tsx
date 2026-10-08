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
import { useCaptureProjectVideoFrame } from "@/lib/mutations/projects";
import { useProjectInfo } from "@/providers/project-provider";
import { useSession } from "@/providers/session-provider";
import { useToast } from "@/hooks/use-toast";
import { useSearchParams } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { Camera, Play, Pause, Clock, Sparkles } from "lucide-react";

interface VideoCaptureFrameModalProps {
  video: ProjectVideo | null;
  initialTime?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VideoCaptureFrameModal({
  video,
  initialTime = 0,
  open,
  onOpenChange,
}: VideoCaptureFrameModalProps) {
  const searchParams = useSearchParams();
  const videoRef = useRef<HTMLVideoElement>(null);
  const { toast } = useToast();

  const { _id: pid, version } = useProjectInfo();
  const session = useSession();
  const ownerId = searchParams.get("owner") ?? session.user._id;
  const shareId = searchParams.get("share") ?? undefined;

  const captureMutation = useCaptureProjectVideoFrame(
    session.user._id,
    pid as string,
    session.token,
    ownerId,
    shareId
  );

  const [duration, setDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(initialTime);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [customName, setCustomName] = useState<string>("");

  useEffect(() => {
    if (open && video) {
      setIsPlaying(false);
      const startT = initialTime > 0 ? initialTime : 0;
      setCurrentTime(startT);
      const baseName = video.name.replace(/\.[^/.]+$/, "");
      setCustomName(`${baseName}_frame_${startT.toFixed(1)}s.png`);
    }
  }, [open, video, initialTime]);

  if (!video) return null;

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const d = videoRef.current.duration;
      setDuration(d);
      if (initialTime > 0 && initialTime <= d) {
        videoRef.current.currentTime = initialTime;
      }
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
      updateSuggestedName(videoRef.current.currentTime);
    } else {
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleSeek = (time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
      updateSuggestedName(time);
    }
  };

  const updateSuggestedName = (time: number) => {
    const baseName = video.name.replace(/\.[^/.]+$/, "");
    setCustomName(`${baseName}_frame_${time.toFixed(1)}s.png`);
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) return "00:00.0";
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(1);
    return `${mins.toString().padStart(2, "0")}:${secs.padStart(4, "0")}`;
  };

  const handleCaptureFrame = () => {
    captureMutation.mutate(
      {
        videoId: video.videoId || video._id,
        timestamp: parseFloat(currentTime.toFixed(2)),
        newName: customName.trim() || undefined,
        projectVersion: version,
      },
      {
        onSuccess: (res: any) => {
          toast({
            title: "Fotograma capturado com sucesso!",
            description: `A imagem "${res?.name || customName}" foi adicionada à galeria e está pronta para edição.`,
          });
          onOpenChange(false);
        },
        onError: (err: any) => {
          toast({
            title: "Erro ao capturar fotograma",
            description: err?.response?.data?.message || err?.message || "Ocorreu um erro no processamento da imagem.",
            variant: "destructive",
          });
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden bg-neutral-950 text-white border-neutral-800">
        <DialogHeader className="p-4 pb-3 border-b border-neutral-800 bg-neutral-900/60">
          <div className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-primary" />
            <DialogTitle className="text-base font-semibold truncate text-white">
              Capturar Fotograma: {video.name}
            </DialogTitle>
          </div>
        </DialogHeader>

        {/* Video Player / Freeze frame */}
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

        {/* Controls */}
        <div className="p-4 bg-neutral-900/90 flex flex-col gap-4 border-t border-neutral-800">
          {/* Frame selection slider */}
          <div className="space-y-1.5 bg-neutral-950/70 p-3 rounded-lg border border-neutral-800/80">
            <div className="flex justify-between items-center text-xs">
              <span className="flex items-center gap-1 text-neutral-400 font-mono">
                <Clock className="w-3.5 h-3.5 text-primary" />
                Instante selecionado:
              </span>
              <span className="font-mono text-primary font-bold text-sm">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>

            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.05}
              value={currentTime}
              onChange={(e) => handleSeek(parseFloat(e.target.value))}
              className="w-full h-2 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-primary"
            />
          </div>

          {/* Image name input */}
          <div className="space-y-1.5">
            <Label htmlFor="capture-frame-name" className="text-xs text-neutral-300">
              Nome da Imagem a Gerar (adicionada à galeria do projeto)
            </Label>
            <Input
              id="capture-frame-name"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="ex: fotograma_cena.png"
              className="bg-neutral-950 border-neutral-800 text-white text-xs h-9"
            />
          </div>

          {/* Action buttons footer */}
          <div className="flex items-center justify-between pt-2 border-t border-neutral-800/80">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={togglePlay}
              className="text-white border-neutral-700 hover:bg-neutral-800 flex items-center gap-1.5"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              {isPlaying ? "Pausar" : "Reproduzir"}
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
                onClick={handleCaptureFrame}
                disabled={captureMutation.isPending}
                className="bg-primary hover:bg-primary/90 text-primary-foreground flex items-center gap-1.5 font-medium"
              >
                {captureMutation.isPending ? (
                  <>
                    <div className="size-3.5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                    A extrair fotograma...
                  </>
                ) : (
                  <>
                    <Camera className="w-3.5 h-3.5" />
                    Extrair como Imagem
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
