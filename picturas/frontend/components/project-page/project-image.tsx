import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Download, Trash, Image as ImageIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import Image from "next/image";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useDeleteProjectImages,
  useDownloadProjectImage,
} from "@/lib/mutations/projects";
import { useProjectInfo } from "@/providers/project-provider";
import { useSession } from "@/providers/session-provider";
import { useToast } from "@/hooks/use-toast";
import type { ProjectImage } from "@/lib/projects";
import { useSearchParams } from "next/navigation";
import { getErrorMessage } from "@/lib/error-messages";

interface ImageItemProps {
  image: ProjectImage;
  animation?: boolean;
}

export function ProjectImage({ image, animation = true }: ImageItemProps) {
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode") ?? "edit";

  const [loaded, setLoaded] = useState<boolean>(false);
  const [open, setOpen] = useState<boolean>(false);

  const { _id: pid, version } = useProjectInfo();
  const session = useSession();
  const ownerId = searchParams.get("owner") ?? session.user._id;
  const shareId = searchParams.get("share") ?? undefined;

  const projectInfo = useProjectInfo(); // para ter version também
  const deleteImage = useDeleteProjectImages(
    session.user._id,
    pid as string,
    session.token,
    ownerId,
    shareId,
  );
  const downloadImage = useDownloadProjectImage(mode === "results");
  const { toast } = useToast();

  const isVideo = /\.(mp4|webm|mov|mkv)$/i.test(image.name);

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "";
    const mb = bytes / (1024 * 1024);
    if (mb < 1) {
      return `${(bytes / 1024).toFixed(0)} KB`;
    }
    return `${mb.toFixed(1)} MB`;
  };

  const getExtension = (name: string) => {
    const ext = name.split(".").pop();
    return ext ? ext.toUpperCase() : "IMG";
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <ContextMenu>
        <ContextMenuTrigger>
          <Card className="group relative overflow-hidden size-full aspect-square border border-neutral-800 bg-neutral-900/80">
            {/* Top-left Badge */}
            <div className="absolute top-2 left-2 z-30 bg-black/70 backdrop-blur-md px-1.5 py-0.5 rounded text-[10px] font-semibold text-primary uppercase tracking-wider border border-white/10">
              {isVideo ? "Vídeo" : "Foto"}
            </div>

            {isVideo ? (
              <div className="size-full relative flex items-center justify-center bg-neutral-900">
                <video
                  src={`${image.url}#t=0.1`}
                  className={cn(
                    "size-full object-cover opacity-80",
                    animation && "transition-all group-hover:scale-105",
                  )}
                  muted
                  playsInline
                  preload="metadata"
                />
              </div>
            ) : (
              /* Image */
              <div className="size-full relative grid z-0 grid-cols-1 grid-rows-1">
                <Image
                  src={image.url}
                  unoptimized
                  height={500}
                  width={500}
                  alt={image.name}
                  className={cn(
                    "size-full object-contain row-start-1 col-start-1 z-20",
                    animation && "transition-all group-hover:scale-105",
                  )}
                  priority
                  onLoad={() => setLoaded(true)}
                  onError={() => setLoaded(true)}
                />
                <Image
                  src={image.url}
                  unoptimized
                  width={500}
                  height={500}
                  className="object-cover row-start-1 col-start-1 size-full z-10"
                  alt={image.name + " blurred"}
                />
                <div className="row-start-1 col-start-1 backdrop-blur-sm size-full bg-black/30 z-10" />
                {!loaded && (
                  <>
                    <div className="row-start-1 col-start-1 z-30 bg-background size-full" />
                    <Skeleton className="size-full row-start-1 col-start-1 z-40" />
                  </>
                )}
              </div>
            )}

            {/* Bottom info banner */}
            <div className="absolute bottom-0 inset-x-0 p-2.5 z-30 flex flex-col gap-0.5 text-left bg-gradient-to-t from-black via-black/80 to-transparent">
              <div className="flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5 text-primary shrink-0" />
                <p className="text-xs font-medium text-white truncate w-full" title={image.name}>
                  {image.name}
                </p>
              </div>
              <div className="flex items-center justify-between text-[10px] text-neutral-400">
                <span>{getExtension(image.name)}</span>
                {image.size ? <span>{formatFileSize(image.size)}</span> : null}
              </div>
            </div>
          </Card>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <DialogTrigger asChild onClick={(e) => e.stopPropagation()}>
            {mode !== "results" && (
              <ContextMenuItem
                className="flex justify-between"
                onClick={(e) => e.stopPropagation()}
              >
                <span>Delete</span>
                <Trash className="size-4" />
              </ContextMenuItem>
            )}
          </DialogTrigger>
          <ContextMenuItem
            className="flex justify-between"
            onClick={(e) => {
              e.stopPropagation();
              downloadImage.mutate(
                {
                  imageUrl: image.url,
                  imageName: image.name,
                },
                {
                  onSuccess: () => {
                    toast({
                      title: `Image ${image.name} downloaded.`,
                    });
                  },
                  onError: (error) => {
                    const { title, description } = getErrorMessage("project-download", error);
                    toast({
                      title,
                      description,
                      variant: "destructive",
                    });
                  },
                },
              );
            }}
          >
            <span>Download</span>
            <Download className="size-4" />
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Are you sure?</DialogTitle>
          <DialogDescription>This action cannot be undone.</DialogDescription>
        </DialogHeader>
        <div className="flex justify-end">
          <Button
            variant="destructive"
            onClick={(e) => {
              deleteImage.mutate(
                {
                  imageIds: [image._id],
                  projectVersion: projectInfo.version,
                },
                {
                  onSuccess: () => {
                    toast({
                      title: `Image ${image.name} deleted successfully.`,
                    });
                  },
                  onError: (error) => {
                    const { title, description } = getErrorMessage("project-delete", error);
                    toast({
                      title,
                      description,
                      variant: "destructive",
                    });
                  },
                },
              );
              setOpen(false);
              e.stopPropagation();
            }}
          >
            Permanently Delete
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
