// Minimap + full map for Fortuna Bay v2 — live canvas, player-centred,
// north-up. Roads from the city grid, cops flashing, mission marker cyan,
// player arrow white. Tab opens the full map. v2: FALCON-1 shows as a
// rotating rotor blip with its searchlight pool, and a cyan GPS route line
// runs along the roads to the mission target.
import { DISTRICTS, HALF, ISLAND, blockCenter, nearestRoad } from './config.js';

export function createMinimap(G) {
  const { state } = G;
  const mini = document.getElementById('minimap');
  const miniCtx = mini.getContext('2d');
  const full = document.getElementById('fullmap');
  const fullCtx = full.getContext('2d');
  const fullWrap = document.getElementById('fullmap-wrap');
  let fullOpen = false;
  let redrawT = 0;
  let clock = 0;

  function playerPos() {
    if (state.inCar && state.car) return state.car.pos;
    return G.player.pos;
  }

  function playerYaw() {
    if (state.inCar && state.car) return state.car.yaw;
    return G.player.yaw;
  }

  // Draw the island + city underlay into ctx, using transform fn (x, z) -> [px, py].
  function drawBase(ctx, w, h, toPx, scale) {
    // Ocean.
    ctx.fillStyle = '#16324a';
    ctx.fillRect(0, 0, w, h);
    // Island sand.
    const [ix0, iy0] = toPx(-ISLAND / 2, -ISLAND / 2);
    const [ix1, iy1] = toPx(ISLAND / 2, ISLAND / 2);
    ctx.fillStyle = '#c8b088';
    ctx.fillRect(ix0, iy0, ix1 - ix0, iy1 - iy0);
    // City asphalt.
    const [cx0, cy0] = toPx(-HALF, -HALF);
    const [cx1, cy1] = toPx(HALF, HALF);
    ctx.fillStyle = '#4a4a55';
    ctx.fillRect(cx0, cy0, cx1 - cx0, cy1 - cy0);
    // Blocks.
    ctx.fillStyle = '#2e2e38';
    for (const b of G.city.blocks) {
      const [bx0, by0] = toPx(b.x - 18, b.z - 18);
      ctx.fillRect(bx0, by0, 36 * scale, 36 * scale);
    }
  }

  function drawDiamond(ctx, x, y, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r, y);
    ctx.closePath();
    ctx.fill();
  }

  // GPS route: a dashed cyan line from the player to the mission marker,
  // routed along the road grid (Manhattan path via the nearest road lines).
  function drawRoute(ctx, toPx) {
    const m = G.missions ? G.missions.marker : null;
    if (!m) return;
    const pp = playerPos();
    const rx0 = nearestRoad(pp.x);
    const rz0 = nearestRoad(pp.z);
    const rx1 = nearestRoad(m[0]);
    const rz1 = nearestRoad(m[1]);
    const waypoints = [
      [pp.x, pp.z],
      [rx0, pp.z],
      [rx0, rz1],
      [rx1, rz1],
      [m[0], m[1]],
    ];
    // Drop duplicate consecutive points (player already on a road line).
    const pts = waypoints.filter((p, i) => i === 0 || Math.hypot(p[0] - waypoints[i - 1][0], p[1] - waypoints[i - 1][1]) > 1);
    ctx.save();
    ctx.strokeStyle = '#44d0ff';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([7, 5]);
    ctx.beginPath();
    pts.forEach(([x, z], i) => {
      const [px, py] = toPx(x, z);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
    ctx.restore();
  }

  function drawMarkers(ctx, toPx, scale) {
    // Mission marker (cyan diamond).
    const m = G.missions ? G.missions.marker : null;
    if (m) {
      const [mx, my] = toPx(m[0], m[1]);
      drawDiamond(ctx, mx, my, 6, '#44d0ff');
    }
    // Safehouse (green diamond).
    const safe = G.city.landmarks.safehouse;
    const [sx, sy] = toPx(safe.x, safe.z);
    drawDiamond(ctx, sx, sy, 5, '#44d060');
    // Helipads (yellow H) on the full map only — the minimap scale is
    // ~0.71, the full map ~0.58, so 0.65 separates the two.
    if (G.city.helipads && scale < 0.65) {
      ctx.fillStyle = '#ffcc22';
      ctx.font = 'bold 11px Arial, sans-serif';
      ctx.textAlign = 'center';
      for (const pad of G.city.helipads) {
        const [px, py] = toPx(pad.x, pad.z);
        ctx.fillText('H', px, py + 4);
      }
    }
    // Cops (flashing red/blue).
    const copColor = Math.floor(clock * 3) % 2 === 0 ? '#ff4444' : '#4488ff';
    ctx.fillStyle = copColor;
    for (const cop of G.police.cops) {
      const [cx, cy] = toPx(cop.pos.x, cop.pos.z);
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // FALCON-1: a rotating rotor blip (yellow) + its searchlight pool.
    if (G.police && G.police.heliPos) {
      const h = G.police.heliPos();
      const pool = G.police.spotPool ? G.police.spotPool() : null;
      if (pool) {
        const [px, py] = toPx(pool.x, pool.z);
        ctx.fillStyle = 'rgba(255,242,176,0.35)';
        ctx.beginPath();
        ctx.arc(px, py, Math.max(3, pool.r * scale), 0, Math.PI * 2);
        ctx.fill();
      }
      if (h) {
        const [hx, hy] = toPx(h.x, h.z);
        const a = clock * 6;
        ctx.strokeStyle = '#ffcc22';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(hx - Math.cos(a) * 7, hy - Math.sin(a) * 7);
        ctx.lineTo(hx + Math.cos(a) * 7, hy + Math.sin(a) * 7);
        ctx.moveTo(hx - Math.cos(a + Math.PI / 2) * 7, hy - Math.sin(a + Math.PI / 2) * 7);
        ctx.lineTo(hx + Math.cos(a + Math.PI / 2) * 7, hy + Math.sin(a + Math.PI / 2) * 7);
        ctx.stroke();
        ctx.fillStyle = '#ffcc22';
        ctx.beginPath();
        ctx.arc(hx, hy, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Enemies (solid red dots) so kill missions stay findable.
    if (G.combat) {
      ctx.fillStyle = '#ff2222';
      for (const e of G.combat.enemies) {
        const [ex, ey] = toPx(e.pos.x, e.pos.z);
        ctx.beginPath();
        ctx.arc(ex, ey, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Lola's decoy (purple diamond) while it is active.
    if (state.decoy) {
      const [dx, dy] = toPx(state.decoy.x, state.decoy.z);
      drawDiamond(ctx, dx, dy, 5, '#c060ff');
    }
  }

  function drawMinimap() {
    const w = mini.width;
    const h = mini.height;
    const pp = playerPos();
    // 280 m across the 200 px circle: the minimap shows the neighbourhood,
    // not the whole island (that is what the full map is for).
    const scale = w / 280; // 280 m across
    const toPx = (x, z) => [w / 2 + (x - pp.x) * scale, h / 2 + (z - pp.z) * scale];
    drawBase(miniCtx, w, h, toPx, scale);
    drawRoute(miniCtx, toPx);
    drawMarkers(miniCtx, toPx, scale);
    // Player arrow (white, rotated to the heading).
    miniCtx.save();
    miniCtx.translate(w / 2, h / 2);
    miniCtx.rotate(Math.PI - playerYaw());
    miniCtx.fillStyle = '#ffffff';
    miniCtx.beginPath();
    miniCtx.moveTo(0, -8);
    miniCtx.lineTo(5, 6);
    miniCtx.lineTo(0, 3);
    miniCtx.lineTo(-5, 6);
    miniCtx.closePath();
    miniCtx.fill();
    miniCtx.restore();
  }

  function drawFullmap() {
    const w = full.width;
    const h = full.height;
    const scale = w / (ISLAND + 120);
    const toPx = (x, z) => [w / 2 + x * scale, h / 2 + z * scale];
    drawBase(fullCtx, w, h, toPx, scale);
    // District labels.
    fullCtx.fillStyle = 'rgba(255,255,255,0.75)';
    fullCtx.font = 'bold 13px Arial, sans-serif';
    fullCtx.textAlign = 'center';
    for (const d of DISTRICTS) {
      if (d.name === 'Midtown') continue;
      const [cx, cz] = blockCenter((d.i0 + d.i1) / 2, (d.j0 + d.j1) / 2);
      const [px, py] = toPx(cx, cz);
      fullCtx.fillText(d.name.toUpperCase(), px, py);
    }
    // Landmark names.
    fullCtx.font = '11px Arial, sans-serif';
    fullCtx.fillStyle = 'rgba(255,220,120,0.9)';
    for (const lm of Object.values(G.city.landmarks)) {
      const [px, py] = toPx(lm.x, lm.z);
      fullCtx.fillText(lm.name, px, py + 14);
      fullCtx.fillStyle = 'rgba(255,220,120,0.9)';
      fullCtx.beginPath();
      fullCtx.arc(px, py, 3, 0, Math.PI * 2);
      fullCtx.fill();
    }
    drawRoute(fullCtx, toPx);
    drawMarkers(fullCtx, toPx, scale);
    // Player arrow.
    const pp = playerPos();
    const [px, py] = toPx(pp.x, pp.z);
    fullCtx.save();
    fullCtx.translate(px, py);
    fullCtx.rotate(Math.PI - playerYaw());
    fullCtx.fillStyle = '#ffffff';
    fullCtx.beginPath();
    fullCtx.moveTo(0, -8);
    fullCtx.lineTo(5, 6);
    fullCtx.lineTo(0, 3);
    fullCtx.lineTo(-5, 6);
    fullCtx.closePath();
    fullCtx.fill();
    fullCtx.restore();
  }

  function toggleFull() {
    fullOpen = !fullOpen;
    fullWrap.classList.toggle('hidden', !fullOpen);
    if (fullOpen) drawFullmap();
  }

  function update(dt) {
    clock += dt;
    redrawT -= dt;
    if (redrawT > 0) return;
    redrawT = 0.1; // 10 Hz redraw
    drawMinimap();
    if (fullOpen) drawFullmap();
  }

  return {
    toggleFull,
    get fullOpen() { return fullOpen; },
    update,
  };
}
