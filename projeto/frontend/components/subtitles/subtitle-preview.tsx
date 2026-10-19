"use client";

import { useState, type SyntheticEvent } from "react";
import type { SubtitleSegment } from "@/lib/subtitles";

export function formatSubtitleTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const ms = Math.round(seconds * 1000);
  return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
}

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
  const active = segments?.find(
    (segment) => segment.start <= currentTime && currentTime < segment.end,
  );

  function syncTime(event: SyntheticEvent<HTMLVideoElement>) {
    setCurrentTime(event.currentTarget.currentTime);
  }

  return (
    <div className="relative overflow-hidden rounded-md border bg-black">
      <video
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
      />
      {active && (
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
