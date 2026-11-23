// Minimap + full map for Fortuna Bay — live canvas, player-centred,
// north-up. Roads from the city grid, cops flashing, mission marker cyan,
// player arrow white. Tab opens the full map.
import { DISTRICTS, HALF, ISLAND, blockCenter } from './config.js';

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

  function drawMarkers(ctx, toPx) {
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
    // Cops (flashing red/blue).
    const copColor = Math.floor(clock * 3) % 2 === 0 ? '#ff4444' : '#4488ff';
    ctx.fillStyle = copColor;
    for (const cop of G.police.cops) {
      const [cx, cy] = toPx(cop.pos.x, cop.pos.z);
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fill();
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
    const scale = w / 280; // 280 m across
    const toPx = (x, z) => [w / 2 + (x - pp.x) * scale, h / 2 + (z - pp.z) * scale];
    drawBase(miniCtx, w, h, toPx, scale);
    drawMarkers(miniCtx, toPx);
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
    drawMarkers(fullCtx, toPx);
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
