"""Minimal PictuRAS client that only uses the public API (nginx -> api_gateway, ws_gateway)."""
import os
import threading
import time
import uuid

import requests
import socketio
import urllib3

urllib3.disable_warnings()
BASE = os.environ.get("PICTURAS_URL", "https://localhost:8080")
API = BASE + "/api-gateway"


class Client:
    def __init__(self, log):
        self.s = requests.Session()
        self.s.verify = False
        self.log = log  # callable(event:str, **fields)
        self.uid = self.token = None
        self.sio = None

    # -- auth -----------------------------------------------------------
    def register(self, kind="premium"):
        email = f"bench-{uuid.uuid4().hex[:10]}@bench.test"
        r = self.s.post(f"{API}/users/", json={"name": "bench", "email": email,
                                               "password": "bench-pass-123", "type": kind})
        r.raise_for_status()
        d = r.json()
        self.uid, self.token = d["user"]["_id"], d["jwt"]
        self.s.headers["Authorization"] = f"Bearer {self.token}"
        return self

    def connect_socket(self):
        sio = socketio.Client(ssl_verify=False, reconnection=True)
        for ev in ("video-progress", "process-update", "process-error",
                   "preview-ready", "preview-error", "authError"):
            sio.on(ev, (lambda name: lambda data=None: self.log(name, data=data))(ev))
        sio.connect(BASE, transports=["websocket"], auth={"token": self.token})
        self.sio = sio
        return self

    def close(self):
        if self.sio:
            self.sio.disconnect()

    # -- projects -------------------------------------------------------
    def create_project(self, name):
        r = self.s.post(f"{API}/projects/{self.uid}", json={"name": name})
        r.raise_for_status()
        d = r.json()
        return d["_id"], d["version"]

    def upload(self, pid, version, path):
        video = path.lower().endswith((".mp4", ".mov", ".webm"))
        with open(path, "rb") as f:
            r = self.s.post(f"{API}/projects/{self.uid}/{pid}/{'video' if video else 'img'}",
                            files={"video" if video else "image": (os.path.basename(path), f)},
                            headers={"X-Project-Version": str(version)})
        r.raise_for_status()
        return int(r.headers.get("x-project-version", version))

    def get_project(self, pid):
        r = self.s.get(f"{API}/projects/{self.uid}/{pid}")
        r.raise_for_status()
        return r.json()

    def add_tool(self, pid, version, position, procedure, params):
        r = self.s.post(f"{API}/projects/{self.uid}/{pid}/tool",
                        json={"position": position, "procedure": procedure, "params": params},
                        headers={"X-Project-Version": str(version), "X-Op-Id": str(uuid.uuid4())})
        r.raise_for_status()
        return int(r.headers.get("x-project-version", version))

    def process(self, pid, version):
        r = self.s.post(f"{API}/projects/{self.uid}/{pid}/process",
                        json={"runnerUserId": self.uid},
                        headers={"X-Project-Version": str(version)})
        return r
