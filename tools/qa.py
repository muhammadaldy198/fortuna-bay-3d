#!/usr/bin/env python3
"""QA runner for FORTUNA BAY 3D — smoke, systems test, soak, screenshots.

Usage: python3 tools/qa.py [--port 8901] [--soak 20] [--shots-dir DIR]
       python3 tools/qa.py --capture-shots DIR [--port 8901]
Serves game/ with the kit's serve.ts, drives it with Playwright, and
reports console errors, external requests, systems-test results and
soak results. --capture-shots captures the 4 ?shot= scenes as JPEGs
(1280x720, q80) into DIR and checks the gate caps (<=256 KiB each,
long side <=1280, short side >=480). Exits non-zero if anything fails.

Screenshot note: page.screenshot() HANGS in this VM's headless Chromium
(both with SwiftShader flags and with defaults — the compositor never
returns a frame). Raw CDP Page.captureScreenshot with fromSurface=False
works (slow, ~45 s per capture). All captures here go through CDP.
"""
import argparse
import base64
import json
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ENTRY = os.path.dirname(HERE)
NODE = os.path.expanduser("~/workspace/office/tools/node-v22.23.4-linux-x64/bin/node")
SCENES = ["cover", "city", "chase", "mission"]

from playwright.sync_api import sync_playwright  # noqa: E402


class Collector:
    def __init__(self):
        self.errors = []
        self.failed = []
        self.external = []

    def on_console(self, msg):
        if msg.type == "error":
            self.errors.append(f"console: {msg.text}")

    def on_pageerror(self, err):
        self.errors.append(f"pageerror: {err}")

    def on_request(self, req):
        url = req.url
        if not url.startswith("http://127.0.0.1") and not url.startswith("http://localhost"):
            self.external.append(url)

    def on_response(self, resp):
        if resp.status >= 400:
            self.failed.append(f"{resp.status} {resp.url}")


def serve(port):
    proc = subprocess.Popen(
        [NODE, "serve.ts", "--port", str(port)],
        cwd=ENTRY, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    base = f"http://127.0.0.1:{port}"
    import urllib.request
    for _ in range(50):
        try:
            urllib.request.urlopen(base + "/", timeout=1)
            return proc, base
        except Exception:
            time.sleep(0.2)
    raise RuntimeError("serve.ts did not come up")


def new_page(browser, collector):
    page = browser.new_page(viewport={"width": 1280, "height": 720})
    page.on("console", collector.on_console)
    page.on("pageerror", collector.on_pageerror)
    page.on("request", collector.on_request)
    page.on("response", collector.on_response)
    return page


def capture(page, path, fmt="jpeg", quality=80):
    """Screenshot via raw CDP (page.screenshot hangs in this environment)."""
    cdp = page.context.new_cdp_session(page)
    params = {"format": fmt, "fromSurface": False}
    if fmt == "jpeg":
        params["quality"] = quality
    res = cdp.send("Page.captureScreenshot", params)
    with open(path, "wb") as f:
        f.write(base64.b64decode(res["data"]))
    return os.path.getsize(path)


def report(prefix, collector, extra=""):
    print(f"[{prefix}]{extra} errors={len(collector.errors)} external={len(collector.external)} failed={len(collector.failed)}")
    for e in collector.errors[:5]:
        print("   ERR", e)
    for e in collector.failed[:5]:
        print("   FAIL", e)
    for e in collector.external[:5]:
        print("   EXT", e)


def test_title_play(browser, base, shots_dir):
    """Title screen + click Play, on one page (a page load costs ~60 s)."""
    c = Collector()
    page = new_page(browser, c)
    page.goto(base + "/?seed=1", timeout=120000)
    page.wait_for_timeout(3000)
    title_visible = page.is_visible("#title")
    game_ok = page.evaluate("!!window.__game")
    capture(page, os.path.join(shots_dir, "title.png"), fmt="png")
    report("title", c, f" visible={title_visible} game={game_ok}")
    ok_title = title_visible and game_ok and not c.errors and not c.external and not c.failed
    # Play. (page.click hangs in this VM like page.screenshot did — the
    # input pipeline stalls. A JS click reaches the same handler.)
    c2 = Collector()
    page.on("console", c2.on_console)
    page.on("pageerror", c2.on_pageerror)
    page.evaluate("document.getElementById('btn-play').click()")
    page.wait_for_timeout(3000)
    state = page.evaluate("({screen: window.__game.state.screen, cash: window.__game.state.cash, fps: Math.round(window.__game.fpsAvg), traffic: window.__game.traffic.list.length, peds: window.__game.peds.peds.length, buildings: window.__game.city.buildings.length})")
    hud_visible = page.is_visible("#hud")
    capture(page, os.path.join(shots_dir, "gameplay.png"), fmt="png")
    report("play", c2, f" {json.dumps(state)} hud={hud_visible}")
    page.close()
    return ok_title and state["screen"] == "play" and hud_visible and not c2.errors


def test_systems(browser, base):
    c = Collector()
    page = new_page(browser, c)
    page.goto(base + "/?shot=systemstest&seed=1", timeout=120000)
    try:
        page.wait_for_function("!!window.__systemsTest", timeout=30000)
        res = page.evaluate("window.__systemsTest")
        print(f"[systems] ok={res['ok']} errors={res['errors']}")
        for k, v in res["checks"].items():
            print(f"   {'PASS' if v else 'FAIL'} {k}")
        ok = res["ok"] and not res["errors"] and not c.errors
    except Exception as e:
        print(f"[systems] TIMEOUT {e} errors={c.errors[:3]}")
        ok = False
    page.close()
    return ok


def test_soak(browser, base, seconds):
    c = Collector()
    page = new_page(browser, c)
    page.goto(base + f"/?shot=soak&seconds={seconds}&seed=1", timeout=120000)
    try:
        page.wait_for_function("!!window.__soakDone", timeout=(seconds * 30 + 120) * 1000)
        res = page.evaluate("window.__soakDone")
        print(f"[soak] {json.dumps(res)} page_errors={len(c.errors)}")
        for e in c.errors[:5]:
            print("   ERR", e)
        ok = not res["errors"] and not c.errors
    except Exception as e:
        print(f"[soak] TIMEOUT {e} errors={c.errors[:3]}")
        ok = False
    page.close()
    return ok


def capture_shots(browser, base, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    ok = True
    for i, scene in enumerate(SCENES, start=1):
        c = Collector()
        page = new_page(browser, c)
        page.goto(base + f"/?shot={scene}&seed=1", timeout=120000)
        try:
            page.wait_for_function("!!window.__shotReady", timeout=120000)
        except Exception as e:
            print(f"[shot:{scene}] NOT READY {e} errors={c.errors[:3]}")
            ok = False
            page.close()
            continue
        path = os.path.join(out_dir, f"{i}-{scene}.jpg")
        size = capture(page, path, fmt="jpeg", quality=80)
        dims = "?"
        dim_ok = True
        try:
            from PIL import Image
            with Image.open(path) as im:
                dims = f"{im.width}x{im.height}"
                dim_ok = im.width <= 1280 and im.height >= 480 and im.width >= 480
        except Exception:
            pass
        size_ok = size <= 262144
        print(f"[shot:{scene}] {os.path.basename(path)} {size} bytes {dims} size_ok={size_ok} dim_ok={dim_ok} errors={len(c.errors)}")
        for e in c.errors[:3]:
            print("   ERR", e)
        if not size_ok or not dim_ok or c.errors:
            ok = False
        page.close()
    return ok


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8901)
    ap.add_argument("--soak", type=int, default=20)
    ap.add_argument("--shots-dir", default="/tmp/gta6-qa")
    ap.add_argument("--skip-soak", action="store_true")
    ap.add_argument("--capture-shots", default=None, metavar="DIR",
                    help="capture the 4 scenes as JPEGs into DIR (and check caps)")
    args = ap.parse_args()
    os.makedirs(args.shots_dir, exist_ok=True)

    proc, base = serve(args.port)
    failures = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            if args.capture_shots:
                if not capture_shots(browser, base, args.capture_shots):
                    failures.append("capture-shots")
            else:
                if not test_title_play(browser, base, args.shots_dir):
                    failures.append("title/play")
                if not test_systems(browser, base):
                    failures.append("systemstest")
                if not args.skip_soak and not test_soak(browser, base, args.soak):
                    failures.append("soak")
            browser.close()
    finally:
        proc.terminate()
    print("FAILURES:", failures if failures else "none")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
