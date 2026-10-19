"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Captions } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSession } from "@/providers/session-provider";
import {
  useCanEditProject,
  useCurrentImage,
  useProjectInfo,
} from "@/providers/project-provider";
import { SubtitleGenerationPanel } from "@/components/subtitles/subtitle-generation-dialog";

export default function SubtitleGenerationTool({
  disabled,
}: {
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const session = useSession();
  const project = useProjectInfo();
  const currentImage = useCurrentImage();
  const canEdit = useCanEditProject();
  const searchParams = useSearchParams();
  const ownerId =
    searchParams.get("owner") ?? project.user_id ?? session.user._id;
  const shareId = searchParams.get("share") ?? undefined;
  const registered = session.user.type !== "anonymous";
  const label = !registered
    ? "Gerar legendas (disponível para utilizadores registados)"
    : !canEdit
      ? "Gerar legendas (sem permissão de edição)"
      : "Gerar legendas";

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <div>
            <Button
              variant="outline"
              className="size-8"
              disabled={disabled || !registered || !canEdit || !currentImage}
              onClick={() => setOpen(true)}
              data-testid="subtitle-generation-button"
            >
              <Captions className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="sr-only">{label}</span>
            </Button>
          </div>
        </TooltipTrigger>
        <TooltipContent className="ml-2 bg-indigo-500" side="right">
          {label}
        </TooltipContent>
      </Tooltip>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[95vw] max-w-3xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Captions className="h-4 w-4" aria-hidden="true" /> Gerar legendas
            </DialogTitle>
            <DialogDescription>
              Escolha o idioma, reveja a transcrição e confirme para gerar o
              ficheiro SRT.
            </DialogDescription>
          </DialogHeader>
          {currentImage && registered && canEdit && (
            <SubtitleGenerationPanel
              key={`${session.user._id}-${ownerId}-${project._id}-${currentImage._id}-${shareId || ""}`}
              open={open}
              videoName={currentImage.name}
              videoUrl={currentImage.url}
              target={{
                uid: session.user._id,
                pid: project._id,
                imgId: currentImage._id,
                token: session.token,
                ownerId,
                shareId,
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
