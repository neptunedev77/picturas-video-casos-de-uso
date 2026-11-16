"""Testes pela API dos requisitos de vídeo que ainda não tinham teste (TST-VID-01, capítulo 10 do relatório).

Correr na pasta `projeto`, com o sistema a correr (docker compose up -d):
    python Tools/silence_removal/tests/e2e_video_requirements.py [--speech <video falado.mp4>]

Gera os vídeos de teste com o FFmpeg do contentor silence_removal_tool, cria contas de teste
(free, premium e anónima) e verifica, por secções, rejeições, limites por plano, cancelamento,
conflito de versão, integridade do original (SHA-256), tempos de aceitação e de compressão e
pedidos de remoção de silêncios em simultâneo. Só usa a biblioteca padrão do Python.
"""
import argparse
import hashlib
import json
import os
import secrets
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from e2e_api import CTX, Api, check, multipart, wait_status  # noqa: E402
import e2e_api  # noqa: E402

TMP = tempfile.mkdtemp(prefix="picturas-e2e-")


def compose(*args):
    r = subprocess.run(["docker", "compose", *args], stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                       text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        raise SystemExit(f"docker compose {' '.join(args)} falhou:\n{r.stdout}")
    return r.stdout


def ffmpeg_video(name, seconds, size="320x240", audio=True, extra=()):
    """Vídeo sintético H.264 (e AAC com um tom, se audio) gerado no contentor e copiado para TMP."""
    remote = f"/tmp/{name}"
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", f"testsrc2=size={size}:rate=25:duration={seconds}"]
    if audio:
        cmd += ["-f", "lavfi", "-i", f"sine=frequency=440:duration={seconds}", "-c:a", "aac", "-shortest"]
    cmd += ["-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", *extra, remote]
    compose("exec", "-T", "silence_removal_tool", *cmd)
    local = os.path.join(TMP, name)
    compose("cp", f"silence_removal_tool:{remote}", local)
    compose("exec", "-T", "silence_removal_tool", "rm", "-f", remote)
    return local


def ffprobe(path):
    remote = "/tmp/probe-" + secrets.token_hex(4) + ".mp4"
    compose("cp", path, f"silence_removal_tool:{remote}")
    out = compose("exec", "-T", "silence_removal_tool", "ffprobe", "-v", "error", "-show_entries",
                  "stream=codec_type,codec_name,duration:format=duration", "-of", "json", remote)
    compose("exec", "-T", "silence_removal_tool", "rm", "-f", remote)
    return json.loads(out)


def sha256(path):
    with open(path, "rb") as fh:
        return hashlib.sha256(fh.read()).hexdigest()


def download(url, dest):
    url = url.replace("http://localhost:9000", "https://localhost:8080") if url.startswith("http://localhost:9000") else url
    with urllib.request.urlopen(url, context=CTX, timeout=120) as r, open(dest, "wb") as fh:
        fh.write(r.read())
    return dest


class User:
    def __init__(self, base, kind):
        self.api = Api(base)
        email = f"vid-{kind}-{secrets.token_hex(4)}@example.test"
        st, reg, _ = self.api.call("POST", "/users", {"name": f"Teste {kind}", "email": email,
                                                      "password": secrets.token_urlsafe(12), "type": kind})
        if st != 201:
            raise SystemExit(f"Não foi possível criar a conta {kind} ({st}): {reg}")
        self.api.token = reg["jwt"]
        self.id = reg["user"]["_id"]
        self.kind = kind

    def ops(self):
        return self.api.call("GET", f"/users/{self.id}")[1].get("remaining_operations")

    def project(self, video=None, name="Teste requisitos de vídeo"):
        st, proj, _ = self.api.call("POST", f"/projects/{self.id}", {"name": name})
        pid = proj["_id"] if st == 201 else None
        if video:
            st = self.upload(pid, video)
        return pid

    def version(self, pid):
        return self.api.call("GET", f"/projects/{self.id}/{pid}")[1].get("version", 0)

    def upload(self, pid, video, ctype="video/mp4"):
        with open(video, "rb") as fh:
            body, ct = multipart("image", os.path.basename(video), fh.read(), ctype)
        st, _, _ = self.api.call("POST", f"/projects/{self.id}/{pid}/img", raw=body, content_type=ct,
                                 headers={"X-Project-Version": str(self.version(pid))})
        return st

    def imgs(self, pid):
        return self.api.call("GET", f"/projects/{self.id}/{pid}")[1].get("imgs", [])

    def original(self, pid, img_id, dest):
        _, img, _ = self.api.call("GET", f"/projects/{self.id}/{pid}/img/{img_id}")
        return download(img["url"], dest)

    def run_tool(self, pid, procedure, params, video_meta=None):
        """Acrescenta a ferramenta e pede o processamento; devolve (estado HTTP, resposta, ms)."""
        h = {"X-Project-Version": str(self.version(pid))}
        st, r, _ = self.api.call("POST", f"/projects/{self.id}/{pid}/tool", {"procedure": procedure, "params": params}, headers=h)
        if st not in (200, 201, 204):
            return st, r, 0
        h = {"X-Project-Version": str(self.version(pid))}
        t0 = time.time()
        st, r, _ = self.api.call("POST", f"/projects/{self.id}/{pid}/process", {"videoMeta": video_meta} if video_meta else {}, headers=h)
        return st, r, (time.time() - t0) * 1000

    def results(self, pid, timeout=300):
        t0 = time.time()
        while time.time() - t0 < timeout:
            st, r, _ = self.api.call("GET", f"/projects/{self.id}/{pid}/process/url")
            if st == 200 and r.get("imgs"):
                return r["imgs"]
            time.sleep(2)
        return []


def section(title):
    print(f"\n{title}")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--base", default="https://localhost:8080/api-gateway")
    p.add_argument("--speech", help="vídeo MP4 com uma pessoa a falar em inglês (legendas e remoção de fundo)")
    p.add_argument("--skip-concurrency", action="store_true")
    a = p.parse_args()
    results = {}

    print("A gerar os vídeos de teste...")
    v10 = ffmpeg_video("v10.mp4", 10, "640x360")
    v2 = ffmpeg_video("v2.mp4", 2)
    v20 = ffmpeg_video("v20_720p.mp4", 20, "1280x720")
    v35 = ffmpeg_video("v35.mp4", 35)
    v70 = ffmpeg_video("v70.mp4", 70)
    v130 = ffmpeg_video("v130.mp4", 130, "160x120")
    v1080 = ffmpeg_video("v1080.mp4", 2, "1920x1080")
    v4k = ffmpeg_video("v4k.mp4", 2, "3840x2160")
    vmute = ffmpeg_video("vmute.mp4", 5, audio=False)
    avi = ffmpeg_video("vavi.avi", 3, extra=())
    corrupt = os.path.join(TMP, "corrompido.mp4")
    with open(corrupt, "wb") as fh:
        fh.write(b"\x00\x00\x00\x18ftypmp42" + os.urandom(200_000))
    speech = a.speech or v10

    free, prem = User(a.base, "free"), User(a.base, "premium")

    section("1) Acesso anónimo (REQ-VID-AUTH-001)")
    try:
        anon = User(a.base, "anonymous")
        pid = anon.project(v2)
        img = (anon.imgs(pid) or [{}])[0].get("_id")
        st_c = anon.api.call("POST", f"/projects/{anon.id}/{pid}/compression", {"imgId": img, "quality": "balanced"})[0]
        st_l = anon.api.call("POST", f"/projects/{anon.id}/{pid}/subtitles", {"imgId": img, "language": "en"})[0]
        st_s = anon.api.call("POST", f"/projects/{anon.id}/{pid}/silence/{img}/analyze", {"options": {"profile": "equilibrado"}})[0]
        st_b = anon.run_tool(pid, "privacy_blur", {"targets": ["faces"], "blurType": "gaussian", "intensity": "medium"})[0]
        st_g = anon.run_tool(pid, "video_bg_remove", {"bgMode": "green_screen", "solidColor": "#00FF00"})[0]
        codes = {"compressão": st_c, "legendas": st_l, "silêncios": st_s, "anonimização": st_b, "fundo": st_g}
        results["AUTH-001"] = check(all(c in (401, 403) for c in codes.values()), f"anónimo recusado em todas: {codes}")
    except SystemExit as e:
        results["AUTH-001"] = check(False, f"não foi possível criar conta anónima: {e}")

    section("2) Remoção de silêncios: rejeições (REQ-VID-SIL-003, 004, 005)")
    pid = free.project()
    st_avi = free.upload(pid, avi, "video/x-msvideo")
    if st_avi in (200, 201, 204):
        img = free.imgs(pid)[-1]["_id"]
        st, r, _ = free.api.call("POST", f"/projects/{free.id}/{pid}/silence/{img}/analyze", {"options": {"profile": "equilibrado"}})
        results["SIL-003"] = check(st == 400, f"AVI recusado antes da análise ({st} {r})")
    else:
        results["SIL-003"] = check(st_avi in (400, 415), f"AVI recusado no carregamento ({st_avi})")
    for key, video, label in [("SIL-004", v130, "vídeo de 2 min 10 s numa conta free"), ("SIL-005", vmute, "vídeo sem som")]:
        pid = free.project(video)
        img = free.imgs(pid)[0]["_id"]
        S = f"/projects/{free.id}/{pid}/silence/{img}"
        st, r, _ = free.api.call("POST", S + "/analyze", {"options": {"profile": "equilibrado"}})
        if st == 202:
            s = wait_status(free.api, S, ("analyzed", "failed"))
            results[key] = check(s.get("status") == "failed", f"{label} recusado: {s.get('error')}")
        else:
            results[key] = check(st == 400, f"{label} recusado antes da fila ({st}: {r.get('code')} {r.get('message')})")

    section("3) Anonimização: limites, ficheiro corrompido, premium, cancelamento e reaplicação (TST-BLUR-04)")
    blur = {"mode": "auto", "targets": ["faces", "plates"], "blurType": "gaussian", "intensity": "medium", "confidenceThreshold": 0.65}
    # Como a interface: a duração e a resolução seguem com o pedido (o servidor não lê o ficheiro).
    pid = free.project(v70)
    st, r, _ = free.run_tool(pid, "privacy_blur", blur, {"duration": 70, "width": 320, "height": 240})
    results["BLUR-70s"] = check(st == 400, f"free com vídeo de 70 s recusado ({st}: {r})")
    pid = free.project(v4k)
    st, r, _ = free.run_tool(pid, "privacy_blur", blur, {"duration": 2, "width": 3840, "height": 2160})
    results["BLUR-4K"] = check(st == 400, f"free com vídeo 4K recusado ({st}: {r})")
    pid = free.project()
    st_up = free.upload(pid, corrupt)
    if st_up in (200, 201, 204):
        st, r, _ = free.run_tool(pid, "privacy_blur", blur)
        ok = st == 400
        if st in (200, 201):
            ok = not free.results(pid, timeout=60)
        results["BLUR-corrupt"] = check(ok, f"ficheiro corrompido sem resultado ({st}: {r})")
    else:
        results["BLUR-corrupt"] = check(True, f"ficheiro corrompido recusado no carregamento ({st_up})")
    ops0 = prem.ops()
    pid = prem.project(v10)
    st, r, ms = prem.run_tool(pid, "privacy_blur", blur)
    got = prem.results(pid, timeout=180)
    results["BLUR-premium"] = check(st in (200, 201) and got, f"premium processa o vídeo de 10 s ({st}, {len(got)} resultado)")
    check(prem.ops() == ops0, "premium sem desconto de operações")
    h = {"X-Project-Version": str(prem.version(pid))}
    t0 = time.time()
    st, r, _ = prem.api.call("POST", f"/projects/{prem.id}/{pid}/process", {}, headers=h)
    again = (time.time() - t0) * 1000
    results["BLUR-011"] = check(st in (200, 201) and prem.results(pid, timeout=10), f"reaplicar sem alterações devolve o resultado existente ({st}, {again:.0f} ms)")
    pid = prem.project(v70)
    st, r, _ = prem.run_tool(pid, "privacy_blur", blur)
    time.sleep(4)
    st_c, r_c, _ = prem.api.call("DELETE", f"/projects/{prem.id}/{pid}/process", headers={"X-Project-Version": str(prem.version(pid))})
    time.sleep(3)
    results["BLUR-cancel"] = check(st_c in (200, 204) and not prem.results(pid, timeout=5), f"cancelamento a meio sem resultado ({st_c})")

    section("4) Quota esgotada numa conta free (REQ-VID-QUOTA-001)")
    q = User(a.base, "free")
    pid = q.project(v2)
    img = q.imgs(pid)[0]["_id"]
    used = 0
    for _ in range(6):
        if (q.ops() or 0) <= 0:
            break
        st, r, _ = q.api.call("POST", f"/projects/{q.id}/{pid}/compression", {"imgId": img, "quality": "small"})
        if st != 202:
            break
        jid = r.get("jobId") or r.get("_id") or r.get("id")
        wait_status(q.api, f"/projects/{q.id}/{pid}/compression/{jid}", ("completed", "failed", "cancelled"), timeout=120)
        used += 1
    pidb = q.project(v2)
    st, r, _ = q.run_tool(pidb, "privacy_blur", blur)
    results["QUOTA-empty"] = check(q.ops() == 0 and st in (400, 403, 429, 701), f"sem operações ({used} usadas), anonimização recusada ({st}: {r})")

    section("5) Remoção de fundo: plano free, modos premium, intervalo e original (TST-BG-01)")
    green = {"bgMode": "green_screen", "solidColor": "#00FF00"}
    pid = free.project(v10)
    st, r, _ = free.run_tool(pid, "video_bg_remove", {"bgMode": "bokeh", "solidColor": "#00FF00", "blurIntensity": 25})
    results["BG-bokeh-free"] = check(st == 403, f"Bokeh bloqueado numa conta free ({st}: {r})")
    pid = free.project(v35)
    st, r, _ = free.run_tool(pid, "video_bg_remove", green, {"duration": 35, "width": 320, "height": 240})
    results["BG-35s"] = check(st == 400, f"free com vídeo de 35 s recusado ({st}: {r})")
    pid = free.project(v1080)
    st, r, _ = free.run_tool(pid, "video_bg_remove", green, {"duration": 2, "width": 1920, "height": 1080})
    results["BG-1080"] = check(st == 400, f"free com vídeo 1080p recusado ({st}: {r})")
    pid = free.project(v10)
    st, r, _ = free.run_tool(pid, "video_bg_remove", {**green, "timeIntervals": [{"start": 2, "end": 15}]})
    # Defeito conhecido (Cap. 10): o servidor não valida o intervalo; só a interface o ajusta à duração.
    results["BG-005"] = check(st == 400, f"intervalo além da duração recusado no servidor ({st}: {r})")
    for mode, params in [("cor sólida", {"bgMode": "solid", "solidColor": "#1E293B"}),
                         ("Bokeh (premium)", {"bgMode": "bokeh", "solidColor": "#00FF00", "blurIntensity": 25, "timeIntervals": [{"start": 1, "end": 4}]})]:
        pid = prem.project(speech)
        img = prem.imgs(pid)[0]
        before = sha256(prem.original(pid, img["_id"], os.path.join(TMP, "orig-before.mp4")))
        st, r, _ = prem.run_tool(pid, "video_bg_remove", params)
        got = prem.results(pid, timeout=400)
        ok = st in (200, 201) and bool(got)
        if ok:
            out = download(got[0]["url"], os.path.join(TMP, "bg-out.mp4"))
            pr = ffprobe(out)
            streams = {s["codec_type"]: s for s in pr["streams"]}
            v_d = float(streams.get("video", {}).get("duration", 0))
            a_d = float(streams.get("audio", {}).get("duration", v_d))
            print(f"     resultado {got[0]['name']}: {streams.get('video', {}).get('codec_name')}/{streams.get('audio', {}).get('codec_name')}, "
                  f"vídeo {v_d:.3f} s, áudio {a_d:.3f} s")
            results[f"BG-sync-{mode}"] = check(abs(v_d - a_d) * 1000 <= 40 or "audio" not in streams, f"desfasamento som/imagem {abs(v_d - a_d) * 1000:.0f} ms (≤ 40 ms)")
        results[f"BG-{mode}"] = check(ok, f"{mode} concluído ({st})")
        after = sha256(prem.original(pid, img["_id"], os.path.join(TMP, "orig-after.mp4")))
        results[f"ORIG-BG-{mode}"] = check(before == after, "original com o mesmo SHA-256")
    pid = prem.project(v70)
    st, r, _ = prem.run_tool(pid, "video_bg_remove", green)
    time.sleep(5)
    st_c, _, _ = prem.api.call("DELETE", f"/projects/{prem.id}/{pid}/process", headers={"X-Project-Version": str(prem.version(pid))})
    time.sleep(3)
    results["BG-cancel"] = check(st_c in (200, 204) and not prem.results(pid, timeout=5), f"cancelamento a meio sem resultado ({st_c})")

    section("6) Conflito de versão do projeto (REQ-VID-BG-029)")
    pid = prem.project(v2)
    stale = prem.version(pid)
    prem.api.call("POST", f"/projects/{prem.id}/{pid}/tool", {"procedure": "brightness", "params": {"brightness": 1.1}},
                  headers={"X-Project-Version": str(stale)})
    st, r, _ = prem.api.call("POST", f"/projects/{prem.id}/{pid}/tool", {"procedure": "video_bg_remove", "params": green},
                             headers={"X-Project-Version": str(stale)})
    results["BG-029"] = check(st == 409, f"pedido com versão desatualizada recusado ({st}: {r})")

    section("7) Legendas (TST-LEG-02)")
    pid = prem.project(speech)
    img = prem.imgs(pid)[0]
    before = sha256(prem.original(pid, img["_id"], os.path.join(TMP, "leg-before.mp4")))
    L = f"/projects/{prem.id}/{pid}/subtitles"
    st, r, _ = prem.api.call("POST", L, {"imgId": img["_id"], "language": "en"})
    jid = r.get("jobId") if isinstance(r, dict) else None
    s = wait_status(prem.api, f"{L}/{jid}", ("transcribed", "ready_for_review", "review", "completed", "failed", "cancelled"), timeout=600) if jid else {}
    results["LEG-transcribe"] = check(s.get("status") in ("transcribed", "ready_for_review", "review"), f"transcrição EN pronta para revisão ({s.get('status')}, {len(s.get('segments') or [])} segmentos)")
    st, r, _ = prem.api.call("POST", f"{L}/{jid}/reject")
    results["LEG-reject"] = check(st in (200, 202), f"rejeitar a transcrição ({st}: {r.get('status') if isinstance(r, dict) else r})")
    st, r, _ = prem.api.call("POST", L, {"imgId": img["_id"], "language": "en"})
    jid = r.get("jobId") if isinstance(r, dict) else None
    s = wait_status(prem.api, f"{L}/{jid}", ("transcribed", "ready_for_review", "review", "completed", "failed", "cancelled"), timeout=600) if jid else {}
    st, r, _ = prem.api.call("POST", f"{L}/{jid}/confirm")
    s = wait_status(prem.api, f"{L}/{jid}", ("completed", "failed", "cancelled"), timeout=300)
    results["LEG-confirm"] = check(s.get("status") == "completed", f"nova geração confirmada e SRT gerado ({s.get('status')})")
    st, r, _ = prem.api.call("GET", f"{L}/{jid}/result") if s.get("status") == "completed" else (0, None, None)
    print(f"     transferência do SRT: {st}")
    after = sha256(prem.original(pid, img["_id"], os.path.join(TMP, "leg-after.mp4")))
    results["ORIG-LEG"] = check(before == after, "original com o mesmo SHA-256")
    pid = prem.project(vmute)
    img = prem.imgs(pid)[0]["_id"]
    L = f"/projects/{prem.id}/{pid}/subtitles"
    st, r, _ = prem.api.call("POST", L, {"imgId": img, "language": "en"})
    jid = r.get("jobId") if isinstance(r, dict) else None
    s = wait_status(prem.api, f"{L}/{jid}", ("failed", "transcribed", "ready_for_review", "review", "completed"), timeout=180) if jid else {}
    results["LEG-mute"] = check(st == 400 or s.get("status") == "failed", f"vídeo sem áudio recusado ({st} {s.get('status')} {s.get('error')})")
    pid = prem.project(speech)
    img = prem.imgs(pid)[0]["_id"]
    L = f"/projects/{prem.id}/{pid}/subtitles"
    st, r, _ = prem.api.call("POST", L, {"imgId": img, "language": "en"})
    jid = r.get("jobId") if isinstance(r, dict) else None
    time.sleep(3)
    st_c, r_c, _ = prem.api.call("POST", f"{L}/{jid}/cancel")
    s = wait_status(prem.api, f"{L}/{jid}", ("cancelled", "failed", "completed"), timeout=60)
    results["LEG-cancel"] = check(s.get("status") == "cancelled", f"cancelamento durante a transcrição ({st_c}, {s.get('status')})")
    big = os.path.join(TMP, "grande.mp4")
    with open(big, "wb") as fh:
        fh.write(os.urandom(101 * 1024 * 1024))
    pid = prem.project()
    st_big = prem.upload(pid, big)
    results["LEG-100MB"] = check(st_big == 413, f"ficheiro acima de 100 MB recusado no carregamento ({st_big})")

    section("8) Tempo de compressão (REQ-VID-COMP-035) e aceitação de pedidos (REQ-VID-SUBMIT-002)")
    pid = prem.project(v20)
    img = prem.imgs(pid)[0]["_id"]
    C = f"/projects/{prem.id}/{pid}/compression"
    t0 = time.time()
    st, r, _ = prem.api.call("POST", C, {"imgId": img, "quality": "balanced"})
    jid = r.get("jobId") or r.get("_id") or r.get("id")
    s = wait_status(prem.api, f"{C}/{jid}", ("completed", "failed", "cancelled"), timeout=300)
    secs = time.time() - t0
    results["COMP-035"] = check(s.get("status") == "completed" and secs <= 1.5 * 20, f"20 s de vídeo 720p comprimidos em {secs:.1f} s ({secs / 20:.2f}× a duração; alvo MVP ≤ 1,5×)")
    times = []
    for _ in range(20):
        t0 = time.time()
        st, r, _ = prem.api.call("POST", C, {"imgId": img, "quality": "small"})
        times.append((time.time() - t0) * 1000)
        jid = r.get("jobId") or r.get("_id") or r.get("id")
        if jid:
            prem.api.call("POST", f"{C}/{jid}/cancel")
            wait_status(prem.api, f"{C}/{jid}", ("completed", "failed", "cancelled"), timeout=120)
    times.sort()
    p95 = times[int(0.95 * len(times)) - 1]
    results["SUBMIT-002"] = check(p95 <= 2000, f"20 pedidos: mediana {times[10]:.0f} ms, p95 {p95:.0f} ms, máx. {times[-1]:.0f} ms (alvo MVP ≤ 2 s)")

    if not a.skip_concurrency:
        section("9) Cinco análises de silêncios em simultâneo (REQ-VID-SIL-030)")
        jobs = []
        for i in range(5):
            pid = prem.project(ffmpeg_video(f"conc{i}.mp4", 60, "320x240"))
            img = prem.imgs(pid)[0]["_id"]
            jobs.append(f"/projects/{prem.id}/{pid}/silence/{img}")
        codes = [None] * 5
        def go(i):
            codes[i] = prem.api.call("POST", jobs[i] + "/analyze", {"options": {"profile": "equilibrado"}})[0]
        th = [threading.Thread(target=go, args=(i,)) for i in range(5)]
        [t.start() for t in th]
        [t.join() for t in th]
        peak, finals, t0 = 0, {}, time.time()
        while time.time() - t0 < 300 and len(finals) < 5:
            states = [prem.api.call("GET", j)[1].get("status") for j in jobs]
            peak = max(peak, sum(s == "analyzing" for s in states))
            finals = {i: s for i, s in enumerate(states) if s in ("analyzed", "failed")}
            time.sleep(0.5)
        results["SIL-030"] = check(all(c == 202 for c in codes) and all(s == "analyzed" for s in finals.values()) and len(finals) == 5,
                                   f"5 pedidos aceites {codes}, todos concluídos {sorted(finals.values())}, no máximo {peak} em análise ao mesmo tempo")

    print("\nRESUMO")
    for k, v in results.items():
        print(f"  {'Passa' if v else 'Falha'}  {k}")
    print("\nRESULTADO:", "TUDO OK" if e2e_api.ok_all else "HÁ FALHAS")
    return 0 if e2e_api.ok_all else 1


if __name__ == "__main__":
    sys.exit(main())
