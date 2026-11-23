// The minimap: a small canvas in the HUD's corner showing the roads around
// the player, the player's arrow, police cruisers in red, the helicopter in
// blue, and the gold mission marker. North is up; the view follows the
// player and covers 240 metres across.

const VIEW = 240;
const SIZE = 168;

/**
 * Create the minimap for world G. Returns { update(dt) }. Redraws every
 * third frame — plenty for a map, and cheap on a software renderer.
 */
export function createMinimap(G) {
  const canvas = document.getElementById('minimap');
  if (!canvas) return { update() {} };
  const ctx = canvas.getContext('2d');
  const scale = SIZE / VIEW;

  function toMap(x, z) {
    return {
      x: SIZE / 2 + (x - G.player.pos.x) * scale,
      y: SIZE / 2 + (z - G.player.pos.z) * scale,
    };
  }

  function update() {
    if (G.frame % 3 !== 0) return;
    ctx.fillStyle = 'rgba(10, 14, 20, 0.85)';
    ctx.fillRect(0, 0, SIZE, SIZE);
    // Roads.
    ctx.strokeStyle = '#5a6270';
    ctx.lineWidth = 3;
    for (const line of G.city.roadLines) {
      const vx = toMap(line, G.player.pos.z);
      ctx.beginPath();
      ctx.moveTo(vx.x, 0);
      ctx.lineTo(vx.x, SIZE);
      ctx.stroke();
      const hz = toMap(G.player.pos.x, line);
      ctx.beginPath();
      ctx.moveTo(0, hz.y);
      ctx.lineTo(SIZE, hz.y);
      ctx.stroke();
    }
    // Blocks.
    ctx.fillStyle = 'rgba(120, 110, 95, 0.5)';
    for (const block of G.city.blocks) {
      const a = toMap(block.x0, block.z0);
      const b = toMap(block.x1, block.z1);
      if (b.x < 0 || a.x > SIZE || b.y < 0 || a.y > SIZE) continue;
      ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
    }
    // Mission marker.
    if (G.mission && G.mission.marker) {
      const m = toMap(G.mission.marker.x, G.mission.marker.z);
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.arc(m.x, m.y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Cops in red, heli in blue.
    ctx.fillStyle = '#ff4444';
    for (const cop of G.police.cops) {
      const c = toMap(cop.pos.x, cop.pos.z);
      ctx.fillRect(c.x - 2, c.y - 2, 4, 4);
    }
    if (G.police.heli) {
      const h = toMap(G.police.heli.pos.x, G.police.heli.pos.z);
      ctx.fillStyle = '#44aaff';
      ctx.beginPath();
      ctx.arc(h.x, h.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    // The player: a white arrow pointing along the heading.
    const px = SIZE / 2;
    const py = SIZE / 2;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.atan2(Math.sin(G.player.heading), Math.cos(G.player.heading)));
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // North tick.
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.fillText('N', SIZE / 2 - 4, 12);
  }

  return { update };
}
