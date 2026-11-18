"""Static check of the image tools' error replies (Fiabilidade, DA-R5 part 1).

In every send_msg(..., 'error', ...) call, the error code, message and original image must
land on err_code, err_msg and og_img_uri. Positional error arguments used to be shifted onto
`type`, which made ToolMSG raise instead of replying. The tools' sources are not inside the
video image, so this test runs on the host (Tools/video/.venv) and is skipped in the container.
"""
import ast
import glob
import os

import pytest

TOOLS = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
# only in a checkout: in the container this path is "/", which holds no tool sources
IN_CHECKOUT = os.path.isdir(os.path.join(TOOLS, "utils")) and os.path.isdir(os.path.join(TOOLS, "border"))
SOURCES = sorted(p for p in glob.glob(os.path.join(TOOLS, "*", "*.py"))
                 if IN_CHECKOUT and os.path.basename(os.path.dirname(p)) not in ("utils", "video"))
# ToolMSG.send_msg signature, in order
PARAMS = ["msg_id", "resp_msg_id", "timestamp", "status", "processingTime", "new_img_uri",
          "type", "err_code", "err_msg", "og_img_uri"]

pytestmark = pytest.mark.skipif(not SOURCES, reason="tool sources not available (container)")


def error_calls():
    for path in SOURCES:
        for node in ast.walk(ast.parse(open(path, encoding="utf-8").read())):
            if (isinstance(node, ast.Call) and getattr(node.func, "attr", "") == "send_msg"
                    and len(node.args) > 3 and isinstance(node.args[3], ast.Constant)
                    and node.args[3].value == "error"):
                yield os.path.relpath(path, TOOLS), node


def test_every_error_reply_binds_its_error_arguments_correctly():
    calls = list(error_calls())
    assert len(calls) == 30            # 2 per tool in the 15 image tools
    bad = []
    for path, node in calls:
        bound = dict(zip(PARAMS, (ast.unparse(a) for a in node.args)))
        bound.update({k.arg: ast.unparse(k.value) for k in node.keywords})
        missing = [p for p in ("err_code", "err_msg", "og_img_uri") if bound.get(p, "None") == "None"]
        code_as_type = bound.get("type", "").startswith("self._codes")
        if missing or code_as_type or len(node.args) > len(PARAMS):
            bad.append(f"{path}:{node.lineno}")
    assert bad == []
