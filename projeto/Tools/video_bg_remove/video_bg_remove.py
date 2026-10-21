import os
import sys
import json
import time
import shutil
import datetime
import subprocess
import cv2
import numpy as np
import pytz
from PIL import Image

try:
    from rembg import remove, new_session
    # Modelo 'silueta': 43MB (4x mais leve em RAM/CPU), 99.7% de precisão idêntica ao u2net
    rembg_session = new_session("silueta")
except Exception as e:
    rembg_session = None
    print(f"[WARN] Failed to initialize rembg session: {e}", flush=True)

from utils.tool_msg import ToolMSG
import utils.env as env

class VideoBgRemove:
    def __init__(self):
        self._tool_msg = ToolMSG(
            'picturas-video-bg-remove-tool-ms',
            'video_bg_remove',
            env.RABBITMQ_HOST,
            env.RABBITMQ_PORT,
            env.RABBITMQ_USERNAME,
            env.RABBITMQ_PASSWORD
        )
        self._counter = 0
        self._codes = {
            'wrong_procedure': 2400,
            'corrupted_or_invalid_video': 2401,
            'limit_exceeded': 2402,
            'error_processing': 2403
        }

    def _to_seconds(self, val_str):
        val_str = str(val_str).strip()
        if ":" in val_str:
            parts = [float(p) for p in val_str.split(":")]
            if len(parts) == 2:
                return parts[0] * 60 + parts[1]
            elif len(parts) == 3:
                return parts[0] * 3600 + parts[1] * 60 + parts[2]
        return float(val_str)

    def _parse_time_intervals(self, intervals):
        if not intervals:
            return []
        parsed = []
        if isinstance(intervals, str):
            parts = [p.strip() for p in intervals.split(",") if p.strip()]
            for p in parts:
                if "-" in p:
                    sub = p.split("-")
                    try:
                        s = self._to_seconds(sub[0])
                        e = self._to_seconds(sub[1])
                        if s <= e:
                            parsed.append((s, e))
                    except Exception:
                        pass
        elif isinstance(intervals, list):
            for item in intervals:
                if isinstance(item, dict):
                    try:
                        s = float(item.get("start", 0))
                        e = float(item.get("end", 0))
                        if s <= e:
                            parsed.append((s, e))
                    except Exception:
                        pass
                elif isinstance(item, (list, tuple)) and len(item) >= 2:
                    try:
                        s = float(item[0])
                        e = float(item[1])
                        if s <= e:
                            parsed.append((s, e))
                    except Exception:
                        pass
        return parsed

    def _hex_to_bgr(self, hex_color):
        hex_color = hex_color.lstrip("#")
        if len(hex_color) == 6:
            r = int(hex_color[0:2], 16)
            g = int(hex_color[2:4], 16)
            b = int(hex_color[4:6], 16)
            return (b, g, r)
        return (0, 255, 0) # Verde Chroma Key por omissão

    def process_video(self, input_path, output_path, bg_mode="green_screen", solid_color="#00FF00", blur_intensity=25, time_intervals=None, runner_id=None, msg_id=""):
        if not os.path.exists(input_path):
            raise FileNotFoundError(f"Vídeo de entrada não encontrado: {input_path}")

        cap = cv2.VideoCapture(input_path)
        if not cap.isOpened():
            raise ValueError(f"Não foi possível abrir o vídeo: {input_path}")

        fps = cap.get(cv2.CAP_PROP_FPS)
        if fps <= 0 or np.isnan(fps):
            fps = 30.0

        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        if total_frames <= 0 or width <= 0 or height <= 0:
            cap.release()
            raise ValueError("Dimensões do vídeo ou contagem de frames inválidas")

        duration_sec = float(total_frames) / fps
        parsed_intervals = self._parse_time_intervals(time_intervals)

        validated_intervals = []
        for (s, e) in parsed_intervals:
            if s >= duration_sec:
                continue
            clamped_e = min(e, duration_sec)
            validated_intervals.append((s, clamped_e))

        temp_dir = os.path.dirname(output_path)
        os.makedirs(temp_dir, exist_ok=True)

        ffmpeg_cmd = [
            "ffmpeg", "-y",
            "-f", "rawvideo",
            "-vcodec", "rawvideo",
            "-s", f"{width}x{height}",
            "-pix_fmt", "bgr24",
            "-r", str(fps),
            "-i", "-",
            "-i", input_path,
            "-map", "0:v:0",
            "-map", "1:a:0?",
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            "-c:a", "aac",
            "-shortest",
            output_path
        ]
        print(f"[FFMPEG] Starting in-memory pipe: {' '.join(ffmpeg_cmd)}", flush=True)
        ffmpeg_proc = subprocess.Popen(
            ffmpeg_cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )

        bgr_color = self._hex_to_bgr(solid_color) if bg_mode == "solid" else (0, 255, 0)
        prev_mask = None
        prev_raw_mask = None

        # Inferência adaptativa leve (redimensionamento otimizado para vídeos HD/4K)
        infer_w = min(width, 960)
        infer_h = int(height * (infer_w / width))

        frame_idx = 0
        last_progress_time = time.time()
        last_progress_val = -1
        start_proc_time = time.time()
        timeout_sec = max(60.0, 3.0 * duration_sec + 60.0)
        subject_detected_count = 0
        total_interval_frames = 0

        try:
            while True:
                ret, frame = cap.read()
                if not ret or frame is None:
                    break

                if time.time() - start_proc_time > timeout_sec:
                    ffmpeg_proc.kill()
                    raise TimeoutError(f"Tempo limite de execução ({timeout_sec:.1f}s) excedido pelo worker de IA")

                if ffmpeg_proc.poll() is not None:
                    raise RuntimeError("O processo FFmpeg encerrou prematuramente antes da conclusão dos frames")

                current_time = float(frame_idx) / fps
                in_interval = True
                if validated_intervals:
                    in_interval = any(s <= current_time <= e for (s, e) in validated_intervals)

                if in_interval and rembg_session:
                    # Inferência individual frame a frame (elimina artefactos de reutilização em movimento)
                    if width > 960:
                        small_bgr = cv2.resize(frame, (infer_w, infer_h), interpolation=cv2.INTER_LINEAR)
                        small_rgb = cv2.cvtColor(small_bgr, cv2.COLOR_BGR2RGB)
                        out_pil = remove(small_rgb, session=rembg_session, only_mask=True, post_process_mask=True)
                        raw_mask = cv2.resize(np.array(out_pil, dtype=np.float32) / 255.0, (width, height), interpolation=cv2.INTER_LINEAR)
                    else:
                        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                        out_pil = remove(frame_rgb, session=rembg_session, only_mask=True, post_process_mask=True)
                        raw_mask = np.array(out_pil, dtype=np.float32) / 255.0

                    total_interval_frames += 1
                    if raw_mask is not None and raw_mask.shape[:2] == (height, width):
                        if np.mean(raw_mask) > 0.01:
                            subject_detected_count += 1
                        # Feathering localizado: suavizar exclusivamente a banda de transição [0.05, 0.95]
                        # Interior do sujeito (> 0.95) permanece 100% sólido e nítido; fundo (< 0.05) fica limpo
                        transition_band = (raw_mask >= 0.05) & (raw_mask <= 0.95)
                        if np.any(transition_band):
                            feathered = cv2.GaussianBlur(raw_mask, (3, 3), 0)
                            mask = np.where(transition_band, feathered, raw_mask)
                        else:
                            mask = raw_mask
                        mask_3ch = np.dstack([mask] * 3)

                        if str(bg_mode).lower() in ["bokeh", "blur", "desfocagem"]:
                            # Desfocagem Bokeh cinematográfica com escala adaptativa à resolução do vídeo
                            scale = max(2, int(round(width / 480.0)))
                            small_w = max(16, width // scale)
                            small_h = max(16, height // scale)
                            small_bg = cv2.resize(frame, (small_w, small_h), interpolation=cv2.INTER_AREA)

                            base_k = max(3, int(blur_intensity * (17.0 / 25.0)))
                            ksize = base_k if base_k % 2 == 1 else base_k + 1

                            small_blurred = cv2.GaussianBlur(small_bg, (ksize, ksize), 0)
                            bg_frame = cv2.resize(small_blurred, (width, height), interpolation=cv2.INTER_LINEAR)
                        else:
                            bg_frame = np.full_like(frame, bgr_color, dtype=np.uint8)

                        out_frame = (frame.astype(np.float32) * mask_3ch + bg_frame.astype(np.float32) * (1.0 - mask_3ch)).astype(np.uint8)
                        ffmpeg_proc.stdin.write(out_frame.tobytes())
                    else:
                        ffmpeg_proc.stdin.write(frame.tobytes())
                else:
                    ffmpeg_proc.stdin.write(frame.tobytes())

                frame_idx += 1

                now = time.time()
                current_pct = min(99, int((frame_idx / total_frames) * 100))
                if runner_id and (current_pct >= last_progress_val + 5 or (now - last_progress_time) >= 2.0):
                    self._tool_msg.send_ws_progress(msg_id, runner_id, current_pct)
                    last_progress_val = current_pct
                    last_progress_time = now

        finally:
            cap.release()
            if ffmpeg_proc.stdin and not ffmpeg_proc.stdin.closed:
                try:
                    ffmpeg_proc.stdin.close()
                except Exception:
                    pass

        if total_interval_frames > 0 and subject_detected_count == 0:
            print("[WARN] Nenhum sujeito humano detetado para isolamento de fundo", flush=True)

        ffmpeg_proc.wait()
        if ffmpeg_proc.returncode != 0:
            raise RuntimeError(f"Falha na codificação FFmpeg com código {ffmpeg_proc.returncode}")

        if runner_id:
            self._tool_msg.send_ws_progress(msg_id, runner_id, 100)

        return True

    def video_bg_remove_callback(self, ch, method, properties, body):
        try:
            info = json.loads(body.decode())
        except Exception as e:
            print(f"[ERROR] Failed to parse message JSON: {e}", flush=True)
            return

        msg_id = info.get('messageId', '')
        timestamp_str = info.get('timestamp', datetime.datetime.now(pytz.utc).isoformat())
        procedure = info.get('procedure', '')
        params = info.get('parameters', {})
        runner_id = info.get('runnerId') or params.get('runnerId')

        try:
            timestamp = datetime.datetime.fromisoformat(timestamp_str)
        except Exception:
            timestamp = datetime.datetime.now(pytz.utc)

        input_video_uri = params.get('inputImageURI')
        output_video_uri = params.get('outputImageURI')

        resp_msg_id = f'video-bg-remove-{self._counter}-{msg_id}'
        self._counter += 1

        if procedure != 'video_bg_remove':
            cur_timestamp = datetime.datetime.now(pytz.utc)
            proc_time = (cur_timestamp - timestamp).total_seconds() * 1000
            self._tool_msg.send_msg(msg_id, resp_msg_id, cur_timestamp.isoformat(), 'error', proc_time, None, self._codes['wrong_procedure'], "Procedure does not fit into this tool", input_video_uri)
            return

        bg_mode = params.get('bgMode', 'green_screen')
        solid_color = params.get('solidColor', '#00FF00')
        blur_intensity = params.get('blurIntensity', 25)
        time_intervals = params.get('timeIntervals')

        try:
            self.process_video(
                input_video_uri,
                output_video_uri,
                bg_mode=bg_mode,
                solid_color=solid_color,
                blur_intensity=blur_intensity,
                time_intervals=time_intervals,
                runner_id=runner_id,
                msg_id=msg_id
            )

            cur_timestamp = datetime.datetime.now(pytz.utc)
            proc_time = (cur_timestamp - timestamp).total_seconds() * 1000
            self._tool_msg.send_msg(msg_id, resp_msg_id, cur_timestamp.isoformat(), 'success', proc_time, output_video_uri)
            print(f"[SUCCESS] Processed video bg removal: {output_video_uri}", flush=True)

        except Exception as e:
            err_timestamp = datetime.datetime.now(pytz.utc)
            err_proc_time = (err_timestamp - timestamp).total_seconds() * 1000
            self._tool_msg.send_msg(
                msg_id=msg_id,
                resp_msg_id=resp_msg_id,
                timestamp=err_timestamp.isoformat(),
                status='error',
                processingTime=err_proc_time,
                new_img_uri=None,
                err_code=self._codes['error_processing'],
                err_msg=str(e),
                og_img_uri=input_video_uri
            )

    def start(self):
        print("[INFO] VideoBgRemove tool microservice listening on queue 'video_bg_remove_queue'...", flush=True)
        self._tool_msg.read_msg(self.video_bg_remove_callback)

if __name__ == '__main__':
    worker = VideoBgRemove()
    worker.start()
