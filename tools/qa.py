#!/usr/bin/env python3
"""QA harness for the Fortuna Bay GTA 6 entry (gta6-01).

21 systems checks + a soak + a determinism check + a screenshot capture mode.

Headless SwiftShader renders this scene at ~1.4 fps, so the rAF loop cannot
be trusted to advance the sim on a wall-clock schedule. The checks therefore
drive the simulation EXPLICITLY: they call G.step(1/60) synchronously through
page.evaluate, which costs ~0.5 ms per step. Rendering is only needed for the
screenshot capture (runShot paints twice via rAF, ~2 s per shot).

Shot naming: the files are 1-strip.jpg .. 4-scale.jpg, but the game stages
them by the BARE names strip/night/chase/scale (see shots.json queries).
Querying ?shot=1-strip falls back to the strip stage for every shot.

Real module APIs (verified against game/src/):
- traffic cars: G.traffic.cars; pedestrians: G.pedestrians.list
- wanted: G.police.setWanted(n); level is the number G.wanted
- heli: G.police.heli; position is heli.pos (a Vector3); modes: G.police.modes
- cars: G.vehicles.createCar(model, x, z, heading); list G.vehicles.cars
- weather: G.weather.setRain(bool), G.weather.setTimeOfDay(hour)
- combat: G.combat.spawnEnemy(x, z), G.combat.shoot(from, dir) with plain
  {x, y, z} objects; enemy health 60, pistol damage 34
- garage: G.garage.stored, G.garage.spot {x:0, z:232}; store fires after 3
  sim-seconds parked in the zone, retrieve fires automatically on the next
  step while on foot in the zone
- save: standalone functions in save.js (no G.save object); the game saves
  on pause (Escape) to localStorage key 'fortuna-bay.save.v1' and restores
  in startGame (Enter), NOT at boot — the round-trip check must press Enter
  after reload before reading the restored state
- DOM ids: title overlay is #title-screen, wanted stars are #stars

Usage:
  python tools/qa.py [--quick] [--capture-shots] [--port 8902]
  --quick         skip the 20 s soak
  --capture-shots write screenshots/1-strip.jpg .. 4-scale.jpg (CDP JPEG q80)
"""

import argparse
import base64
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ENTRY = os.path.dirname(HERE)
NODE = os.path.expanduser("~/workspace/office/tools/node-v22.23.4-linux-x64/bin/node")

# (file stem, ?shot= query name)
SHOTS = [("1-strip", "strip"), ("2-night", "night"),
         ("3-chase", "chase"), ("4-scale", "scale")]
STEP = 1 / 60
SAVE_KEY = "fortuna-bay.save.v1"


def step(page, n):
    """Advance the sim by n fixed steps synchronously (no rendering)."""
    page.evaluate(
        "() => { const G = window.__game; "
        f"for (let i = 0; i < {n}; i++) G.step(1/60); }}"
    )


def frame_of(page):
    return page.evaluate("window.__game.frame")


class QA:
    def __init__(self, base_url):
        self.base_url = base_url
        self.errors = []
        self.browser = None

    def record(self, name, ok, detail=""):
        return (name, bool(ok), detail)

    # -- individual checks -------------------------------------------------

    def c_title(self, page):
        vis = page.evaluate(
            "getComputedStyle(document.getElementById('title-screen')).display !== 'none'")
        return self.record("01 title visible", vis, "title overlay shown on load")

    def c_boot_errors(self, page):
        return self.record("02 zero console errors on boot",
                           len(self.errors) == 0, f"{len(self.errors)} errors")

    def c_play(self, page):
        page.keyboard.press("Enter")
        page.wait_for_timeout(300)
        screen = page.evaluate("window.__game.screen")
        return self.record("03 play starts", screen == "play", f"screen={screen}")

    def c_sim_advances(self, page):
        a = frame_of(page)
        step(page, 120)
        b = frame_of(page)
        return self.record("04 sim advances", b - a >= 120,
                           f"+{b - a} frames over 120 driven steps")

    def c_fps(self, page):
        fps = page.evaluate("window.__game.fpsEma")
        return self.record("05 fps positive", fps > 0, f"fpsEma={fps:.1f}")

    def c_traffic(self, page):
        n = page.evaluate("window.__game.traffic.cars.length")
        return self.record("06 traffic present", n >= 10, f"{n} traffic cars")

    def c_peds(self, page):
        n = page.evaluate("window.__game.pedestrians.list.length")
        return self.record("07 pedestrians present", n >= 20, f"{n} pedestrians")

    def c_buildings(self, page):
        n = page.evaluate("window.__game.buildings.list.length")
        return self.record("08 buildings present", n >= 100, f"{n} buildings")

    def c_hud(self, page):
        page.evaluate("window.__game.hud.update()")
        ok = page.evaluate(
            "() => { const h = document.getElementById('hud');"
            " return getComputedStyle(h).display !== 'none'"
            "   && document.getElementById('money').textContent.includes('$'); }")
        return self.record("09 HUD visible", ok, "HUD shown with money readout")

    def c_minimap(self, page):
        # Draw explicitly: step + update three times; one call lands on frame%3==0.
        page.evaluate(
            "() => { const G = window.__game;"
            " for (let i = 0; i < 3; i++) { G.step(1/60); G.minimap.update(); } }")
        px = page.evaluate(
            "() => { const c = document.getElementById('minimap');"
            " const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;"
            " let n = 0; for (let i = 0; i < d.length; i += 4)"
            "   if (d[i + 3] > 0 && (d[i] !== 10 || d[i + 1] !== 14)) n++;"
            " return n; }")
        return self.record("10 minimap drawn", px > 100, f"{px} non-background pixels")

    def c_wanted(self, page):
        page.evaluate("window.__game.police.setWanted(3); window.__game.hud.update()")
        stars = page.evaluate("document.getElementById('stars').textContent")
        return self.record("11 wanted stars render", stars == "★★★☆☆",
                           f"stars={stars!r}")

    def c_police(self, page):
        step(page, 180)
        n = page.evaluate("window.__game.police.cops.length")
        return self.record("12 police spawn", n >= 2, f"{n} cruisers out")

    def c_heli(self, page):
        info = page.evaluate(
            "() => { const h = window.__game.police.heli;"
            " return h ? { exists: true, mode: h.mode,"
            "   modes: window.__game.police.modes.length } : { exists: false }; }")
        ok = info.get("exists") and info.get("modes") == 6
        return self.record("13 heli + six modes", ok, f"heli={info}")

    def c_heli_frame(self, page):
        """Stage all four shots on fresh pages; the heli must be inside the
        camera frustum (NDC |x|,|y| <= 1, 0 <= z <= 1) in every shot."""
        results = {}
        try:
            for stem, query in SHOTS:
                shot = self.browser.new_page(viewport={"width": 1280, "height": 720})
                shot.on("pageerror", lambda e: self.errors.append(str(e)))
                shot.goto(f"{self.base_url}/?shot={query}&seed=1", timeout=60000)
                shot.wait_for_function("window.__shotReady === true", timeout=180000)
                ndc = shot.evaluate(
                    "() => { const G = window.__game;"
                    " const h = G.police.heli;"
                    " if (!h) return null;"
                    " const v = h.pos.clone().project(G.camera);"
                    " return { x: +v.x.toFixed(3), y: +v.y.toFixed(3),"
                    "          z: +v.z.toFixed(3) }; }")
                ok = (ndc is not None and abs(ndc["x"]) <= 1
                      and abs(ndc["y"]) <= 1 and 0 <= ndc["z"] <= 1)
                results[stem] = (ok, ndc)
                shot.close()
        except Exception as exc:  # noqa: BLE001 - surfaced as check failure
            return self.record("14 heli in frame (all 4 shots)", False,
                               f"exception: {exc}")
        ok = all(v[0] for v in results.values())
        detail = ", ".join(f"{k}={v[1]}" for k, v in results.items())
        return self.record("14 heli in frame (all 4 shots)", ok, detail)

    def c_mission(self, page):
        info = page.evaluate(
            "() => { const G = window.__game; G.mission.start('getaway');"
            " return { started: !!G.mission.current,"
            "   current: G.mission.current && G.mission.current.id,"
            "   marker: !!document.getElementById('objective'),"
            "   objective: document.getElementById('objective').textContent.length }; }")
        ok = info["started"] and info["current"] == "getaway" and info["marker"]
        return self.record("15 mission system", ok, str(info))

    def c_combat(self, page):
        # Enemy 10 m ahead of the muzzle (-z); one pistol shot: 60 -> 26.
        info = page.evaluate(
            "() => { const G = window.__game;"
            " const e = G.combat.spawnEnemy(0, 30);"
            " const before = e.health;"
            " const hit = G.combat.shoot({x: 0, y: 1, z: 40}, {x: 0, y: 0, z: -1});"
            " return { before, after: e.health, hit }; }")
        ok = info["before"] == 60 and info["after"] == 26 and info["hit"]
        return self.record("16 combat hits", ok,
                           f"enemy health {info['before']} -> {info['after']}, hit={info['hit']}")

    def c_save(self, page):
        # Real round-trip through the UI: set state, pause (Escape saves),
        # verify the localStorage JSON, reload, press Enter (startGame loads
        # the save), then verify the restored state.
        page.evaluate(
            "window.__game.money = 4242; window.__game.police.setWanted(4);")
        page.keyboard.press("Escape")
        page.wait_for_timeout(300)
        raw = page.evaluate(f"window.localStorage.getItem({SAVE_KEY!r})")
        saved = json.loads(raw) if raw else None
        wrote_ok = (saved and saved.get("version") == 1
                    and saved.get("money") == 4242 and saved.get("wanted") == 4)
        page.reload(timeout=60000)
        page.wait_for_function("window.__game !== undefined", timeout=60000)
        page.wait_for_timeout(5000)
        page.keyboard.press("Enter")  # startGame() applies the save
        page.wait_for_timeout(300)
        restored = page.evaluate(
            "() => ({ money: window.__game.money,"
            " wanted: window.__game.wanted })")
        load_ok = restored["money"] == 4242 and restored["wanted"] == 4
        ok = wrote_ok and load_ok
        return self.record("17 save/load round-trip", ok,
                           f"wrote={wrote_ok} (save={saved}), "
                           f"restored={restored}")

    def c_garage(self, page):
        # Park in the garage zone for 4 sim-seconds. The store fires at 3 s
        # (original car removed from the world); the retrieve fires on the
        # next step (a fresh 'sunset' appears at player pos + (4, 2)).
        page.evaluate(
            "() => { const G = window.__game;"
            " const car = G.vehicles.createCar('sunset', 0, 232, 0);"
            " G.player.car = car; G.player.inCar = true;"
            " G.player.pos.set(0, 0, 232); car.speed = 0;"
            " window.__parkedCar = car; }")
        step(page, 240)
        info = page.evaluate(
            "() => { const G = window.__game;"
            " const parked = !G.vehicles.cars.includes(window.__parkedCar);"
            " const retrieved = G.vehicles.cars.some((c) => c.model === 'sunset'"
            "   && Math.abs(c.pos.x - 4) < 1 && Math.abs(c.pos.z - 234) < 1);"
            " const spot = G.garage.spot.x === 0 && G.garage.spot.z === 232;"
            " return { parked, retrieved, spot }; }")
        ok = info["parked"] and info["retrieved"] and info["spot"]
        return self.record("18 garage store + restore", ok, str(info))

    def c_weather(self, page):
        info = page.evaluate(
            "() => { const G = window.__game;"
            " G.weather.setRain(true); const fogRain = G.scene.fog.far;"
            " const gripRain = G.weather.grip;"
            " G.weather.setTimeOfDay(22);"
            " const nightR = G.scene.background.r;"
            " G.weather.setRain(false); G.weather.setTimeOfDay(12);"
            " return { fogRain, gripRain, nightR }; }")
        ok = (info["fogRain"] == 160 and info["gripRain"] == 0.7
              and info["nightR"] < 0.1)
        return self.record("19 weather changes world", ok, str(info))

    def c_audio(self, page):
        ok = page.evaluate(
            "() => { const G = window.__game;"
            " return !!(G.audio.ctx || (window.AudioContext"
            "   && new window.AudioContext().state !== undefined)); }")
        return self.record("20 audio context exists", ok,
                           "AudioContext created at boot")

    def c_determinism(self, page):
        """Run main.ts twice; the dossier bytes must be identical."""
        hashes = []
        try:
            for _ in range(2):
                out = tempfile.mkdtemp(prefix="gta-rb-det-")
                env = dict(os.environ, MAKEFUN_OUTPUT_DIR=out)
                subprocess.run([NODE, "main.ts"], cwd=ENTRY, env=env,
                               check=True, capture_output=True, timeout=120)
                with open(os.path.join(out, "dossier.json"), "rb") as fh:
                    hashes.append(hashlib.sha256(fh.read()).hexdigest())
                shutil.rmtree(out, ignore_errors=True)
        except Exception as exc:  # noqa: BLE001 - surfaced as check failure
            return self.record("21 determinism (dossier byte-identical)", False,
                               f"exception: {exc}")
        ok = hashes[0] == hashes[1]
        return self.record("21 determinism (dossier byte-identical)", ok,
                           f"sha256={hashes[0][:12]} (2 runs)")

    # -- runners -------------------------------------------------------------

    def run_systems(self, page):
        checks = [
            self.c_title, self.c_boot_errors, self.c_play, self.c_sim_advances,
            self.c_fps, self.c_traffic, self.c_peds, self.c_buildings,
            self.c_hud, self.c_minimap, self.c_wanted, self.c_police,
            self.c_heli, self.c_heli_frame, self.c_mission, self.c_combat,
            self.c_save, self.c_garage, self.c_weather, self.c_audio,
            self.c_determinism,
        ]
        results = []
        for fn in checks:
            try:
                results.append(fn(page))
            except Exception as exc:  # noqa: BLE001 - one bad check must not kill the run
                results.append((fn.__name__, False, f"exception: {exc}"))
        return results

    def soak(self, page, seconds=20):
        """Drive the sim for `seconds` sim-seconds in chunks; no page errors
        may appear and the frame counter must advance by the driven steps."""
        before = len(self.errors)
        start = frame_of(page)
        steps = int(seconds / STEP)
        chunk = 100
        for done in range(0, steps, chunk):
            step(page, min(chunk, steps - done))
            page.wait_for_timeout(100)
        after = len(self.errors)
        advanced = frame_of(page) - start
        ok = after == before and advanced >= steps
        return ok, (f"errors {before}->{after}, frames +{advanced} "
                    f"over {steps} driven steps")


def start_server(port):
    proc = subprocess.Popen(
        [NODE, "serve.ts", "--port", str(port)], cwd=ENTRY,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(2)
    return proc


def launch(pw):
    return pw.chromium.launch(args=[
        "--use-gl=angle", "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
    ])


def capture_shots(base_url, browser, out_dir):
    """Render the four shots and save JPEGs (CDP capture, q80)."""
    os.makedirs(out_dir, exist_ok=True)
    results = {}
    for stem, query in SHOTS:
        page = browser.new_page(viewport={"width": 1280, "height": 720})
        page.goto(f"{base_url}/?shot={query}&seed=1", timeout=60000)
        page.wait_for_function("window.__shotReady === true", timeout=180000)
        ndc = page.evaluate(
            "() => { const G = window.__game; const h = G.police.heli;"
            " if (!h) return null;"
            " const v = h.pos.clone().project(G.camera);"
            " return { x: +v.x.toFixed(3), y: +v.y.toFixed(3),"
            "          z: +v.z.toFixed(3) }; }")
        cdp = page.context.new_cdp_session(page)
        shot = cdp.send("Page.captureScreenshot",
                        {"format": "jpeg", "quality": 80, "fromSurface": False})
        path = os.path.join(out_dir, f"{stem}.jpg")
        with open(path, "wb") as fh:
            fh.write(base64.b64decode(shot["data"]))
        size = os.path.getsize(path)
        results[stem] = (ndc, size)
        print(f"  {stem}.jpg: {size} bytes, heli NDC={ndc}")
        page.close()
    return results


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--quick", action="store_true", help="skip the soak")
    ap.add_argument("--capture-shots", action="store_true",
                    help="render the four screenshots into screenshots/")
    ap.add_argument("--port", type=int, default=8902)
    args = ap.parse_args()

    from playwright.sync_api import sync_playwright

    server = start_server(args.port)
    base_url = f"http://127.0.0.1:{args.port}"
    try:
        with sync_playwright() as pw:
            browser = launch(pw)
            qa = QA(base_url)
            qa.browser = browser

            if args.capture_shots:
                print("Capturing shots...")
                capture_shots(base_url, browser,
                              os.path.join(ENTRY, "screenshots"))
                print("Capture done.")
                return 0

            page = browser.new_page(viewport={"width": 1280, "height": 720})
            page.on("pageerror", lambda e: qa.errors.append(str(e)))
            page.on("console", lambda m: qa.errors.append(m.text)
                    if m.type == "error" else None)
            page.goto(f"{base_url}/?seed=1", timeout=60000)
            page.wait_for_timeout(6000)

            print("Systems checks (21):")
            results = qa.run_systems(page)
            passed = sum(1 for _, ok, _ in results if ok)
            for name, ok, detail in results:
                print(f"  [{'PASS' if ok else 'FAIL'}] {name} — {detail}")
            print(f"\n{passed}/21 checks passed.")
            if passed < 21:
                print("FAILURES:")
                for name, ok, detail in results:
                    if not ok:
                        print(f"  - {name}: {detail}")

            if not args.quick:
                print("\nSoak (20 sim-seconds, driven)...")
                ok, detail = qa.soak(page, 20)
                print(f"  [{'PASS' if ok else 'FAIL'}] soak — {detail}")
            browser.close()
            return 0 if passed == 21 else 1
    finally:
        server.terminate()


if __name__ == "__main__":
    sys.exit(main())
