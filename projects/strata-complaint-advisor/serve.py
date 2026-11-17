"""
Live mode: the advisor screen on your own machine, with your own key.

    set ANTHROPIC_API_KEY=...        (your own key; that account is billed, use a spending limit)
    python serve.py                  then open http://localhost:8757

The page is demo.html. The sample complaints still show their recorded runs;
an edited or new complaint runs live through the same MCP server, intake,
guard and agent loop as the benchmark. Typed complaints are saved masked-at-
read in a temporary folder on this machine and never leave it except as the
masked text sent to the model.
"""
import asyncio
import json
import os
import sys
import tempfile
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

BASE = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE))
sys.path.insert(0, str(BASE / "build"))
PORT = int(os.environ.get("STRATA_PORT", "8757"))
MODEL = os.environ.get("STRATA_MODEL", "claude-haiku-5-5")
LIVE_DIR = Path(tempfile.mkdtemp(prefix="strata-live-"))
RUN_DIR = LIVE_DIR / "logs"


class Engine:
    """One MCP stdio session and one Anthropic client, on a background event loop."""

    def __init__(self):
        self.loop = asyncio.new_event_loop()
        threading.Thread(target=self.loop.run_forever, daemon=True).start()
        self.ready = asyncio.run_coroutine_threadsafe(self._start(), self.loop)
        self.cases = {}

    async def _start(self):
        import anthropic
        from mcp import ClientSession, StdioServerParameters
        from mcp.client.stdio import stdio_client
        from agent import to_anthropic_tools

        env = dict(os.environ, PYTHONIOENCODING="utf-8", HF_HUB_OFFLINE="1", STRATA_RUN_DIR=str(RUN_DIR),
                   STRATA_LIVE_DIR=str(LIVE_DIR))
        env.pop("ANTHROPIC_API_KEY", None)          # the MCP server never sees the key
        params = StdioServerParameters(command=sys.executable, args=[str(BASE / "mcp_server.py")], env=env)
        self._cm = stdio_client(params)
        r, w = await self._cm.__aenter__()
        self._sm = ClientSession(r, w)
        self.session = await self._sm.__aenter__()
        await self.session.initialize()
        self.tools = to_anthropic_tools((await self.session.list_tools()).tools)
        self.client = anthropic.AsyncAnthropic(max_retries=3)

    def run(self, coro):
        self.ready.result(timeout=300)
        return asyncio.run_coroutine_threadsafe(coro, self.loop).result(timeout=600)

    async def _review(self, cid, follow_up=None):
        from agent import run_case
        from build_demo import steps_from_log
        log = RUN_DIR / f"{cid}.jsonl"
        if log.exists():
            log.unlink()
        res = await run_case(self.session, self.client, MODEL, cid, self.tools, follow_up=follow_up)
        lines = [json.loads(l) for l in log.read_text(encoding="utf-8").splitlines()] if log.exists() else []
        steps, guidance, note, reply = steps_from_log(lines)
        out = {"id": cid, "model": MODEL if res["model_calls"] else None, "turns": res["turns"], "tool_calls": res["tool_calls"],
               "cost_usd": res["cost_usd"], "steps": steps, "guidance": dict(guidance, draft_reply=reply) if guidance else None,
               "note": note, "run": "live"}
        if res["outcome"] == "retries_exhausted":
            out["message"] = (res.get("result") or {}).get("message")
        if follow_up:
            g = out["guidance"] or {}
            out["answer"] = g.get("answer") or "No answer was recorded."
        return out

    def review(self, unit, text, facts, source_unit):
        cid = "LIVE-" + uuid.uuid4().hex[:10]
        (LIVE_DIR / f"{cid}.json").write_text(json.dumps({
            "id": cid, "title": "Officer's complaint", "date": time.strftime("%Y-%m-%d"), "unit": unit, "channel": "Officer",
            "text": text, "facts": facts, "source_unit": source_unit}, ensure_ascii=False), encoding="utf-8")
        return self.run(self._review(cid))

    def follow_up(self, cid, question):
        return self.run(self._review(cid, follow_up=question))


ENGINE = None


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body, ctype="application/json"):
        data = body if isinstance(body, bytes) else json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype + "; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/api/health":
            return self._send(200, {"ok": True, "model": MODEL})
        name = {"/": "demo.html", "/demo.html": "demo.html", "/documents.html": "documents.html"}.get(path)
        if not name:
            return self._send(404, {"error": "not found"})
        self._send(200, (BASE / name).read_bytes(), "text/html")

    def do_POST(self):
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
            if self.path == "/api/review":
                text = str(body.get("text") or "").strip()
                if not text:
                    return self._send(200, {"error": "Type the complaint first."})
                return self._send(200, ENGINE.review(str(body.get("unit") or ""), text[:4000], str(body.get("facts") or "")[:2000],
                                                     str(body.get("source_unit") or "")[:20]))
            if self.path == "/api/followup":
                cid = str(body.get("id") or "")
                if not cid.startswith("LIVE-"):
                    return self._send(200, {"error": "Run the complaint live first (edit it and review again), then ask."})
                return self._send(200, ENGINE.follow_up(cid, str(body.get("question") or "")[:1000]))
            self._send(404, {"error": "not found"})
        except Exception as e:
            self._send(200, {"error": f"{type(e).__name__}: {e}"[:300]})

    def log_message(self, *a):
        pass


def main():
    global ENGINE
    if not os.environ.get("ANTHROPIC_API_KEY"):
        sys.exit("Set ANTHROPIC_API_KEY to your own key first. That account is billed: use a key with a spending limit.")
    if not (BASE / "demo.html").exists():
        sys.exit("demo.html is missing: run python build/build_demo.py --run <run_id> first.")
    ENGINE = Engine()
    print(f"Strata Complaint Advisor, live on http://localhost:{PORT} with {MODEL} (Ctrl+C to stop)")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
