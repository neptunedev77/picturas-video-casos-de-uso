"""Ferramenta de linha de comandos para testar o serviço sem o resto do PictuRAS.

Dentro do contentor (docker compose run --rm silence_removal_tool python cli.py ...):
    python cli.py demo                              # gera um vídeo sintético e testa tudo
    python cli.py queue-test <video>                # testa pela fila RabbitMQ (worker a correr)
    python cli.py make-test-video <saida.mp4> [--pauses 300]   # vídeo com muitas pausas
    python cli.py analyze <video> [--profile agressivo] [--music] [--premium]
    python cli.py apply <video> <saida.mp4> [--segments analise.json] [--profile ...]
"""
import argparse
import json
import os
import subprocess
import sys
import tempfile
import threading
import time

import analyzer
import cutter
import errors
from media import JobControl


def _bar(pct):
    sys.stdout.write(f"\r  progresso: {pct:3d}%")
    sys.stdout.flush()
    if pct >= 100:
        sys.stdout.write("\n")


def _fmt(sec):
    return f"{int(sec // 60):02d}:{sec % 60:06.3f}"


def run_analyze(video, profile, music, user_type, quiet=False):
    control = JobControl(timeout_sec=300)
    t0 = time.monotonic()
    res = analyzer.analyze(
        video, {"profile": profile, "backgroundMusic": music}, user_type, control,
        None if quiet else _bar,
    )
    elapsed = time.monotonic() - t0
    if not quiet:
        sys.stdout.write("\n")
        v, s = res["video"], res["savings"]
        print(f"Vídeo: {v['durationSec']}s, {v['width']}x{v['height']} @ {v['fps']} fps")
        print(f"Opções: {res['options']}")
        print(f"Análise em {elapsed:.2f}s ({elapsed / v['durationSec']:.3f}x a duração; alvo MVP <= 0.1x)")
        print(f"Troços a remover: {len(res['segments'])}")
        for i, sg in enumerate(res["segments"], 1):
            print(f"  {i:3d}. {_fmt(sg['start'])} -> {_fmt(sg['end'])}  ({sg['duration']:.3f}s)")
        print(f"Poupança prevista: {s['originalSec']}s -> {s['finalSec']}s "
              f"(menos {s['removedSec']}s, {s['removedPct']}%)")
        if res.get("message"):
            print(f"Aviso: {res['message']}")
    return res, elapsed


def run_apply(video, output, segments, user_type, quiet=False):
    control = JobControl()
    t0 = time.monotonic()
    res = cutter.apply_cuts(video, output, segments, user_type, control, None if quiet else _bar)
    elapsed = time.monotonic() - t0
    if not quiet:
        r = res["result"]
        print(f"Novo vídeo: {res['outputVideoURI']}")
        print(f"Duração: {res['savings']['originalSec']}s -> {r['durationSec']}s (previsto {r['expectedSec']}s)")
        print(f"Desfasamento som/imagem: {r['avDiffMs']} ms (máx. 40 ms)")
        print(f"Processamento em {elapsed:.1f}s ({elapsed / max(r['durationSec'], 0.001):.2f}x a duração final; "
              f"alvo MVP <= 1.5x a 1080p)")
    return res, elapsed


def _sha256(path):
    import hashlib
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _make_video(path, audio=True):
    # fala simulada (tom de 440 Hz) com três pausas: 3-4.5 s, 7-7.5 s (curta demais) e 11-13 s
    speech = "between(t,0,3)+between(t,4.5,7)+between(t,7.5,11)+between(t,13,20)"
    cmd = ["ffmpeg", "-nostdin", "-y", "-v", "error",
           "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=25:duration=20"]
    if audio:
        cmd += ["-f", "lavfi", "-i",
                f"aevalsrc='0.4*sin(2*PI*440*t)*({speech})+0.0002*(random(0)-0.5)':s=48000:d=20"]
    cmd += ["-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p"]
    if audio:
        cmd += ["-c:a", "aac", "-shortest"]
    cmd.append(path)
    subprocess.run(cmd, check=True)


def make_test_video(path, pauses, speech_sec=1.2, pause_sec=1.0, size="640x360"):
    """Vídeo sintético com N pausas regulares (para testar a revisão com muitos troços, REQ-VID-SIL-035)."""
    cycle = speech_sec + pause_sec
    duration = round(pauses * cycle + speech_sec, 2)
    subprocess.run([
        "ffmpeg", "-nostdin", "-y", "-v", "error",
        "-f", "lavfi", "-i", f"testsrc2=size={size}:rate=25:duration={duration}",
        "-f", "lavfi", "-i",
        f"aevalsrc='0.4*sin(2*PI*440*t)*lt(mod(t,{cycle}),{speech_sec})+0.0002*(random(0)-0.5)':s=48000:d={duration}",
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "35", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", path,
    ], check=True)
    print(f"Vídeo criado: {path} ({duration:.0f} s, {pauses} pausas de {pause_sec} s)")
    if duration > 120:
        print("Nota: tem mais de 2 minutos, por isso precisa de uma conta Premium (RN2).")


def demo():
    ok = True

    def check(cond, label):
        nonlocal ok
        ok = ok and cond
        print(f"  [{'OK' if cond else 'FALHOU'}] {label}")

    with tempfile.TemporaryDirectory() as d:
        src = os.path.join(d, "demo.mp4")
        out = os.path.join(d, "out", "demo-sem-silencios.mp4")
        print("1) A gerar vídeo sintético de 20 s com pausas em 3-4.5 s, 7-7.5 s e 11-13 s...")
        _make_video(src)
        sha_before = _sha256(src)

        print("\n2) Análise com o perfil Equilibrado (-35 dB, 0.7 s, 150 ms)")
        res, _ = run_analyze(src, "equilibrado", False, "free")
        segs = [(s["start"], s["end"]) for s in res["segments"]]
        expected = [(3.15, 4.35), (11.15, 12.85)]
        check(len(segs) == 2, "encontrou as 2 pausas longas e ignorou a de 0,5 s")
        if len(segs) == 2:
            err = max(abs(a - b) for p, q in zip(segs, expected) for a, b in zip(p, q))
            check(err <= 0.1, f"limites com erro <= 100 ms (erro máx. {err * 1000:.0f} ms)")

        print("\n3) Aplicar os cortes")
        r, _ = run_apply(src, out, res["segments"], "free")
        check(os.path.isfile(out), "novo vídeo criado")
        check(r["result"]["avDiffMs"] <= 40, "som e imagem sincronizados (<= 40 ms)")
        check(abs(r["result"]["durationSec"] - 17.1) <= 0.5, "duração final ~17,1 s")
        check(_sha256(src) == sha_before, "vídeo original inalterado (SHA-256 igual)")

        print("\n4) Cancelar o processamento a meio")
        out2 = os.path.join(d, "out", "cancelado.mp4")
        control = JobControl()
        box = {}

        def _run():
            try:
                cutter.apply_cuts(src, out2, res["segments"], "free", control)
                box["r"] = "terminou"
            except errors.JobCancelled:
                box["r"] = "cancelado"
            except Exception as e:  # noqa: BLE001
                box["r"] = repr(e)

        th = threading.Thread(target=_run)
        th.start()
        time.sleep(0.3)
        t0 = time.monotonic()
        control.cancel()
        th.join(10)
        took = time.monotonic() - t0
        if box.get("r") == "terminou":
            print("  (o vídeo de teste é curto e terminou antes do cancelamento; teste inconclusivo)")
        else:
            check(box.get("r") == "cancelado", f"pedido cancelado em {took:.2f}s (<= 2 s)")
            check(not os.path.exists(out2), "nenhum vídeo parcial guardado")
        leftovers = [f for f in os.listdir(os.path.dirname(out)) if f.startswith(".silence-")]
        check(not leftovers, "sem ficheiros temporários deixados para trás")

        print("\n5) Vídeo sem som")
        mute = os.path.join(d, "mudo.mp4")
        _make_video(mute, audio=False)
        try:
            run_analyze(mute, "equilibrado", False, "free", quiet=True)
            check(False, "devia recusar vídeo sem som")
        except errors.JobError as e:
            check(e.kind == "no_audio", f"recusado: {e.message}")

    print("\nRESULTADO:", "TUDO OK" if ok else "HÁ FALHAS")
    return 0 if ok else 1


def queue_test(video):
    """Testa o caminho completo pela fila: publica um pedido de análise e depois de aplicação
    e espera pelas respostas do worker (que tem de estar a correr)."""
    import shutil
    import uuid

    import pika

    import config

    work = os.path.join("/app/images", "silence-test")
    os.makedirs(os.path.join(work, "out"), exist_ok=True)
    src = os.path.join(work, os.path.basename(video))
    if os.path.abspath(video) != os.path.abspath(src):
        shutil.copyfile(video, src)
    out = os.path.join(work, "out", os.path.splitext(os.path.basename(video))[0] + "-sem-silencios.mp4")
    # caminhos relativos, como os que o serviço de projetos usa (./images/...)
    rel = lambda p: "./" + os.path.relpath(p, "/app")  # noqa: E731

    conn = pika.BlockingConnection(pika.ConnectionParameters(
        config.RABBITMQ_HOST, config.RABBITMQ_PORT, "/",
        pika.PlainCredentials(config.RABBITMQ_USER, config.RABBITMQ_PASS)))
    ch = conn.channel()

    def send_and_wait(procedure, parameters, timeout=600):
        job_id = str(uuid.uuid4())
        ch.basic_publish(config.EXCHANGE, config.REQUESTS_QUEUE, json.dumps({
            "messageId": f"cli-{job_id}", "jobId": job_id, "procedure": procedure,
            "userId": None, "userType": "free", "parameters": parameters,
        }), pika.BasicProperties(delivery_mode=2, priority=0))
        print(f"-> pedido {procedure} enviado (job {job_id[:8]}); à espera do worker...")
        t0 = time.monotonic()
        while time.monotonic() - t0 < timeout:
            method, _, body = ch.basic_get(config.RESULTS_QUEUE, auto_ack=False)
            if method is None:
                time.sleep(0.5)
                continue
            msg = json.loads(body)
            if msg.get("jobId") == job_id and msg.get("status") == "progress":
                ch.basic_ack(method.delivery_tag)
                continue
            if msg.get("jobId") != job_id:
                ch.basic_nack(method.delivery_tag, requeue=True)
                time.sleep(0.2)
                continue
            ch.basic_ack(method.delivery_tag)
            print(f"<- resposta: status={msg['status']} em {msg['metadata']['processingTime']} ms")
            return msg
        raise SystemExit("Sem resposta do worker. Está a correr? (docker compose logs silence_removal_tool)")

    res = send_and_wait("silence_analyze", {"inputVideoURI": rel(src), "options": {"profile": "equilibrado"}})
    if res["status"] != "success":
        print("ERRO:", res.get("error"))
        return 1
    out_a = res["output"]
    print(f"   {len(out_a['segments'])} troços, poupança {out_a['savings']['removedSec']}s "
          f"({out_a['savings']['removedPct']}%)")
    if not out_a["segments"]:
        print("   " + out_a.get("message", ""))
        return 0
    res = send_and_wait("silence_apply", {"inputVideoURI": rel(src), "outputVideoURI": rel(out),
                                          "segments": out_a["segments"]})
    if res["status"] != "success":
        print("ERRO:", res.get("error"))
        return 1
    r = res["output"]["result"]
    print(f"   novo vídeo {res['output']['outputVideoURI']}: {r['durationSec']}s, desfasamento {r['avDiffMs']} ms")
    conn.close()
    return 0


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("demo")
    sub.add_parser("queue-test").add_argument("video")
    mk = sub.add_parser("make-test-video")
    mk.add_argument("output")
    mk.add_argument("--pauses", type=int, default=300)
    for name in ("analyze", "apply"):
        sp = sub.add_parser(name)
        sp.add_argument("video")
        if name == "apply":
            sp.add_argument("output")
            sp.add_argument("--segments", help="JSON gravado pelo comando analyze (--save)")
        sp.add_argument("--profile", default="equilibrado", choices=["suave", "equilibrado", "agressivo"])
        sp.add_argument("--music", action="store_true", help="o vídeo tem música de fundo")
        sp.add_argument("--premium", action="store_true", help="aplicar os limites do plano premium")
        if name == "analyze":
            sp.add_argument("--save", help="gravar o resultado da análise neste ficheiro JSON")
    a = p.parse_args()

    try:
        if a.cmd == "demo":
            return demo()
        if a.cmd == "queue-test":
            return queue_test(a.video)
        if a.cmd == "make-test-video":
            make_test_video(a.output, a.pauses)
            return 0
        user = "premium" if a.premium else "free"
        if a.cmd == "analyze":
            res, _ = run_analyze(a.video, a.profile, a.music, user)
            if a.save:
                with open(a.save, "w", encoding="utf-8") as fh:
                    json.dump(res, fh, ensure_ascii=False, indent=2)
                print(f"Análise gravada em {a.save}")
        else:
            if a.segments:
                with open(a.segments, encoding="utf-8") as fh:
                    segs = json.load(fh)["segments"]
            else:
                res, _ = run_analyze(a.video, a.profile, a.music, user)
                segs = res["segments"]
            if not segs:
                print("Não há troços para remover.")
                return 1
            run_apply(a.video, a.output, segs, user)
        return 0
    except errors.JobError as e:
        print(f"\nERRO {e.code} ({e.kind}): {e.message}")
        return 2


if __name__ == "__main__":
    sys.exit(main())
