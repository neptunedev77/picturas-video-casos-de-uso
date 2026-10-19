"use client";

import { useEffect, useMemo, useRef, useState, type SyntheticEvent } from "react";
import type { SubtitleSegment } from "@/lib/subtitles";

export function formatSubtitleTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const ms = Math.round(seconds * 1000);
  return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
}

// This representation exists only for the browser's native video captions.
export function subtitlePreviewVtt(segments?: SubtitleSegment[]) {
  const cues = segments?.filter(
    ({ start, end, text }) =>
      Number.isFinite(start) && Number.isFinite(end) && start >= 0 &&
      Math.round(start * 1000) < Math.round(end * 1000) && text.trim(),
  ).map(({ start, end, text }, index) => {
    const payload = text.trim().replace(/\r\n?/g, "\n")
      .replace(/\n(?:[\t ]*\n)+/g, "\n")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `${index + 1}\n${formatSubtitleTime(start).replace(",", ".")} --> ${formatSubtitleTime(end).replace(",", ".")}\n${payload}\n`;
  });
  return cues?.length ? `WEBVTT\n\n${cues.join("\n")}` : "";
}

type FullscreenVideo = HTMLVideoElement & {
  webkitDisplayingFullscreen?: boolean;
  webkitPresentationMode?: string;
};

export function SubtitleVideoPreview({
  videoUrl,
  videoName,
  segments,
}: {
  videoUrl: string;
  videoName: string;
  segments?: SubtitleSegment[];
}) {
  const [currentTime, setCurrentTime] = useState(0);
  const [trackUrl, setTrackUrl] = useState<string>();
  const [fullscreen, setFullscreen] = useState(false);
  const [nativeShowing, setNativeShowing] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLTrackElement>(null);
  const fullscreenRef = useRef(false);
  const vtt = useMemo(() => subtitlePreviewVtt(segments), [segments]);
  const active = segments?.find(
    (segment) => segment.start <= currentTime && currentTime < segment.end,
  );

  useEffect(() => {
    if (!vtt) {
      setTrackUrl(undefined);
      return;
    }
    const url = URL.createObjectURL(new Blob([vtt], { type: "text/vtt;charset=utf-8" }));
    setTrackUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [vtt]);

  useEffect(() => {
    const video = videoRef.current as FullscreenVideo | null;
    if (!video) return;
    const syncNativeVisibility = () => {
      setNativeShowing(trackRef.current?.track.mode === "showing");
    };
    const changeFullscreen = (enabled: boolean) => {
      fullscreenRef.current = enabled;
      setFullscreen(enabled);
      if (trackRef.current) trackRef.current.track.mode = enabled ? "showing" : "hidden";
      syncNativeVisibility();
    };
    const syncFullscreen = () => {
      const element = document.fullscreenElement ||
        (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement;
      changeFullscreen(Boolean(element?.contains(video) || video.webkitDisplayingFullscreen ||
        video.webkitPresentationMode === "fullscreen"));
    };
    const beginFullscreen = () => changeFullscreen(true);
    const endFullscreen = () => changeFullscreen(false);
    document.addEventListener("fullscreenchange", syncFullscreen);
    document.addEventListener("webkitfullscreenchange", syncFullscreen);
    video.addEventListener("webkitbeginfullscreen", beginFullscreen);
    video.addEventListener("webkitendfullscreen", endFullscreen);
    video.addEventListener("webkitpresentationmodechanged", syncFullscreen);
    video.textTracks.addEventListener("change", syncNativeVisibility);
    syncFullscreen();
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreen);
      document.removeEventListener("webkitfullscreenchange", syncFullscreen);
      video.removeEventListener("webkitbeginfullscreen", beginFullscreen);
      video.removeEventListener("webkitendfullscreen", endFullscreen);
      video.removeEventListener("webkitpresentationmodechanged", syncFullscreen);
      video.textTracks.removeEventListener("change", syncNativeVisibility);
    };
  }, []);

  useEffect(() => {
    if (trackRef.current) {
      trackRef.current.track.mode = fullscreenRef.current ? "showing" : "hidden";
    }
    setNativeShowing(trackRef.current?.track.mode === "showing");
  }, [trackUrl]);

  function syncTime(event: SyntheticEvent<HTMLVideoElement>) {
    setCurrentTime(event.currentTarget.currentTime);
  }

  return (
    <div className="relative overflow-hidden rounded-md border bg-black">
      <video
        ref={videoRef}
        src={videoUrl}
        controls
        playsInline
        preload="metadata"
        aria-label={`Vídeo original: ${videoName}`}
        className="max-h-56 w-full"
        onTimeUpdate={syncTime}
        onSeeking={syncTime}
        onSeeked={syncTime}
        onPause={syncTime}
        onEnded={syncTime}
        onLoadedMetadata={syncTime}
        onEmptied={() => setCurrentTime(0)}
      >
        {trackUrl && (
          <track
            key={trackUrl}
            ref={trackRef}
            kind="subtitles"
            src={trackUrl}
            srcLang="und"
            label="Legendas da pré-visualização"
            onLoad={(event) => {
              event.currentTarget.track.mode = fullscreenRef.current ? "showing" : "hidden";
              setNativeShowing(event.currentTarget.track.mode === "showing");
            }}
          />
        )}
      </video>
      {active && !fullscreen && !nativeShowing && (
        <div
          data-testid="subtitle-overlay"
          className="pointer-events-none absolute inset-x-3 bottom-16 flex justify-center"
        >
          <p className="line-clamp-2 max-w-[90%] whitespace-pre-line break-words rounded bg-black/80 px-3 py-1 text-center text-sm font-medium leading-snug text-white shadow-sm sm:text-base">
            {active.text}
          </p>
        </div>
      )}
    </div>
  );
}

export function SubtitlePreview({ segments }: { segments: SubtitleSegment[] }) {
  return (
    <section aria-labelledby="subtitle-preview-heading" className="space-y-3">
      <h3 id="subtitle-preview-heading" className="text-sm font-medium">
        Pré-visualização · {segments.length} segmentos
      </h3>
      <p className="text-sm text-muted-foreground">
        Reveja o texto e os tempos reconhecidos. A edição manual não está
        disponível nesta fase.
      </p>
      <ol
        tabIndex={0}
        aria-label="Segmentos reconhecidos"
        className="max-h-64 divide-y overflow-y-auto rounded-md border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {segments.map((segment, index) => (
          <li key={index} className="space-y-1 p-3">
            <p className="font-mono text-xs text-muted-foreground">
              {formatSubtitleTime(segment.start)} →{" "}
              {formatSubtitleTime(segment.end)}
            </p>
            <p className="whitespace-pre-wrap break-words text-sm">
              {segment.text}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
