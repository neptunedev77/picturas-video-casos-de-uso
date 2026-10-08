"use client";

import AppDropzone from "@/components/app-dropzone";
import NewProjectDialog from "@/components/dashboard-sidebar/new-project-dialog";
import { extractZipImages } from "@/lib/utils";
import { ImagePlus } from "lucide-react";
import { useState } from "react";

export default function Dashboard() {
  const [files, setFiles] = useState<File[]>([]);

  const handleDrop = async (acceptedFiles: File[]) => {
    // Extract images from zip files and filter compatible media files (images and videos)
    const compatibleFiles: File[] = [];
    for (const file of acceptedFiles) {
      const isZip = file.type === "application/zip" || /\.zip$/i.test(file.name);
      const isImage =
        file.type?.startsWith("image/") ||
        /\.(png|jpe?g|webp|jfif|heic|heif)$/i.test(file.name);
      const isVideo =
        file.type?.startsWith("video/") ||
        /\.(mp4|webm|mov|mkv)$/i.test(file.name);

      if (isZip) {
        try {
          const extractedFiles = await extractZipImages(file);
          compatibleFiles.push(...extractedFiles);
        } catch {
          // ignorar erro de descompactação
        }
      } else if (isImage || isVideo) {
        compatibleFiles.push(file);
      }
    }

    // Handle duplicate names
    const duplicateNames = new Set<string>();
    files.forEach((file) => duplicateNames.add(file.name));
    const uniqueFiles = compatibleFiles.map((file) => {
      if (duplicateNames.has(file.name)) {
        const newFile = new File(
          [file],
          `${file.name.split(".")[0]} (${duplicateNames.size}).${file.name.split(".")[1]}`,
        );
        duplicateNames.add(newFile.name);
        return newFile;
      }
      duplicateNames.add(file.name);
      return file;
    });

    setFiles(uniqueFiles);
  };

  return (
    <div className="p-8 h-full">
      <NewProjectDialog files={files} setFiles={setFiles}>
        <AppDropzone onDrop={handleDrop}>
          <div className="flex flex-col gap-4 items-center justify-center max-w-[20rem]">
            <ImagePlus size={100} />
            <p className="text-2xl font-medium">
              Pick a project or drag and drop some images or a .zip to create a
              new one
            </p>
          </div>
        </AppDropzone>
      </NewProjectDialog>
    </div>
  );
}
