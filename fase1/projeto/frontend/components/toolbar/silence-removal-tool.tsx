"use client";

// UC-VID-001: botão "Remover silêncios" na barra de ferramentas de vídeo (por baixo do blur).
// Ao contrário das ferramentas da pipeline, abre um ecrã próprio: analisar -> rever -> aplicar.
import { useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AudioWaveform } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSession } from "@/providers/session-provider";
import {
  useCanEditProject,
  useCurrentImage,
  useProjectInfo,
} from "@/providers/project-provider";
import { useUpdateSession } from "@/lib/mutations/session";
import { SilenceRemovalPanel } from "@/components/silence/silence-removal-dialog";

export default function SilenceRemovalTool({ disabled }: { disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const session = useSession();
  const project = useProjectInfo();
  const currentImage = useCurrentImage();
  const canEdit = useCanEditProject();
  const searchParams = useSearchParams();
  const updateSession = useUpdateSession();

  const ownerId = searchParams.get("owner") ?? session.user._id;
  const shareId = searchParams.get("share") ?? undefined;
  const anonymous = session.user.type === "anonymous";
  const uiDisabled = disabled || !canEdit || anonymous || !currentImage;

  const label = anonymous
    ? "Remover silêncios (disponível para utilizadores registados)"
    : !canEdit
      ? "Remover silêncios (sem permissão de edição)"
      : "Remover silêncios e pausas";

  const refreshOperations = useCallback(() => {
    updateSession.mutate({ userId: session.user._id, token: session.token });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.user._id, session.token]);

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <div>
            <Button
              variant="outline"
              className="size-8"
              disabled={uiDisabled}
              onClick={() => setOpen(true)}
              data-testid="silence-removal-button"
            >
              <AudioWaveform className="h-3.5 w-3.5" />
              <span className="sr-only">{label}</span>
            </Button>
          </div>
        </TooltipTrigger>
        <TooltipContent className="ml-2 bg-indigo-500" side="right">
          {label}
        </TooltipContent>
      </Tooltip>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl w-[95vw] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AudioWaveform className="h-4 w-4" /> Remover silêncios e pausas
            </DialogTitle>
            <DialogDescription>
              Analise o áudio, reveja os troços a remover e gere um novo vídeo mais curto. O original não é alterado.
            </DialogDescription>
          </DialogHeader>
          {currentImage && (
            <SilenceRemovalPanel
              key={currentImage._id}
              open={open}
              target={{
                uid: session.user._id,
                pid: project._id,
                imgId: currentImage._id,
                token: session.token,
                ownerId,
                shareId,
              }}
              videoUrl={currentImage.url}
              videoName={currentImage.name}
              userType={session.user.type}
              remainingOperations={session.user.remaining_operations}
              onOperationsChanged={refreshOperations}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
