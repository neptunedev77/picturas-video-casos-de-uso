"use client";

import { useState } from "react";
import { EyeOff } from "lucide-react";
import { ToolbarButton } from "./toolbar-button";
import {
  PrivacyBlurMode,
  PrivacyBlurTargets,
  PrivacyBlurStyle,
  PrivacyBlurIntensity,
  ManualBoundingBox,
} from "@/lib/tool-types";
import { Input } from "@/components/ui/input";

export default function PrivacyBlurTool({ disabled }: { disabled?: boolean }) {
  const [open, setOpen] = useState(false);

  // Modo: Automático (IA), Manual (Área Retangular) ou Híbrido
  const [mode, setMode] = useState<PrivacyBlurMode>("auto");

  // Parâmetros automáticos
  const [targets, setTargets] = useState<PrivacyBlurTargets>("both");
  const [blurType, setBlurType] = useState<PrivacyBlurStyle>("gaussian");
  const [intensity, setIntensity] = useState<PrivacyBlurIntensity>("medium");

  // Parâmetros manuais (percentagens 0-100%)
  const [manualBox, setManualBox] = useState<ManualBoundingBox>({
    x: 30,
    y: 20,
    width: 40,
    height: 35,
  });

  return (
    <ToolbarButton
      icon={EyeOff}
      label="Anonimização de Vídeo (Blur)"
      disabled={disabled}
      isPremium={false}
      open={open}
      setOpen={setOpen}
      noPreview={true}
      contentClassName="!w-auto !min-w-[340px] max-w-sm p-3"
      tool={{
        procedure: "privacy_blur",
        params: {
          mode,
          targets,
          blurType,
          intensity,
          confidenceThreshold: 0.65,
          ...(mode === "manual" || mode === "hybrid" ? { manualBox } : {}),
        },
      }}
    >
      <div className="flex flex-col gap-3 p-1 w-full min-w-[320px] max-h-[75vh] overflow-y-auto">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Configuração de Privacidade
        </div>

        {/* Modo de Operação */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium">Modo de Anonimização</label>
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            value={mode}
            onChange={(e) => setMode(e.target.value as PrivacyBlurMode)}
          >
            <option value="auto">Automático (Deteção com IA)</option>
            <option value="manual">Manual (Definir Área/Coordenadas)</option>
            <option value="hybrid">Híbrido (IA + Área Manual)</option>
          </select>
        </div>

        {/* Seletor de alvos automáticos (se não for puramente manual) */}
        {mode !== "manual" && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium">Alvos Automáticos (IA)</label>
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              value={targets}
              onChange={(e) => setTargets(e.target.value as PrivacyBlurTargets)}
            >
              <option value="both">Rostos e Matrículas (Ambos)</option>
              <option value="faces">Apenas Rostos</option>
              <option value="plates">Apenas Matrículas</option>
            </select>
          </div>
        )}

        {/* Área manual de exclusão / anonimização (se manual ou híbrido) */}
        {(mode === "manual" || mode === "hybrid") && (
          <div className="flex flex-col gap-2 p-2.5 rounded-md border border-border/70 bg-muted/20">
            <div className="flex justify-between items-center">
              <label className="text-xs font-medium">Área Manual (% do vídeo)</label>
              {/* Presets rápidos */}
              <div className="flex gap-1 text-[10px]">
                <button
                  type="button"
                  className="px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 text-foreground"
                  onClick={() => setManualBox({ x: 30, y: 20, width: 40, height: 35 })}
                >
                  Centro
                </button>
                <button
                  type="button"
                  className="px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 text-foreground"
                  onClick={() => setManualBox({ x: 25, y: 10, width: 50, height: 30 })}
                >
                  Topo
                </button>
                <button
                  type="button"
                  className="px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 text-foreground"
                  onClick={() => setManualBox({ x: 20, y: 60, width: 60, height: 30 })}
                >
                  Fundo
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <span className="text-[11px] text-muted-foreground">Posição X (%)</span>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  className="h-8 text-xs"
                  value={manualBox.x}
                  onChange={(e) =>
                    setManualBox((prev) => ({ ...prev, x: Math.max(0, Math.min(100, Number(e.target.value))) }))
                  }
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[11px] text-muted-foreground">Posição Y (%)</span>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  className="h-8 text-xs"
                  value={manualBox.y}
                  onChange={(e) =>
                    setManualBox((prev) => ({ ...prev, y: Math.max(0, Math.min(100, Number(e.target.value))) }))
                  }
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[11px] text-muted-foreground">Largura (%)</span>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  className="h-8 text-xs"
                  value={manualBox.width}
                  onChange={(e) =>
                    setManualBox((prev) => ({ ...prev, width: Math.max(1, Math.min(100, Number(e.target.value))) }))
                  }
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[11px] text-muted-foreground">Altura (%)</span>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  className="h-8 text-xs"
                  value={manualBox.height}
                  onChange={(e) =>
                    setManualBox((prev) => ({ ...prev, height: Math.max(1, Math.min(100, Number(e.target.value))) }))
                  }
                />
              </div>
            </div>
          </div>
        )}

        {/* Estilo de ocultação */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium">Estilo de Máscara</label>
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            value={blurType}
            onChange={(e) => setBlurType(e.target.value as PrivacyBlurStyle)}
          >
            <option value="gaussian">Desfocagem Gaussiana (Blur)</option>
            <option value="pixelate">Mosaico (Pixelate)</option>
          </select>
        </div>

        {/* Nível de intensidade */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium">Nível de Intensidade</label>
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            value={intensity}
            onChange={(e) => setIntensity(e.target.value as PrivacyBlurIntensity)}
          >
            <option value="low">Baixa</option>
            <option value="medium">Média (Recomendado)</option>
            <option value="high">Alta</option>
          </select>
        </div>

        <div className="text-[11px] text-muted-foreground pt-1 border-t border-border/50">
          * Deteção com IA e preservação automática de áudio original.
        </div>
      </div>
    </ToolbarButton>
  );
}
