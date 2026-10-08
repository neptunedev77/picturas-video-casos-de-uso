"use client";

import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Film, Play, Trash, Download, Scissors, Camera } from "lucide-react";
import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { VideoTrimModal } from "./video-trim-modal";
import { VideoCaptureFrameModal } from "./video-capture-frame-modal";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useDeleteProjectVideo } from "@/lib/mutations/projects";
import { useProjectInfo } from "@/providers/project-provider";
import { useSession } from "@/providers/session-provider";
import { useToast } from "@/hooks/use-toast";
import type { ProjectVideo } from "@/lib/projects";
import { useSearchParams } from "next/navigation";

interface VideoCardProps {
  video: ProjectVideo;
  onPlay: (video: ProjectVideo) => void;
}

export function ProjectVideoCard({ video, onPlay }: VideoCardProps) {
  const searchParams = useSearchParams();
  const [deleteOpen, setDeleteOpen] = useState<boolean>(false);
  const [trimOpen, setTrimOpen] = useState<boolean>(false);
  const [captureFrameOpen, setCaptureFrameOpen] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const { _id: pid, version } = useProjectInfo();
  const session = useSession();
  const ownerId = searchParams.get("owner") ?? session.user._id;
  const shareId = searchParams.get("share") ?? undefined;

  const deleteVideo = useDeleteProjectVideo(
    session.user._id,
    pid as string,
    session.token,
    ownerId,
    shareId,
  );
  const { toast } = useToast();

  const handleMouseEnter = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {});
    }
  };

  const handleMouseLeave = () => {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0.1;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes) return "";
    const mb = bytes / (1024 * 1024);
    if (mb < 1) {
      return `${(bytes / 1024).toFixed(0)} KB`;
    }
    return `${mb.toFixed(1)} MB`;
  };

  const handleDelete = () => {
    deleteVideo.mutate(
      {
        videoId: video.videoId || video._id,
        projectVersion: version,
      },
      {
        onSuccess: () => {
          toast({
            title: "Vídeo removido com sucesso.",
          });
          setDeleteOpen(false);
        },
        onError: () => {
          toast({
            title: "Erro ao remover vídeo.",
            variant: "destructive",
          });
        },
      }
    );
  };

  return (
    <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
      <ContextMenu>
        <ContextMenuTrigger>
          <Card
            onClick={() => onPlay(video)}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            className="group relative overflow-hidden size-full aspect-square cursor-pointer border border-neutral-800 bg-neutral-900/80 hover:border-primary/50 transition-all hover:shadow-lg hover:shadow-primary/5 flex flex-col items-center justify-center p-3 text-center"
          >
            {/* Background / Video representation */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/10 z-10" />

            {/* Subtle background placeholder icon */}
            <div className="absolute inset-0 flex items-center justify-center opacity-10">
              <Film className="w-24 h-24 text-white" />
            </div>

            {/* Video preview / Poster if available, or icon */}
            {video.url ? (
              <video
                ref={videoRef}
                src={`${video.url}#t=0.1`}
                className="absolute inset-0 size-full object-cover opacity-60 group-hover:opacity-90 group-hover:scale-105 transition-all duration-300"
                preload="metadata"
                muted
                loop
                playsInline
              />
            ) : null}

            {/* Bottom info banner */}
            <div className="absolute bottom-0 inset-x-0 p-2.5 z-20 flex flex-col gap-0.5 text-left bg-gradient-to-t from-black via-black/80 to-transparent">
              <div className="flex items-center gap-1.5">
                <Film className="w-3.5 h-3.5 text-primary shrink-0" />
                <p className="text-xs font-medium text-white truncate w-full" title={video.name}>
                  {video.name}
                </p>
              </div>
              <div className="flex items-center justify-between text-[10px] text-neutral-400">
                <span>{video.mimeType?.replace("video/", "").toUpperCase() || "VIDEO"}</span>
                <span>{formatFileSize(video.size)}</span>
              </div>
            </div>

            {/* Video Badge */}
            <div className="absolute top-2 left-2 z-20 bg-black/70 backdrop-blur-md px-1.5 py-0.5 rounded text-[10px] font-semibold text-primary uppercase tracking-wider border border-white/10">
              Vídeo
            </div>
          </Card>
        </ContextMenuTrigger>

        <ContextMenuContent>
          <ContextMenuItem onClick={() => onPlay(video)}>
            <Play className="w-4 h-4 mr-2" /> Reproduzir
          </ContextMenuItem>
          <ContextMenuItem onClick={() => setCaptureFrameOpen(true)}>
            <Camera className="w-4 h-4 mr-2 text-primary" /> Capturar Frame
          </ContextMenuItem>
          <ContextMenuItem onClick={() => setTrimOpen(true)}>
            <Scissors className="w-4 h-4 mr-2 text-primary" /> Recortar Vídeo
          </ContextMenuItem>
          <ContextMenuItem asChild>
            <a href={video.url} download={video.name} target="_blank" rel="noreferrer">
              <Download className="w-4 h-4 mr-2" /> Download
            </a>
          </ContextMenuItem>
          <DialogTrigger asChild>
            <ContextMenuItem className="text-destructive focus:text-destructive">
              <Trash className="w-4 h-4 mr-2" /> Eliminar
            </ContextMenuItem>
          </DialogTrigger>
        </ContextMenuContent>
      </ContextMenu>

      <VideoTrimModal
        video={video}
        open={trimOpen}
        onOpenChange={setTrimOpen}
      />

      <VideoCaptureFrameModal
        video={video}
        open={captureFrameOpen}
        onOpenChange={setCaptureFrameOpen}
      />

      {/* Delete confirmation modal */}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Eliminar Vídeo</DialogTitle>
          <DialogDescription>
            Tens a certeza de que pretendes eliminar o vídeo &quot;{video.name}&quot;? Esta ação não pode ser revertida.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={() => setDeleteOpen(false)}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={deleteVideo.isPending}>
            {deleteVideo.isPending ? "A eliminar..." : "Eliminar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
