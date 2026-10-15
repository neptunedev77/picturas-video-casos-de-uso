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

from utils.tool_msg import ToolMSG
import utils.env as env

class PrivacyBlur:
    def __init__(self):
        self._tool_msg = ToolMSG(
            'picturas-privacy-blur-tool-ms',
            'privacy_blur',
            env.RABBITMQ_HOST,
            env.RABBITMQ_PORT,
            env.RABBITMQ_USERNAME,
            env.RABBITMQ_PASSWORD
        )
        self._counter = 0
        self._codes = {
            'wrong_procedure': 2300,
            'corrupted_or_invalid_video': 2301,
            'limit_exceeded': 2302,
            'error_processing': 2303
        }

        # Carregar classificadores Haar pré-instalados no OpenCV
        self.face_cascade = None
        self.profile_cascade = None
        self.plate_cascade = None

        try:
            face_path = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
            if os.path.exists(face_path):
                self.face_cascade = cv2.CascadeClassifier(face_path)
        except Exception as e:
            print(f"[WARN] Failed to load face cascade: {e}", flush=True)

        try:
            profile_path = cv2.data.haarcascades + 'haarcascade_profileface.xml'
            if os.path.exists(profile_path):
                self.profile_cascade = cv2.CascadeClassifier(profile_path)
        except Exception as e:
            print(f"[WARN] Failed to load profile face cascade: {e}", flush=True)

        try:
            plate_path = cv2.data.haarcascades + 'haarcascade_russian_plate_number.xml'
            if os.path.exists(plate_path):
                self.plate_cascade = cv2.CascadeClassifier(plate_path)
        except Exception as e:
            print(f"[WARN] Failed to load plate cascade: {e}", flush=True)

    def _detect_faces(self, gray_frame, frame_w, frame_h):
        boxes = []
        try:
            equalized = cv2.equalizeHist(gray_frame)
        except Exception:
            equalized = gray_frame

        if self.face_cascade is not None:
            faces = self.face_cascade.detectMultiScale(
                equalized,
                scaleFactor=1.10,
                minNeighbors=4,
                minSize=(20, 20)
            )
            for (x, y, w, h) in faces:
                # Haar frontalface deteta principalmente o nucleo facial (olhos ao nariz/boca).
                # Expandir generosamente para cobrir toda a cabeca: testa, queixo, bochechas e orelhas.
                pad_top = int(h * 0.45)
                pad_bottom = int(h * 0.35)
                pad_side = int(w * 0.30)

                fx = max(0, x - pad_side)
                fy = max(0, y - pad_top)
                fw = min(frame_w - fx, w + 2 * pad_side)
                fh = min(frame_h - fy, h + pad_top + pad_bottom)
                boxes.append((int(fx), int(fy), int(fw), int(fh)))

        if self.profile_cascade is not None:
            profiles = self.profile_cascade.detectMultiScale(
                equalized,
                scaleFactor=1.10,
                minNeighbors=4,
                minSize=(20, 20)
            )
            for (x, y, w, h) in profiles:
                pad_top = int(h * 0.45)
                pad_bottom = int(h * 0.35)
                pad_side = int(w * 0.30)

                fx = max(0, x - pad_side)
                fy = max(0, y - pad_top)
                fw = min(frame_w - fx, w + 2 * pad_side)
                fh = min(frame_h - fy, h + pad_top + pad_bottom)
                boxes.append((int(fx), int(fy), int(fw), int(fh)))

        return boxes

    def _detect_plates(self, gray_frame, frame_w, frame_h):
        boxes = []
        if self.plate_cascade is not None:
            plates = self.plate_cascade.detectMultiScale(
                gray_frame,
                scaleFactor=1.15,
                minNeighbors=4,
                minSize=(30, 15)
            )
            for (x, y, w, h) in plates:
                pad_x = int(w * 0.15)
                pad_y = int(h * 0.20)
                px = max(0, x - pad_x)
                py = max(0, y - pad_y)
                pw = min(frame_w - px, w + 2 * pad_x)
                ph = min(frame_h - py, h + 2 * pad_y)
                boxes.append((int(px), int(py), int(pw), int(ph)))

        # Deteção complementar por contornos morfológicos retangulares (formato matrícula: proporção 2.0 a 5.5)
        try:
            blur = cv2.GaussianBlur(gray_frame, (5, 5), 0)
            sobel = cv2.Sobel(blur, cv2.CV_8U, 1, 0, ksize=3)
            _, thresh = cv2.threshold(sobel, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (17, 3))
            closed = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)
            contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

            total_area = frame_w * frame_h
            for c in contours:
                x, y, w, h = cv2.boundingRect(c)
                if h == 0:
                    continue
                aspect_ratio = float(w) / float(h)
                area = w * h
                # Matrículas típicas: proporção horizontal e área moderada
                if 2.2 <= aspect_ratio <= 5.5 and (total_area * 0.0005) <= area <= (total_area * 0.05):
                    pad_x = int(w * 0.15)
                    pad_y = int(h * 0.20)
                    px = max(0, x - pad_x)
                    py = max(0, y - pad_y)
                    pw = min(frame_w - px, w + 2 * pad_x)
                    ph = min(frame_h - py, h + 2 * pad_y)
                    boxes.append((int(px), int(py), int(pw), int(ph)))
        except Exception:
            pass

        return boxes

    def _apply_mask(self, frame, x, y, w, h, blur_type, intensity):
        frame_h, frame_w = frame.shape[:2]

        x1 = max(0, x)
        y1 = max(0, y)
        x2 = min(frame_w, x + w)
        y2 = min(frame_h, y + h)

        roi = frame[y1:y2, x1:x2]
        if roi.size == 0:
            return

        roi_h, roi_w = roi.shape[:2]

        if blur_type in ["pixelate", "mosaic"]:
            # Mosaico / Pixelate
            factor = 8 if intensity == "low" else (16 if intensity == "medium" else 28)
            sw = max(1, roi_w // factor)
            sh = max(1, roi_h // factor)
            small = cv2.resize(roi, (sw, sh), interpolation=cv2.INTER_LINEAR)
            pixelated = cv2.resize(small, (roi_w, roi_h), interpolation=cv2.INTER_NEAREST)
            frame[y1:y2, x1:x2] = pixelated
        else:
            # Desfocagem Gaussiana (Padrão)
            ksize = 31 if intensity == "low" else (61 if intensity == "medium" else 101)
            sigma = 20 if intensity == "low" else (40 if intensity == "medium" else 80)
            kw = min(ksize, roi_w if roi_w % 2 != 0 else roi_w - 1)
            kh = min(ksize, roi_h if roi_h % 2 != 0 else roi_h - 1)
            kw = max(3, kw)
            kh = max(3, kh)
            if kw % 2 == 0:
                kw -= 1
            if kh % 2 == 0:
                kh -= 1
            blurred = cv2.GaussianBlur(roi, (kw, kh), sigma)
            frame[y1:y2, x1:x2] = blurred

    def process_video(self, input_path, output_path, targets="both", blur_type="gaussian", intensity="medium", runner_id=None, msg_id="", mode="auto", manual_box=None):
        if not os.path.exists(input_path):
            raise FileNotFoundError(f"Input video not found: {input_path}")

        cap = cv2.VideoCapture(input_path)
        if not cap.isOpened():
            raise ValueError(f"Unable to open video stream: {input_path}")

        fps = cap.get(cv2.CAP_PROP_FPS)
        if fps <= 0 or np.isnan(fps):
            fps = 30.0

        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        if total_frames <= 0 or width <= 0 or height <= 0:
            cap.release()
            raise ValueError("Invalid video stream dimensions or frame count")

        # Ficheiro temporário intermédio sem áudio
        out_dir = os.path.dirname(output_path)
        if out_dir:
            os.makedirs(out_dir, exist_ok=True)

        temp_no_audio = f"{output_path}_temp_no_audio.mp4"
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        writer = cv2.VideoWriter(temp_no_audio, fourcc, fps, (width, height))

        # Coordenadas da caixa manual (se aplicável)
        manual_rect = None
        if manual_box and isinstance(manual_box, dict):
            mx = max(0, min(width - 1, int(float(manual_box.get('x', 0)) * width / 100.0)))
            my = max(0, min(height - 1, int(float(manual_box.get('y', 0)) * height / 100.0)))
            mw = max(1, min(width - mx, int(float(manual_box.get('width', 20)) * width / 100.0)))
            mh = max(1, min(height - my, int(float(manual_box.get('height', 20)) * height / 100.0)))
            manual_rect = (mx, my, mw, mh)

        total_detections = 0
        frame_idx = 0
        last_progress_time = time.time()
        last_progress_val = -1
        tracked_faces = []

        try:
            while True:
                ret, frame = cap.read()
                if not ret or frame is None:
                    break

                gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                frame_boxes = []

                detected_faces = []
                if mode != "manual":
                    if targets in ["faces", "both", "all"]:
                        detected_faces = self._detect_faces(gray, width, height)

                    if targets in ["plates", "both", "all"]:
                        frame_boxes.extend(self._detect_plates(gray, width, height))

                # Atualizar rastreio temporal de rostos para estabilidade (evita flicker entre frames)
                updated_tracked = []
                used_detected = set()

                for (tx, ty, tw, th, ttl) in tracked_faces:
                    matched = False
                    for idx, (dx, dy, dw, dh) in enumerate(detected_faces):
                        if idx in used_detected:
                            continue
                        cx_t, cy_t = tx + tw / 2, ty + th / 2
                        cx_d, cy_d = dx + dw / 2, dy + dh / 2
                        dist_sq = (cx_t - cx_d)**2 + (cy_t - cy_d)**2
                        max_dim = max(tw, th, dw, dh)
                        if dist_sq < (max_dim * 0.9)**2:
                            sx = int(0.7 * dx + 0.3 * tx)
                            sy = int(0.7 * dy + 0.3 * ty)
                            sw = int(0.7 * dw + 0.3 * tw)
                            sh = int(0.7 * dh + 0.3 * th)
                            updated_tracked.append((sx, sy, sw, sh, 5))
                            used_detected.add(idx)
                            matched = True
                            break
                    if not matched and ttl > 1:
                        updated_tracked.append((tx, ty, tw, th, ttl - 1))

                for idx, (dx, dy, dw, dh) in enumerate(detected_faces):
                    if idx not in used_detected:
                        updated_tracked.append((dx, dy, dw, dh, 5))

                tracked_faces = updated_tracked
                frame_boxes.extend([(x, y, w, h) for (x, y, w, h, _) in tracked_faces])

                if (mode in ["manual", "hybrid"]) and manual_rect:
                    frame_boxes.append(manual_rect)

                total_detections += len(frame_boxes)

                for (x, y, w, h) in frame_boxes:
                    self._apply_mask(frame, x, y, w, h, blur_type, intensity)

                writer.write(frame)
                frame_idx += 1

                # Envio de progresso periódico via WebSocket (pelo menos a cada 5% ou 2s)
                now = time.time()
                current_pct = min(99, int((frame_idx / total_frames) * 100))
                if runner_id and (current_pct >= last_progress_val + 5 or (now - last_progress_time) >= 2.0):
                    self._tool_msg.send_ws_progress(msg_id, runner_id, current_pct)
                    last_progress_val = current_pct
                    last_progress_time = now

        finally:
            cap.release()
            writer.release()

        # Emitir 100% de progresso no final do processamento de fotogramas
        if runner_id:
            self._tool_msg.send_ws_progress(msg_id, runner_id, 100)

        # REQ-VID-BLUR-008: Audio Pass-Through e Remuxing com FFmpeg
        # Junta o vídeo anonimizado com a faixa de áudio original sincronizada em MP4 (H.264 / AAC)
        ffmpeg_cmd = [
            "ffmpeg", "-y",
            "-i", temp_no_audio,
            "-i", input_path,
            "-map", "0:v:0",
            "-map", "1:a:0?",
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac",
            "-shortest",
            output_path
        ]

        print(f"[FFMPEG] Running: {' '.join(ffmpeg_cmd)}", flush=True)
        result = subprocess.run(ffmpeg_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if result.returncode != 0:
            print(f"[WARN] FFmpeg audio pass-through failed: {result.stderr.decode('utf-8', errors='ignore')}. Using video without audio.", flush=True)
            if os.path.exists(temp_no_audio):
                shutil.move(temp_no_audio, output_path)

        # REQ-VID-BLUR-014: Limpeza automática de ficheiros temporários
        if os.path.exists(temp_no_audio):
            try:
                os.remove(temp_no_audio)
            except Exception:
                pass

        return total_detections

    def privacy_blur_callback(self, ch, method, properties, body):
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
        user_type = info.get('userType') or params.get('userType', 'free')

        input_video_path = params.get('inputImageURI')
        output_video_path = params.get('outputImageURI')
        targets = params.get('targets', 'both')
        blur_type = params.get('blurType', 'gaussian')
        intensity = params.get('intensity', 'medium')
        mode = params.get('mode', 'auto')
        manual_box = params.get('manualBox')

        resp_msg_id = f'privacy-blur-{self._counter}-{msg_id}'
        self._counter += 1

        start_time = time.time()
        cur_timestamp = datetime.datetime.now(pytz.utc).isoformat()

        if procedure != 'privacy_blur':
            print(f"[ERROR] Wrong procedure: {procedure}", flush=True)
            self._tool_msg.send_msg(
                msg_id,
                resp_msg_id,
                cur_timestamp,
                'error',
                0,
                None,
                'video',
                self._codes['wrong_procedure'],
                f"Wrong procedure: {procedure}. Expected privacy_blur",
                input_video_path
            )
            return

        print(f"[START] Processing privacy_blur for msg={msg_id} input={input_video_path} mode={mode}", flush=True)

        try:
            detections = self.process_video(
                input_path=input_video_path,
                output_path=output_video_path,
                targets=targets,
                blur_type=blur_type,
                intensity=intensity,
                runner_id=runner_id,
                msg_id=msg_id,
                mode=mode,
                manual_box=manual_box
            )

            processing_time = (time.time() - start_time) * 1000
            end_timestamp = datetime.datetime.now(pytz.utc).isoformat()

            print(f"[SUCCESS] privacy_blur msg={msg_id} detections={detections} time={processing_time:.0f}ms", flush=True)

            self._tool_msg.send_msg(
                msg_id=msg_id,
                resp_msg_id=resp_msg_id,
                timestamp=end_timestamp,
                status='success',
                processingTime=processing_time,
                new_img_uri=output_video_path,
                type='video',
                detections=detections
            )

        except Exception as e:
            processing_time = (time.time() - start_time) * 1000
            end_timestamp = datetime.datetime.now(pytz.utc).isoformat()
            err_msg = str(e)
            print(f"[ERROR] privacy_blur failed: {err_msg}", flush=True)

            self._tool_msg.send_msg(
                msg_id=msg_id,
                resp_msg_id=resp_msg_id,
                timestamp=end_timestamp,
                status='error',
                processingTime=processing_time,
                new_img_uri=None,
                type='video',
                err_code=self._codes['error_processing'],
                err_msg=f"Erro ao processar vídeo de privacidade: {err_msg}",
                og_img_uri=input_video_path
            )

if __name__ == "__main__":
    print("[INIT] Starting Privacy Blur Tool Worker...", flush=True)
    tool = PrivacyBlur()
    tool._tool_msg.read_msg(tool.privacy_blur_callback)

