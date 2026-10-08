"use client";

import { useState } from "react";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import ImageSubmissionArea from "../image-submission-area";
import { LoaderCircle, Plus } from "lucide-react";
import { useAddProjectImages, useAddProjectVideo } from "@/lib/mutations/projects";
import { createBlobUrlFromFile } from "@/lib/utils";
import { useProjectInfo } from "@/providers/project-provider";
import { useSession } from "@/providers/session-provider";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/error-messages";
import { useSearchParams } from "next/navigation";

export function AddImagesDialog() {
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const { toast } = useToast();

  const { _id: pid, version} = useProjectInfo();
  const session = useSession();
  const ownerId = searchParams.get("owner") ?? session.user._id;
  const shareId = searchParams.get("share") ?? undefined;

  const addImages = useAddProjectImages(
    session.user._id,
    pid as string,
    session.token,
    ownerId,
    shareId,
  );

  const addVideo = useAddProjectVideo(
    session.user._id,
    pid as string,
    session.token,
    ownerId,
    shareId,
  );

  function onDrop(files: File[]) {
    setImageFiles(files);
    Promise.all(files.map((file) => createBlobUrlFromFile(file))).then((urls) => {
      setImages(urls);
    });
  }

  async function handleAdd() {
    const videoFiles = imageFiles.filter(
      (f) => f.type.startsWith("video/") || /\.(mp4|webm|mov|mkv)$/i.test(f.name),
    );
    const normalImages = imageFiles.filter((f) => !videoFiles.includes(f));

    let hasErrors = false;

    for (const vid of videoFiles) {
      try {
        await addVideo.mutateAsync({
          video: vid,
          projectVersion: version,
        });
      } catch (err) {
        hasErrors = true;
        const errInfo = getErrorMessage("project-upload", err);
        toast({
          title: errInfo.title,
          description: errInfo.description,
          variant: "destructive",
        });
      }
    }

    if (normalImages.length > 0) {
      addImages.mutate(
        {
          images: normalImages,
          projectVersion: version,
        },
        {
          onSuccess: () => {
            if (!hasErrors) {
              toast({
                title: "Ficheiros adicionados com sucesso.",
              });
              setImages([]);
              setImageFiles([]);
              setOpen(false);
            }
          },
          onError: (error) => {
            const { title, description } = getErrorMessage("project-upload", error);
            toast({
              title,
              description,
              variant: "destructive",
            });
          },
        },
      );
    } else if (!hasErrors) {
      toast({
        title: "Vídeo adicionado com sucesso.",
      });
      setImages([]);
      setImageFiles([]);
      setOpen(false);
    }
  }

  const isPending = addImages.isPending || addVideo.isPending;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="inline-flex" variant="outline">
          <Plus /> Add Media
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add Media</DialogTitle>
          <DialogDescription>
            Add images or videos to your project.
          </DialogDescription>
        </DialogHeader>
        <ImageSubmissionArea onDrop={onDrop} />
        <DialogFooter>
          <Button
            onClick={handleAdd}
            disabled={images.length === 0 || isPending}
            className="inline-flex items-center gap-1"
          >
            <span>Add</span>
            {isPending && (
              <LoaderCircle className="size-[1em] animate-spin" />
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
