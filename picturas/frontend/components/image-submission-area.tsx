import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import AppDropzone from "./app-dropzone";
import { FileImage, ImagePlus, Plus, Video, X } from "lucide-react";
import { useEffect, useState } from "react";
import { HoverCard, HoverCardTrigger } from "./ui/hover-card";
import { HoverCardContent } from "@radix-ui/react-hover-card";
import ImagePreview from "./image-preview";
import { extractZipImages } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import ConversionAssistantDialog from "./conversion-assistant-dialog";

export default function ImageSubmissionArea({
  receivedFiles = [],
  onDrop,
}: {
  receivedFiles?: File[];
  onDrop: (files: File[]) => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [pendingHeicFile, setPendingHeicFile] = useState<File | null>(null);
  const [isConverting, setIsConverting] = useState<boolean>(false);
  const { toast } = useToast();

  const addCompatibleFiles = (newFiles: File[]) => {
    setFiles((prevFiles) => {
      const duplicateNames = new Set<string>();
      prevFiles.forEach((file) => duplicateNames.add(file.name));

      const uniqueFiles = newFiles.map((file) => {
        if (duplicateNames.has(file.name)) {
          const parts = file.name.split(".");
          const ext = parts.pop();
          const base = parts.join(".");
          const newFile = new File(
            [file],
            `${base} (${duplicateNames.size}).${ext}`,
            { type: file.type }
          );
          duplicateNames.add(newFile.name);
          return newFile;
        }
        duplicateNames.add(file.name);
        return file;
      });

      const updated = [...prevFiles, ...uniqueFiles];
      onDrop(updated);
      return updated;
    });
  };

  const handleDrop = async (acceptedFiles: File[]) => {
    const compatibleFiles: File[] = [];
    const incompatibleFiles: File[] = [];
    let detectedHeic: File | null = null;

    for (const file of acceptedFiles) {
      const isZip = file.type === "application/zip" || /\.zip$/i.test(file.name);
      const isHeic =
        /\.(heic|heif)$/i.test(file.name) ||
        file.type === "image/heic" ||
        file.type === "image/heif";
      const isImage =
        !isHeic &&
        (file.type.startsWith("image/") || /\.(png|jpe?g|webp|jfif)$/i.test(file.name));
      const isVideo =
        file.type.startsWith("video/") || /\.(mp4|webm|mov|mkv)$/i.test(file.name);

      if (isZip) {
        try {
          const extractedFiles = await extractZipImages(file);
          compatibleFiles.push(...extractedFiles);
        } catch {
          incompatibleFiles.push(file);
        }
      } else if (isHeic) {
        // Enfileira para o assistente de conversão com consentimento
        if (!detectedHeic) {
          detectedHeic = file;
        } else {
          // Se houver mais de um, por enquanto guarda o primeiro e avisa
          compatibleFiles.push(file);
        }
      } else if (isImage || isVideo) {
        compatibleFiles.push(file);
      } else {
        incompatibleFiles.push(file);
      }
    }

    if (incompatibleFiles.length > 0) {
      toast({
        title: "Ficheiros não suportados",
        description: `Não foi possível adicionar: ${incompatibleFiles.map((f) => f.name).join(", ")}. Formatos aceites: .png, .jpg, .jfif, .webp, .heic, .mp4, .webm, .zip.`,
        variant: "destructive",
      });
    }

    if (compatibleFiles.length > 0) {
      addCompatibleFiles(compatibleFiles);
    }

    if (detectedHeic) {
      setPendingHeicFile(detectedHeic);
    }
  };

  const handleConfirmHeicConversion = async () => {
    if (!pendingHeicFile) return;

    try {
      setIsConverting(true);
      const heic2any = (await import("heic2any")).default;
      const result = await heic2any({
        blob: pendingHeicFile,
        toType: "image/jpeg",
        quality: 0.92,
      });

      const convertedBlob = Array.isArray(result) ? result[0] : result;
      const newName = pendingHeicFile.name.replace(/\.(heic|heif)$/i, ".jpg");
      const convertedFile = new File([convertedBlob], newName, {
        type: "image/jpeg",
      });

      addCompatibleFiles([convertedFile]);
      toast({
        title: "Fotografia convertida com sucesso",
        description: `${pendingHeicFile.name} foi convertida para JPEG de alta fidelidade e adicionada à lista.`,
      });
      setPendingHeicFile(null);
    } catch (err) {
      console.error("Falha ao converter HEIC:", err);
      toast({
        title: "Falha na conversão",
        description: `Não foi possível converter o ficheiro ${pendingHeicFile.name}. Verifica se a foto não está corrompida.`,
        variant: "destructive",
      });
      setPendingHeicFile(null);
    } finally {
      setIsConverting(false);
    }
  };

  const handleCancelHeicConversion = () => {
    setPendingHeicFile(null);
  };

  useEffect(() => {
    if (receivedFiles.length > 0) {
      setFiles(receivedFiles);
      onDrop(receivedFiles);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receivedFiles]);

  return (
    <div>
      <ConversionAssistantDialog
        isOpen={!!pendingHeicFile}
        file={pendingHeicFile}
        isConverting={isConverting}
        onConvert={handleConfirmHeicConversion}
        onCancel={handleCancelHeicConversion}
      />

      {files.length <= 0 ? (
        <div className="h-64">
          <AppDropzone onDrop={handleDrop}>
            <div className="flex flex-col gap-4 items-center justify-center max-w-[20rem]">
              <ImagePlus size={64} />
              <p className="font-medium text-lg">
                Drag and drop images, videos or .zip
              </p>
            </div>
          </AppDropzone>
        </div>
      ) : (
        <ScrollArea className="w-full rounded-xl border max-h-64 overflow-scroll">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 p-4">
            {files.map((file, index) => (
              <HoverCard key={file.name + index}>
                <HoverCardTrigger>
                  <Card
                    key={index}
                    className="overflow-hidden hover:-translate-y-1 transition-all"
                  >
                    <CardContent className="py-2 px-3 relative">
                      <div className="flex flex-col items-center justify-center pointer-events-none">
                        {file.type?.startsWith("video/") ||
                        /\.(mp4|webm|mov|mkv)$/i.test(file.name) ? (
                          <Video className="w-10 h-7 text-primary mb-1" />
                        ) : (
                          <FileImage className="w-10 h-7 text-primary mb-1" />
                        )}
                        <p className="text-xs text-center truncate w-full">
                          {file.name}
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          const updated = files.filter((_, i) => i !== index);
                          setFiles(updated);
                          onDrop(updated);
                        }}
                        className="absolute top-0 right-0 text-foreground/50 hover:text-foreground p-1"
                      >
                        <X className="size-[1em]" />
                      </button>
                    </CardContent>
                  </Card>
                </HoverCardTrigger>
                <HoverCardContent className="h-48 w-64 z-50">
                  <ImagePreview file={file} />
                </HoverCardContent>
              </HoverCard>
            ))}
            <div>
              <AppDropzone onDrop={handleDrop}>
                <Plus />
              </AppDropzone>
            </div>
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
