"""Prepara um teste manual da interface da remoção de silêncios (parte 3 do UC-VID-001).

Cria uma conta de teste (free ou premium), um projeto e faz upload do vídeo indicado.
No fim mostra o email e a password de teste e o endereço do projeto para abrir no browser.

    python Tools/silence_removal/tests/prepare_ui_test.py C:\\videos\\teste.mp4 [--premium]

Só usa a biblioteca padrão do Python. O sistema tem de estar a correr (docker compose up).
"""
import argparse
import json
import os
import secrets
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from e2e_api import Api, multipart  # noqa: E402


def main():
    p = argparse.ArgumentParser()
    p.add_argument("video")
    p.add_argument("--premium", action="store_true", help="criar a conta no plano premium")
    p.add_argument("--base", default="https://localhost:8080/api-gateway")
    p.add_argument("--save", help="gravar os dados da conta de teste neste ficheiro JSON")
    a = p.parse_args()

    api = Api(a.base)
    email = f"silence-ui-{secrets.token_hex(4)}@example.test"
    password = "Teste-" + secrets.token_hex(4)
    user_type = "premium" if a.premium else "free"

    st, reg, _ = api.call("POST", "/users", {"name": "Teste Silêncios", "email": email,
                                             "password": password, "type": user_type})
    if st != 201:
        print(f"Não foi possível criar a conta de teste ({st}): {reg}")
        return 1
    api.token = reg["jwt"]
    uid = reg["user"]["_id"]

    st, proj, _ = api.call("POST", f"/projects/{uid}", {"name": "Teste remoção de silêncios"})
    if st != 201:
        print(f"Não foi possível criar o projeto ({st}): {proj}")
        return 1
    pid = proj["_id"]
    _, proj, _ = api.call("GET", f"/projects/{uid}/{pid}")
    with open(a.video, "rb") as fh:
        body, ctype = multipart("image", os.path.basename(a.video), fh.read(), "video/mp4")
    st, resp, _ = api.call("POST", f"/projects/{uid}/{pid}/img", raw=body, content_type=ctype,
                           headers={"X-Project-Version": str(proj.get("version", 0))})
    if st not in (200, 201, 204):
        print(f"Upload do vídeo falhou ({st}): {resp}")
        return 1

    info = {"email": email, "password": password, "type": user_type, "userId": uid, "projectId": pid,
            "url": f"https://localhost:8080/dashboard/{pid}"}
    if a.save:
        with open(a.save, "w", encoding="utf-8") as fh:
            json.dump(info, fh, indent=2)
        print(f"Conta de teste criada; dados gravados em {a.save}")
    else:
        print("Conta de teste criada (só existe na tua base de dados local):")
        print(f"  email:    {email}")
        print(f"  password: {password}")
        print(f"  plano:    {user_type}")
    print(f"Projeto com o vídeo: {info['url']}")
    print("Entra em https://localhost:8080/login com estes dados e abre o projeto.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
