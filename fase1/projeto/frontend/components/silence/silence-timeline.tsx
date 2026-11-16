"use client";

// Linha temporal do áudio com os troços a remover (REQ-VID-SIL-010/011/012).
// Os troços marcados aparecem a vermelho; os desmarcados a tracejado. As extremidades
// de cada troço podem ser arrastadas; alterações inválidas (sobreposição ou fora do vídeo)
// são ignoradas e o troço mantém o último valor válido.
import { useMemo, useRef, useState } from "react";
import { SilenceSegment, canChangeSegment, formatTime } from "@/lib/silence";

interface Props {
  waveform: number[];
  durationSec: number;
  review: SilenceSegment[];
  activeIndex: number | null;
  playheadSec?: number | null;
  onSelect: (index: number) => void;
  onChange: (index: number, start: number, end: number) => void;
  onSeek?: (sec: number) => void;
  disabled?: boolean;
}

const HEIGHT = 96;
const WIDTH = 1000; // coordenadas internas do SVG (escala com a largura do ecrã)

export function SilenceTimeline({
  waveform,
  durationSec,
  review,
  activeIndex,
  playheadSec,
  onSelect,
  onChange,
  onSeek,
  disabled,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{ index: number; edge: "start" | "end" } | null>(null);

  const x = (sec: number) => (durationSec > 0 ? (sec / durationSec) * WIDTH : 0);

  // forma de onda calculada uma vez por análise (um único path, rápido mesmo com 2000 pontos)
  const wavePath = useMemo(() => {
    if (!waveform.length) return "";
    const step = WIDTH / waveform.length;
    const mid = HEIGHT / 2;
    let d = "";
    waveform.forEach((v, i) => {
      const h = Math.max(1, v * (HEIGHT / 2 - 4));
      const px = (i + 0.5) * step;
      d += `M${px.toFixed(2)} ${(mid - h).toFixed(2)}V${(mid + h).toFixed(2)}`;
    });
    return d;
  }, [waveform]);

  const ticks = useMemo(() => {
    if (durationSec <= 0) return [];
    const candidates = [1, 2, 5, 10, 15, 30, 60, 120, 300];
    const every = candidates.find((c) => durationSec / c <= 12) ?? 600;
    const out: number[] = [];
    for (let t = 0; t <= durationSec; t += every) out.push(t);
    return out;
  }, [durationSec]);

  function secFromEvent(e: React.PointerEvent) {
    const rect = svgRef.current!.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    return Math.round(ratio * durationSec * 100) / 100;
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag) return;
    const sec = secFromEvent(e);
    const seg = review[drag.index];
    const start = drag.edge === "start" ? sec : seg.start;
    const end = drag.edge === "end" ? sec : seg.end;
    if (canChangeSegment(review, drag.index, start, end, durationSec) === null) {
      onChange(drag.index, start, end);
    }
  }

  function onBackgroundClick(e: React.PointerEvent) {
    if (drag || !onSeek) return;
    onSeek(secFromEvent(e));
  }

  return (
    <div className="flex flex-col gap-1 select-none">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        className="w-full h-24 rounded-md border bg-muted/30 touch-none"
        onPointerMove={onPointerMove}
        onPointerUp={() => setDrag(null)}
        onPointerLeave={() => setDrag(null)}
        onPointerDown={onBackgroundClick}
        role="img"
        aria-label="Linha temporal do áudio com os troços de silêncio"
      >
        <path d={wavePath} className="stroke-slate-400 dark:stroke-slate-500" strokeWidth={WIDTH / Math.max(waveform.length, 1) * 0.7} />

        {review.map((s, i) => {
          const left = x(s.start);
          const w = Math.max(1.5, x(s.end) - left);
          const active = i === activeIndex;
          return (
            <g key={i}>
              <rect
                x={left}
                y={2}
                width={w}
                height={HEIGHT - 4}
                className={
                  s.selected
                    ? active
                      ? "fill-red-500/45 stroke-red-600"
                      : "fill-red-500/30 stroke-red-500/70"
                    : active
                      ? "fill-slate-400/20 stroke-slate-600"
                      : "fill-transparent stroke-slate-400"
                }
                strokeWidth={active ? 2 : 1}
                strokeDasharray={s.selected ? undefined : "4 3"}
                vectorEffect="non-scaling-stroke"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onSelect(i);
                }}
                style={{ cursor: "pointer" }}
              >
                <title>{`${formatTime(s.start)} → ${formatTime(s.end)} (${(s.end - s.start).toFixed(2)} s)`}</title>
              </rect>
              {!disabled && active && (
                <>
                  {(["start", "end"] as const).map((edge) => (
                    <rect
                      key={edge}
                      x={(edge === "start" ? left : left + w) - 5}
                      y={0}
                      width={10}
                      height={HEIGHT}
                      className="fill-red-600/80"
                      style={{ cursor: "ew-resize" }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        (e.target as Element).setPointerCapture?.(e.pointerId);
                        setDrag({ index: i, edge });
                      }}
                    />
                  ))}
                </>
              )}
            </g>
          );
        })}

        {playheadSec != null && playheadSec >= 0 && (
          <line
            x1={x(playheadSec)}
            x2={x(playheadSec)}
            y1={0}
            y2={HEIGHT}
            className="stroke-indigo-500"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      <div className="relative h-4 text-[10px] text-muted-foreground font-mono">
        {ticks.map((t) => (
          <span key={t} className="absolute -translate-x-1/2" style={{ left: `${(t / durationSec) * 100}%` }}>
            {formatTime(t, 0)}
          </span>
        ))}
      </div>
    </div>
  );
}
