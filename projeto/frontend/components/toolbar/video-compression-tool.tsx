"use client";

import { useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FileVideo } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSession } from "@/providers/session-provider";
import { useCanEditProject, useCurrentImage, useProjectInfo } from "@/providers/project-provider";
import { useUpdateSession } from "@/lib/mutations/session";
import { CompressionPanel } from "@/components/compression/compression-dialog";

export default function VideoCompressionTool({ disabled }: { disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const session = useSession();
  const project = useProjectInfo();
  const currentImage = useCurrentImage();
  const searchParams = useSearchParams();
  const canEdit = useCanEditProject();
  const updateSession = useUpdateSession();
  const registered = session.user.type !== "anonymous";
  // Shared projects: an editor runs the job on the owner's project and pays the operation (RNG-05).
  const ownerId = searchParams.get("owner") ?? project.user_id ?? session.user._id;
  const shareId = searchParams.get("share") ?? undefined;
  const label = !registered ? "Compressão disponível para utilizadores registados"
    : !canEdit ? "Comprimir/otimizar vídeo (sem permissão de edição)"
      : "Comprimir/otimizar vídeo";
  const refreshOperations = useCallback(() => {
    updateSession.mutate({ userId: session.user._id, token: session.token });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.user._id, session.token]);

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <div>
            <Button variant="outline" className="size-8" disabled={disabled || !registered || !canEdit || !currentImage}
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
            <DialogDescription>Escolha a qualidade: a nova versão do vídeo é acrescentada ao projeto e pode ser descarregada. O original mantém-se inalterado.</DialogDescription>
          </DialogHeader>
          {currentImage && registered && canEdit && (
            <CompressionPanel key={`${project._id}-${currentImage._id}`} open={open} videoName={currentImage.name}
              onFinished={refreshOperations}
              target={{ uid: session.user._id, pid: project._id, imgId: currentImage._id, token: session.token, ownerId, shareId }} />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
