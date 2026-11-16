"""Teste ponta-a-ponta da remoção de silêncios através da API (parte 2 do UC-VID-001).

Precisa do sistema a correr (docker compose up) e de um vídeo MP4 com som:
    python Tools/silence_removal/tests/e2e_api.py <video.mp4> [--base https://localhost:8080/api-gateway]

Cria um utilizador de teste free, um projeto, faz upload do vídeo e percorre o fluxo:
analisar -> rever -> aplicar -> confirmar o novo vídeo, mais cancelamentos e casos de erro.
Só usa a biblioteca padrão do Python.
"""
import argparse
import json
import os
import secrets
import ssl
import sys
import time
import urllib.error
import urllib.request

CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE  # certificado autoassinado do ambiente local

ok_all = True


def check(cond, label):
    global ok_all
    ok_all = ok_all and bool(cond)
    print(f"  [{'OK' if cond else 'FALHOU'}] {label}")
    return cond


class Api:
    def __init__(self, base):
        self.base = base.rstrip("/")
        self.token = None

    def call(self, method, path, body=None, headers=None, raw=None, content_type=None):
        h = {"Accept": "application/json"}
        if self.token:
            h["Authorization"] = f"Bearer {self.token}"
        data = None
        if raw is not None:
            data = raw
            h["Content-Type"] = content_type
        elif body is not None:
            data = json.dumps(body).encode()
            h["Content-Type"] = "application/json"
        h.update(headers or {})
        req = urllib.request.Request(self.base + path, data=data, method=method, headers=h)
        try:
            with urllib.request.urlopen(req, context=CTX, timeout=120) as r:
                txt = r.read().decode() or "null"
                return r.status, json.loads(txt) if txt.strip()[:1] in "[{\"n" else txt, dict(r.headers)
        except urllib.error.HTTPError as e:
            txt = e.read().decode() or "null"
            try:
                return e.code, json.loads(txt), dict(e.headers)
            except ValueError:
                return e.code, txt, dict(e.headers)


def multipart(field, filename, content, ctype):
    boundary = "----silence" + secrets.token_hex(8)
    head = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"{field}\"; filename=\"{filename}\"\r\n"
            f"Content-Type: {ctype}\r\n\r\n").encode()
    return head + content + f"\r\n--{boundary}--\r\n".encode(), f"multipart/form-data; boundary={boundary}"


def wait_status(api, path, wanted, timeout=180):
    t0 = time.time()
    last = None
    while time.time() - t0 < timeout:
        _, st, _ = api.call("GET", path)
        if st.get("status") != last:
            print(f"     estado: {st.get('status')} {st.get('progress', '')}%")
            last = st.get("status")
        if st.get("status") in wanted:
            return st
        time.sleep(1)
    return st


def main():
    p = argparse.ArgumentParser()
    p.add_argument("video")
    p.add_argument("--base", default="https://localhost:8080/api-gateway")
    a = p.parse_args()
    api = Api(a.base)
    name = os.path.basename(a.video)

    print("1) Utilizador de teste, projeto e upload do vídeo")
    email = f"silence-test-{secrets.token_hex(4)}@example.test"
    st, reg, _ = api.call("POST", "/users", {"name": "Teste Silêncios", "email": email,
                                             "password": secrets.token_urlsafe(12), "type": "free"})
    if not check(st == 201, f"utilizador free criado ({st})"):
        return 1
    api.token = reg["jwt"]
    uid = reg["user"]["_id"]
    ops_before = reg["user"].get("remaining_operations")

    st, proj, _ = api.call("POST", f"/projects/{uid}", {"name": "Teste remoção de silêncios"})
    check(st == 201, "projeto criado")
    pid = proj["_id"]
    _, proj, _ = api.call("GET", f"/projects/{uid}/{pid}")
    with open(a.video, "rb") as fh:
        body, ctype = multipart("image", name, fh.read(), "video/mp4")
    st, _, _ = api.call("POST", f"/projects/{uid}/{pid}/img", raw=body, content_type=ctype,
                        headers={"X-Project-Version": str(proj.get("version", 0))})
    check(st in (200, 201, 204), f"upload do vídeo ({st})")
    _, proj, _ = api.call("GET", f"/projects/{uid}/{pid}")
    img = proj["imgs"][0]["_id"]
    S = f"/projects/{uid}/{pid}/silence/{img}"

    print("\n2) Estado inicial e validação das opções")
    st, s, _ = api.call("GET", S)
    check(st == 200 and s["status"] == "none", "sem análise ainda")
    check(s["profiles"]["agressivo"] == {"thresholdDb": -30, "minPauseSec": 0.4, "marginMs": 80}, "perfis disponíveis")
    analyses_before = (s.get("analyses") or {}).get("remaining")
    print(f"     análises restantes hoje: {analyses_before}")
    st, s, _ = api.call("POST", S + "/analyze", {"options": {"thresholdDb": -70}})
    check(st == 400 and s.get("code") == "INVALID_OPTIONS", f"valor fora do intervalo recusado: {s.get('message')}")

    print("\n3) Analisar (perfil Equilibrado)")
    st, s, _ = api.call("POST", S + "/analyze", {"options": {"profile": "equilibrado"}})
    check(st == 202, f"análise aceite em fila ({st})")
    s = wait_status(api, S, ("analyzed", "failed"))
    if not check(s["status"] == "analyzed", f"análise concluída {s.get('error') or ''}"):
        return 1
    segs = s["analysis"]["segments"]
    print(f"     {len(segs)} troços; poupança {s['savings']}")
    check(len(s["analysis"]["waveform"]) > 0, "linha temporal do áudio presente")
    check(len(s["review"]) == len(segs) and all(r["selected"] for r in s["review"]), "revisão inicial com todos marcados")
    st, s2, _ = api.call("GET", S)
    check((s2.get("analyses") or {}).get("remaining") == (analyses_before - 1 if analyses_before is not None else None),
          "análise contada no limite diário")
    if not segs:
        print("     (vídeo sem pausas detetadas; o resto do teste precisa de pelo menos 1 troço)")
        return 0 if ok_all else 1

    print("\n4) Revisão manual")
    review = [{"start": x["start"], "end": x["end"], "selected": True} for x in segs]
    if len(review) > 1:
        bad = [dict(review[0]), {"start": review[0]["start"], "end": review[0]["end"] + 0.1, "selected": True}]
        st, r, _ = api.call("PUT", S + "/review", {"segments": bad})
        check(st == 400 and r.get("code") == "INVALID_SEGMENTS", f"troços sobrepostos recusados: {r.get('message')}")
    st, r, _ = api.call("PUT", S + "/review", {"segments": [dict(x, selected=False) for x in review]})
    check(st == 200 and r["savings"]["removedSec"] == 0, "desmarcar tudo -> poupança 0")
    st, r, _ = api.call("POST", S + "/apply", {})
    check(st == 400 and r.get("code") == "NO_SEGMENTS_SELECTED", "aplicar sem troços é recusado")
    dur = s["analysis"]["video"]["durationSec"]
    st, r, _ = api.call("POST", S + "/apply", {"segments": [{"start": 0, "end": round(dur * 0.9, 3)}]})
    check(st == 409 and r.get("code") == "CONFIRM_LARGE_REMOVAL", f"remover >80% pede confirmação ({r.get('removedPct')}%)")
    st, r, _ = api.call("PUT", S + "/review", {"segments": review})
    check(st == 200, "revisão restaurada")

    print("\n5) Aplicar e cancelar a meio (a operação é devolvida)")
    st, r, _ = api.call("POST", S + "/apply", {})
    check(st == 202, "aplicação aceite")
    st, r, _ = api.call("POST", S + "/cancel")
    check(st == 200 and r["status"] == "analyzed" and len(r["review"]) == len(review),
          "cancelado: volta à revisão com os troços intactos")
    _, me, _ = api.call("GET", f"/users/{uid}")
    check(me.get("remaining_operations") == ops_before, f"operação devolvida ({me.get('remaining_operations')})")

    print("\n6) Aplicar os cortes até ao fim")
    st, r, _ = api.call("POST", S + "/apply", {})
    check(st == 202, "aplicação aceite")
    s = wait_status(api, S, ("completed", "failed"), timeout=600)
    if check(s["status"] == "completed", f"novo vídeo gerado {s.get('error') or ''}"):
        res = s["result"]
        print(f"     {res['name']}: {res['originalSec']}s -> {res['finalSec']}s "
              f"(menos {res['removedSec']}s, {res['removedPct']}%), desfasamento {res['avDiffMs']} ms")
        _, imgs, _ = api.call("GET", f"/projects/{uid}/{pid}/imgs")
        names = [i["name"] for i in imgs]
        check(res["name"] in names and name in names, f"projeto tem o original e o novo vídeo {names}")
        _, me, _ = api.call("GET", f"/users/{uid}")
        check(me.get("remaining_operations") == ops_before - 1, f"1 operação descontada ({me.get('remaining_operations')})")

    print("\n7) Analisar de novo depois de ajustes manuais")
    api.call("PUT", S + "/review", {"segments": [dict(review[0], selected=False)] + review[1:]})
    st, r, _ = api.call("POST", S + "/analyze", {"options": {"profile": "agressivo"}})
    check(st == 409 and r.get("code") == "REVIEW_WILL_BE_LOST", "aviso de que os ajustes se perdem")
    st, r, _ = api.call("POST", S + "/analyze", {"options": {"profile": "agressivo"}, "confirmDiscard": True})
    check(st == 202, "após confirmação a análise é aceite")
    st, r, _ = api.call("POST", S + "/cancel")
    check(st == 200 and r["status"] == "none", "cancelar a análise volta às opções")

    print("\nRESULTADO:", "TUDO OK" if ok_all else "HÁ FALHAS")
    print(f"(projeto de teste: {pid} do utilizador {email})")
    return 0 if ok_all else 1


if __name__ == "__main__":
    sys.exit(main())
