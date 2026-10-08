"use client";

import { useToast } from "@/hooks/use-toast";
import React, { useState } from "react";
import Dropzone from "react-dropzone";

interface CustomDropzoneProps {
  onDrop: (acceptedFiles: File[]) => void;
  children?: React.ReactNode;
}

export default function AppDropzone({ onDrop, children }: CustomDropzoneProps) {
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const { toast } = useToast();

  return (
    <div className="h-full w-full flex flex-col">
      <Dropzone
        onDrop={onDrop}
        onDragEnter={() => setIsDragging(true)}
        onDragLeave={() => setIsDragging(false)}
        onDropAccepted={() => setIsDragging(false)}
        onDropRejected={() => {
          setIsDragging(false);
          toast({
            title: "Ficheiro não suportado",
            description: "Por favor, carrega imagens (.png, .jpg, .jfif, .webp, .heic), vídeos (.mp4, .webm) ou ficheiros .zip.",
            variant: "destructive",
          });
        }}
        accept={{
          "image/*": [".png", ".jpg", ".jpeg", ".jfif", ".webp", ".heic", ".heif"],
          "video/*": [".mp4", ".webm", ".mov", ".mkv"],
          "application/zip": [".zip"],
        }}
      >
        {({ getRootProps, getInputProps }) => (
          <div
            {...getRootProps()}
            className={`flex h-full w-full cursor-pointer items-center justify-center rounded-xl border-2 border-dashed ${
              isDragging
                ? "border-primary bg-primary/10 text-primary"
                : "border-neutral-400 hover:bg-sidebar text-neutral-400"
            } p-4 text-center transition-colors`}
          >
            <input {...getInputProps()} />
            {children}
          </div>
        )}
      </Dropzone>
    </div>
  );
}
