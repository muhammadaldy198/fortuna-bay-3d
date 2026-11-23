// The HUD: health, money, wanted stars, speed, the district name, the live
// objective line, toast messages and the big centre banner — all DOM, all
// cached lookups, all guarded so a missing element never throws. The title,
// pause and game-over overlays belong to main.js; this is the in-play layer.

/**
 * Create the HUD for world G. Returns:
 * - update(dt) — refresh every readout from the world
 * - banner(text) — big centre text for 3 seconds
 * - message(text) — small toast for 4 seconds
 * - setObjective(text) — the live objective line
 * - flashDamage() — a red vignette pulse
 * - setVisible(show) — hide the whole HUD (photo mode)
 */
export function createHud(G) {
  const el = {};
  for (const id of ['hud', 'health-fill', 'health-text', 'money', 'stars', 'speed', 'objective', 'message', 'banner', 'district', 'damage-flash', 'help']) {
    el[id] = document.getElementById(id);
  }
  let bannerUntil = 0;
  let messageUntil = 0;
  let flashUntil = 0;

  function banner(text) {
    if (!el.banner) return;
    el.banner.textContent = text;
    el.banner.style.opacity = '1';
    bannerUntil = performance.now() + 3000;
  }

  function message(text) {
    if (!el.message) return;
    el.message.textContent = text;
    el.message.style.opacity = '1';
    messageUntil = performance.now() + 4000;
  }

  function setObjective(text) {
    if (el.objective) el.objective.textContent = text;
  }

  function flashDamage() {
    if (!el['damage-flash']) return;
    el['damage-flash'].style.opacity = '0.55';
    flashUntil = performance.now() + 350;
  }

  function setVisible(show) {
    if (el.hud) el.hud.style.display = show ? '' : 'none';
  }

  function update() {
    const now = performance.now();
    if (el.banner && now > bannerUntil) el.banner.style.opacity = '0';
    if (el.message && now > messageUntil) el.message.style.opacity = '0';
    if (el['damage-flash'] && now > flashUntil) el['damage-flash'].style.opacity = '0';
    if (el['health-fill']) el['health-fill'].style.width = `${Math.max(0, G.player.health)}%`;
    if (el['health-text']) el['health-text'].textContent = `${Math.ceil(G.player.health)}`;
    if (el.money) el.money.textContent = `$${G.money.toLocaleString('en-US')}`;
    if (el.stars) {
      const filled = '★'.repeat(G.wanted);
      const empty = '☆'.repeat(5 - G.wanted);
      el.stars.textContent = filled + empty;
      el.stars.style.color = G.wanted >= 3 ? '#ff4444' : '#ffd23f';
    }
    if (el.speed) {
      const kmh = G.player.car ? Math.abs(G.player.car.speed) * 3.6 : 0;
      el.speed.textContent = G.player.car ? `${Math.round(kmh)} km/h` : '';
    }
    if (el.district && G.city) {
      el.district.textContent = G.city.districtAt(G.player.pos.x, G.player.pos.z);
    }
  }

  return { update, banner, message, setObjective, flashDamage, setVisible };
}
