"""Testes de robustez da remoção de silêncios (parte 4 do UC-VID-001).

Correr na pasta `projeto`, com o sistema a correr (docker compose up -d):
    python Tools/silence_removal/tests/e2e_robustness.py [--skip-crash] [--skip-300]

Gera os próprios vídeos de teste (dentro do contentor silence_removal_tool) e verifica:
  1. 300 troços: análise de um vídeo com 300 pausas (conta premium) e tempo de análise.
  2. Serviço morre a meio do processamento: o pedido passa a "falhado", a operação é devolvida,
     e ao reiniciar o serviço o pedido não é repetido (DQ-004 / REQ-VID-SIL-031).
  3. Apagar o vídeo apaga também a revisão guardada (REQ-VID-SIL-026).
  4. Não ficam ficheiros temporários (A6 / REQ-VID-SIL-024).

O passo 2 para e volta a arrancar o contentor silence_removal_tool e demora cerca de 2 minutos.
"""
import argparse
import os
import secrets
import subprocess
import sys
import tempfile
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from e2e_api import Api, check, multipart, wait_status  # noqa: E402
import e2e_api  # noqa: E402


def sh(*args, check_rc=True):
    r = subprocess.run(list(args), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                       encoding="utf-8", errors="replace")
    if check_rc and r.returncode != 0:
        raise SystemExit(f"Comando falhou: {' '.join(args)}\n{r.stdout}")
    return r.stdout


def compose(*args, check_rc=True):
    return sh("docker", "compose", *args, check_rc=check_rc)


def make_video(name, pauses=None, demo=False, size="640x360"):
    """Cria um vídeo no contentor e copia-o para uma pasta temporária local."""
    remote = f"/tmp/{name}"
    if demo:
        code = f"import cli; cli._make_video('{remote}')"
    else:
        code = f"import cli; cli.make_test_video('{remote}', {pauses}, size='{size}')"
    compose("exec", "-T", "silence_removal_tool", "python", "-c", code)
    local = os.path.join(tempfile.gettempdir(), name)
    compose("cp", f"silence_removal_tool:{remote}", local)
    compose("exec", "-T", "silence_removal_tool", "rm", "-f", remote)
    return local


def new_user(api, user_type):
    email = f"silence-rob-{secrets.token_hex(4)}@example.test"
    st, reg, _ = api.call("POST", "/users", {"name": "Teste Robustez", "email": email,
                                             "password": secrets.token_urlsafe(12), "type": user_type})
    if st != 201:
        raise SystemExit(f"Não foi possível criar utilizador de teste ({st}): {reg}")
    api.token = reg["jwt"]
    return reg["user"]["_id"], reg["user"].get("remaining_operations")


def new_project_with_video(api, uid, video):
    _, proj, _ = api.call("POST", f"/projects/{uid}", {"name": "Teste robustez silêncios"})
    pid = proj["_id"]
    _, proj, _ = api.call("GET", f"/projects/{uid}/{pid}")
    with open(video, "rb") as fh:
        body, ctype = multipart("image", os.path.basename(video), fh.read(), "video/mp4")
    st, resp, _ = api.call("POST", f"/projects/{uid}/{pid}/img", raw=body, content_type=ctype,
                           headers={"X-Project-Version": str(proj.get("version", 0))})
    if st not in (200, 201, 204):
        raise SystemExit(f"Upload falhou ({st}): {resp}")
    _, proj, _ = api.call("GET", f"/projects/{uid}/{pid}")
    return pid, proj["imgs"][0]["_id"], proj


def mongo_count(img_id):
    out = compose("exec", "-T", "projects_mongoDB", "mongo", "--quiet", "--port", "27018", "project", "--eval",
                  f"db.silencejobs.count({{img_id: ObjectId('{img_id}')}})")
    return int(out.strip().splitlines()[-1])


def temp_files(uid):
    out = compose("exec", "-T", "projects", "sh", "-c",
                  f"find ./images/users/{uid} -path '*silence*' -type f 2>/dev/null | wc -l")
    return int(out.strip().splitlines()[-1])


def test_300(base):
    print("\n1) Vídeo com 300 pausas (conta Premium)")
    video = make_video("silence-300-pausas.mp4", pauses=300)
    print(f"     {os.path.getsize(video) / 1024 / 1024:.1f} MB")
    api = Api(base)
    uid, _ = new_user(api, "premium")
    pid, img, _ = new_project_with_video(api, uid, video)
    S = f"/projects/{uid}/{pid}/silence/{img}"
    t0 = time.time()
    st, _, _ = api.call("POST", S + "/analyze", {"options": {"profile": "equilibrado"}})
    check(st == 202, "análise aceite")
    s = wait_status(api, S, ("analyzed", "failed"), timeout=300)
    took = time.time() - t0
    if check(s["status"] == "analyzed", f"análise concluída em {took:.1f} s {s.get('error') or ''}"):
        n = len(s["analysis"]["segments"])
        dur = s["analysis"]["video"]["durationSec"]
        check(n == 300, f"300 troços encontrados ({n})")
        check(took <= 0.1 * dur + 5, f"tempo de análise <= 0,1x a duração ({took:.1f} s para {dur:.0f} s; REQ-028)")
    print(f"     Para testar a revisão com 300 troços no browser, entra com a conta deste teste: projeto {pid}")
    os.remove(video)
    return uid


def test_crash(base):
    print("\n2) O serviço morre a meio do processamento")
    # 1080p para o processamento demorar o suficiente para o parar a meio
    video = make_video("silence-robustez.mp4", pauses=40, size="1920x1080")
    api = Api(base)
    uid, ops_before = new_user(api, "free")
    pid, img, _ = new_project_with_video(api, uid, video)
    os.remove(video)
    S = f"/projects/{uid}/{pid}/silence/{img}"

    api.call("POST", S + "/analyze", {"options": {"profile": "equilibrado"}})
    s = wait_status(api, S, ("analyzed", "failed"))
    if not check(s["status"] == "analyzed" and s["analysis"]["segments"], "análise concluída"):
        return uid
    st, s, _ = api.call("POST", S + "/apply", {})
    check(st == 202, "aplicação aceite (1 operação reservada)")
    _, me, _ = api.call("GET", f"/users/{uid}")
    check(me.get("remaining_operations") == ops_before - 1, f"operação reservada ({me.get('remaining_operations')})")

    s = wait_status(api, S, ("processing", "completed", "failed"), timeout=60)
    if s["status"] != "processing":
        print("     (o processamento terminou antes de ser possível parar o serviço; teste inconclusivo)")
        return uid
    print("     a parar o contentor silence_removal_tool a meio...")
    compose("kill", "silence_removal_tool")
    t0 = time.time()
    s = wait_status(api, S, ("failed", "completed"), timeout=240)
    check(s["status"] == "failed", f"pedido marcado como falhado ao fim de {time.time() - t0:.0f} s")
    if s.get("error"):
        print(f"     mensagem: {s['error'].get('message')}")
    _, me, _ = api.call("GET", f"/users/{uid}")
    check(me.get("remaining_operations") == ops_before, f"operação devolvida ({me.get('remaining_operations')})")
    check(len(s.get("review") or []) > 0, "revisão mantida para tentar de novo")

    print("     a voltar a arrancar o serviço...")
    compose("start", "silence_removal_tool")
    time.sleep(12)
    logs = compose("logs", "--since", "1m", "silence_removal_tool", check_rc=False)
    check("não é repetido" in logs or "espera de pedidos" in logs, "serviço voltou a arrancar")
    _, s, _ = api.call("GET", S)
    check(s["status"] == "failed", "o pedido interrompido não foi repetido automaticamente (DQ-004)")

    print("     tentar de novo depois do reinício")
    st, _, _ = api.call("POST", S + "/apply", {})
    s = wait_status(api, S, ("completed", "failed"), timeout=300)
    check(s["status"] == "completed", "nova tentativa concluída")
    return uid, pid, img, api


def test_delete(api, uid, pid, img):
    print("\n3) Apagar o vídeo apaga a revisão guardada")
    check(mongo_count(img) == 1, "revisão existe antes de apagar")
    _, proj, _ = api.call("GET", f"/projects/{uid}/{pid}")
    st, _, _ = api.call("DELETE", f"/projects/{uid}/{pid}/img/{img}",
                        headers={"X-Project-Version": str(proj["version"])})
    check(st in (200, 204), f"vídeo apagado ({st})")
    time.sleep(2)
    check(mongo_count(img) == 0, "revisão apagada")
    st, r, _ = api.call("GET", f"/projects/{uid}/{pid}/silence/{img}")
    check(st == 404, "o estado já não existe (404)")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--base", default="https://localhost:8080/api-gateway")
    p.add_argument("--skip-crash", action="store_true")
    p.add_argument("--skip-300", action="store_true")
    a = p.parse_args()

    if "silence_removal_tool" not in compose("ps", "--services", "--status", "running"):
        raise SystemExit("O contentor silence_removal_tool não está a correr. Corre: docker compose up -d")

    users = []
    if not a.skip_300:
        users.append(test_300(a.base))
    if not a.skip_crash:
        r = test_crash(a.base)
        if isinstance(r, tuple):
            uid, pid, img, api = r
            users.append(uid)
            test_delete(api, uid, pid, img)
        else:
            users.append(r)

    print("\n4) Ficheiros temporários")
    time.sleep(6)
    for uid in users:
        check(temp_files(uid) == 0, f"nenhum ficheiro de trabalho esquecido (utilizador {uid[-6:]})")

    print("\nRESULTADO:", "TUDO OK" if e2e_api.ok_all else "HÁ FALHAS")
    return 0 if e2e_api.ok_all else 1


if __name__ == "__main__":
    sys.exit(main())
