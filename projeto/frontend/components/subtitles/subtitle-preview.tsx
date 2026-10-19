import type { SubtitleSegment } from "@/lib/subtitles";

export function formatSubtitleTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const ms = Math.round(seconds * 1000);
  return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
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
