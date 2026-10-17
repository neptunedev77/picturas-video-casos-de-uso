"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { FileVideo } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSession } from "@/providers/session-provider";
import { useCurrentImage, useProjectInfo } from "@/providers/project-provider";
import { CompressionPanel } from "@/components/compression/compression-dialog";

export default function VideoCompressionTool({ disabled }: { disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const session = useSession();
  const project = useProjectInfo();
  const currentImage = useCurrentImage();
  const searchParams = useSearchParams();
  const registered = session.user.type !== "anonymous";
  const ownerId = project.user_id ?? searchParams.get("owner") ?? session.user._id;
  const isOwner = ownerId === session.user._id && !searchParams.get("share");
  const label = !registered ? "Compressão disponível para utilizadores registados"
    : !isOwner ? "Compressão disponível apenas para o proprietário"
      : "Comprimir/otimizar vídeo";

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <div>
            <Button variant="outline" className="size-8" disabled={disabled || !registered || !isOwner || !currentImage}
              onClick={() => setOpen(true)} data-testid="video-compression-button">
              <FileVideo className="h-3.5 w-3.5" />
              <span className="sr-only">{label}</span>
            </Button>
          </div>
        </TooltipTrigger>
        <TooltipContent className="ml-2 bg-indigo-500" side="right">{label}</TooltipContent>
      </Tooltip>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[95vw] max-w-xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FileVideo className="h-4 w-4" /> Comprimir/otimizar vídeo</DialogTitle>
            <DialogDescription>Escolha a qualidade e descarregue uma nova versão do vídeo. O original mantém-se inalterado.</DialogDescription>
          </DialogHeader>
          {currentImage && registered && isOwner && (
            <CompressionPanel key={`${project._id}-${currentImage._id}`} open={open} videoName={currentImage.name}
              target={{ uid: session.user._id, pid: project._id, imgId: currentImage._id, token: session.token }} />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
