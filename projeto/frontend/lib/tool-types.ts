export interface BinarizationToolParams {
  threshold: number; // 0-255
}

export interface BorderToolParams {
  borderWidth: number;
  r: number;
  g: number;
  b: number;
}

export interface BrightnessToolParams {
  brightness: number; // 0.0 - 2.0 (1.0 normal image)
}

export interface ContrastToolParams {
  contrastFactor: number; // 0.0 - 2.0 (1.0 normal image)
}

export interface CropToolParams {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface ResizeToolParams {
  width: number;
  height: number;
}

export interface RotateToolParams {
  degrees: number; // 0 - 360
}

export interface SaturationToolParams {
  saturationFactor: number; // 0.0 - 2.0 (1.0 normal image)
}

export type ExpandMode = "reflect" | "edge" | "solid" | "generative";

export type ExpandAiParams = {
  // UI atual
  percent?: number; // 1..200

  top: number;
  right: number;
  bottom: number;
  left: number;

  // modos
  mode?: ExpandMode;

  // solid only
  color?: string;

  // RF40 generative
  prompt?: string;
  negativePrompt?: string;
  seed?: number;
  steps?: number;
  guidance?: number;
};

export type PrivacyBlurMode = "auto" | "manual" | "hybrid";
export type PrivacyBlurTargets = "faces" | "plates" | "both";
export type PrivacyBlurStyle = "gaussian" | "pixelate";
export type PrivacyBlurIntensity = "low" | "medium" | "high";

export interface ManualBoundingBox {
  x: number; // 0-100 %
  y: number; // 0-100 %
  width: number; // 0-100 %
  height: number; // 0-100 %
}

export interface TimeInterval {
  start: number; // segundos
  end: number;   // segundos
}

export interface PrivacyBlurParams {
  mode?: PrivacyBlurMode;
  targets?: PrivacyBlurTargets;
  blurType?: PrivacyBlurStyle;
  intensity?: PrivacyBlurIntensity;
  confidenceThreshold?: number;
  manualBox?: ManualBoundingBox;
  timeIntervals?: TimeInterval[];
  timeIntervalsStr?: string;
}

export type VideoBgMode = "green_screen" | "solid" | "bokeh";

export interface VideoBgRemoveParams {
  bgMode?: VideoBgMode;
  solidColor?: string;
  blurIntensity?: number;
  timeIntervals?: TimeInterval[];
}

export type ToolParams =
  | BinarizationToolParams
  | BorderToolParams
  | BrightnessToolParams
  | ContrastToolParams
  | CropToolParams
  | ResizeToolParams
  | RotateToolParams
  | SaturationToolParams
  | ExpandAiParams
  | PrivacyBlurParams
  | VideoBgRemoveParams
  | object;

export type ToolNames =
  | "border"
  | "brightness"
  | "contrast"
  | "cut"
  | "scale"
  | "saturation"
  | "binarization"
  | "rotate"
  | "resize"
  | "watermark"
  | "cut_ai"
  | "upgrade_ai"
  | "bg_remove_ai"
  | "text_ai"
  | "obj_ai"
  | "people_ai"
  | "expand_ai"
  | "privacy_blur"
  | "video_bg_remove"
  | "project";

