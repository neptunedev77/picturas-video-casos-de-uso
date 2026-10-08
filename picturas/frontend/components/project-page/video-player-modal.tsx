"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ProjectVideo } from "@/lib/projects";
import { useState, useRef, useEffect } from "react";
import { Play, Pause, Volume2, VolumeX, Maximize, Film, Scissors, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VideoTrimModal } from "./video-trim-modal";
import { VideoCaptureFrameModal } from "./video-capture-frame-modal";

interface VideoPlayerModalProps {
  video: ProjectVideo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VideoPlayerModal({
  video,
  open,
  onOpenChange,
}: VideoPlayerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasError, setHasError] = useState<boolean>(false);
  const [trimOpen, setTrimOpen] = useState<boolean>(false);
  const [captureFrameOpen, setCaptureFrameOpen] = useState<boolean>(false);

  useEffect(() => {
    if (open) {
      setIsPlaying(false);
      setCurrentTime(0);
      setIsLoading(true);
      setHasError(false);
    }
  }, [open, video]);

  if (!video) return null;

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
      setIsLoading(false);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.volume = val;
      setVolume(val);
      setIsMuted(val === 0);
    }
  };

  const toggleFullscreen = () => {
    if (!videoRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      videoRef.current.requestFullscreen();
    }
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl p-0 overflow-hidden bg-black/95 text-white border-neutral-800">
        <DialogHeader className="p-4 pb-2 border-b border-neutral-800 bg-neutral-900/60">
          <div className="flex items-center gap-2">
            <Film className="w-5 h-5 text-primary" />
            <DialogTitle className="text-base font-semibold truncate text-white">
              {video.name}
            </DialogTitle>
          </div>
        </DialogHeader>

        <div className="relative aspect-video w-full bg-black flex items-center justify-center">
          {hasError ? (
            <div className="text-center p-6 text-red-400">
              <p className="font-semibold">Erro ao carregar o vídeo.</p>
              <p className="text-xs text-neutral-400 mt-1">
                Verifique se o formato é suportado e se o ficheiro está acessível.
              </p>
            </div>
          ) : (
            <video
              ref={videoRef}
              src={video.url}
              className="size-full object-contain cursor-pointer"
              onClick={togglePlay}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onWaiting={() => setIsLoading(true)}
              onPlaying={() => {
                setIsLoading(false);
                setIsPlaying(true);
              }}
              onPause={() => setIsPlaying(false)}
              onError={() => {
                setIsLoading(false);
                setHasError(true);
              }}
              playsInline
              preload="metadata"
            />
          )}

          {/* Overlay Play icon when paused */}
          {!isPlaying && !isLoading && !hasError && (
            <button
              onClick={togglePlay}
              className="absolute inset-0 m-auto size-16 rounded-full bg-primary/80 hover:bg-primary text-primary-foreground flex items-center justify-center transition-transform hover:scale-110 shadow-lg shadow-black/50"
            >
              <Play className="w-8 h-8 ml-1" />
            </button>
          )}

          {/* Loading spinner */}
          {isLoading && !hasError && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <div className="size-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* Custom Controls Bar */}
        <div className="p-4 bg-neutral-900/90 flex flex-col gap-2 border-t border-neutral-800">
          {/* Progress / Seek bar */}
          <div className="flex items-center gap-3 w-full">
            <span className="text-xs text-neutral-400 w-10 text-right">
              {formatTime(currentTime)}
            </span>
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.1}
              value={currentTime}
              onChange={handleSeek}
              className="flex-1 h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-primary"
            />
            <span className="text-xs text-neutral-400 w-10">
              {formatTime(duration)}
            </span>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={togglePlay}
                className="text-white hover:bg-neutral-800"
              >
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              </Button>

              <div className="flex items-center gap-1.5 ml-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleMute}
                  className="text-white hover:bg-neutral-800 p-1.5"
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="w-4 h-4 text-neutral-400" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                </Button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-16 h-1 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-primary"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (videoRef.current) videoRef.current.pause();
                  setIsPlaying(false);
                  setCaptureFrameOpen(true);
                }}
                className="text-xs text-white border-neutral-700 hover:bg-neutral-800 flex items-center gap-1.5 h-8 px-2.5"
              >
                <Camera className="w-3.5 h-3.5 text-primary" />
                Capturar Frame
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (videoRef.current) videoRef.current.pause();
                  setIsPlaying(false);
                  setTrimOpen(true);
                }}
                className="text-xs text-white border-neutral-700 hover:bg-neutral-800 flex items-center gap-1.5 h-8 px-2.5"
              >
                <Scissors className="w-3.5 h-3.5 text-primary" />
                Recortar
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleFullscreen}
                className="text-white hover:bg-neutral-800 p-1.5"
              >
                <Maximize className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>

      <VideoTrimModal
        video={video}
        open={trimOpen}
        onOpenChange={setTrimOpen}
      />

      <VideoCaptureFrameModal
        video={video}
        initialTime={currentTime}
        open={captureFrameOpen}
        onOpenChange={setCaptureFrameOpen}
      />
    </Dialog>
  );
}
