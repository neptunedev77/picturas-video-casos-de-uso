"use client";

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, LoaderCircle, AlertCircle, FileImage } from "lucide-react";

interface ConversionAssistantDialogProps {
  isOpen: boolean;
  file: File | null;
  isConverting: boolean;
  onConvert: () => void;
  onCancel: () => void;
}

export default function ConversionAssistantDialog({
  isOpen,
  file,
  isConverting,
  onConvert,
  onCancel,
}: ConversionAssistantDialogProps) {
  if (!file) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !isConverting) onCancel(); }}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary mb-1">
            <Sparkles className="w-5 h-5 text-amber-500 animate-pulse" />
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              Assistente de Compatibilidade
            </span>
          </div>
          <DialogTitle className="text-lg font-bold">
            Formato Apple HEIC detetado
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground pt-1">
            A maioria dos navegadores web não consegue exibir fotos no formato <span className="font-semibold text-foreground">.HEIC</span> diretamente.
          </DialogDescription>
        </DialogHeader>

        <div className="p-3.5 my-2 rounded-lg border bg-muted/40 flex items-center gap-3">
          <div className="p-2.5 rounded-md bg-background border text-primary">
            <FileImage className="w-6 h-6 text-primary" />
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-sm font-medium truncate text-foreground">
              {file.name}
            </span>
            <span className="text-xs text-muted-foreground">
              {(file.size / (1024 * 1024)).toFixed(2)} MB &bull; Requer conversão para JPEG
            </span>
          </div>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          Desejas que o PictuRAS converta automaticamente esta fotografia para <strong>JPEG de alta fidelidade (92%)</strong> em memória? Poderás visualizá-la e editá-la imediatamente no projeto.
        </p>

        <DialogFooter className="gap-2 sm:gap-0 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isConverting}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={onConvert}
            disabled={isConverting}
            className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {isConverting ? (
              <>
                <LoaderCircle className="w-4 h-4 animate-spin" />
                <span>A converter foto...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Converter para JPEG</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
