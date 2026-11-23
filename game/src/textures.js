// Procedural Canvas 2D textures for Fortuna Bay v2 — no image assets, 100%
// original. The ground is one big painted map (sand, roads, sidewalks, block
// interiors, crosswalks, boardwalk, helipads, plaza); buildings get flat
// colours plus instanced window quads instead of facade textures, so windows
// stay proportional at any tower height. All noise is SEEDED (mulberry32) so
// the same seed always paints the same ground — screenshots stay reproducible.
import { BLOCK, GRID, HALF, HELIPADS, ISLAND, PITCH, PLAZA, ROAD, WALK, districtAt } from './config.js';
import { mulberry32 } from './random.js';

const GROUND_PX = 2048;

// Map a world coordinate (-ISLAND/2 .. ISLAND/2) to a ground-canvas pixel.
function px(v) {
  return ((v + ISLAND / 2) / ISLAND) * GROUND_PX;
}

// Lighten or darken a hex colour by a factor (0.5 = half brightness).
function shade(hex, f) {
  const r = Math.min(255, Math.round(((hex >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((hex >> 8) & 255) * f));
  const b = Math.min(255, Math.round((hex & 255) * f));
  return `rgb(${r},${g},${b})`;
}

// The ground map: sand everywhere, the city grid painted on top.
export function makeGroundTexture(THREE) {
  const canvas = document.createElement('canvas');
  canvas.width = GROUND_PX;
  canvas.height = GROUND_PX;
  const c = canvas.getContext('2d');
  const noise = mulberry32(1337); // seeded: same sand every load

  // Sand base with seeded speckle.
  c.fillStyle = '#e8d5a8';
  c.fillRect(0, 0, GROUND_PX, GROUND_PX);
  for (let i = 0; i < 9000; i++) {
    const x = noise() * GROUND_PX;
    const y = noise() * GROUND_PX;
    c.fillStyle = noise() < 0.5 ? 'rgba(190,160,110,0.25)' : 'rgba(255,240,200,0.25)';
    c.fillRect(x, y, 2, 2);
  }

  // Wet sand band along the south waterline (the island edge at z = +560).
  const wet = c.createLinearGradient(0, px(HALF + 60), 0, GROUND_PX);
  wet.addColorStop(0, 'rgba(180,150,100,0)');
  wet.addColorStop(1, 'rgba(160,130,90,0.55)');
  c.fillStyle = wet;
  c.fillRect(0, px(HALF + 60), GROUND_PX, GROUND_PX - px(HALF + 60));

  // Boardwalk: wooden planks along the beachfront, just south of the city.
  const bw0 = px(HALF);
  const bw1 = px(HALF + 14);
  c.fillStyle = '#a67c4e';
  c.fillRect(px(-HALF), bw0, px(HALF) - px(-HALF), bw1 - bw0);
  c.strokeStyle = 'rgba(90,60,30,0.6)';
  c.lineWidth = 1;
  for (let x = px(-HALF); x < px(HALF); x += 14) {
    c.beginPath();
    c.moveTo(x, bw0);
    c.lineTo(x, bw1);
    c.stroke();
  }

  // Block interiors, coloured by district.
  for (let i = 0; i < GRID; i++) {
    for (let j = 0; j < GRID; j++) {
      const d = districtAt(i, j);
      const cx = (i - (GRID - 1) / 2) * PITCH;
      const cz = (j - (GRID - 1) / 2) * PITCH;
      c.fillStyle = shade(d.color, 0.82);
      c.fillRect(px(cx - BLOCK / 2), px(cz - BLOCK / 2), px(BLOCK) - px(0), px(BLOCK) - px(0));
      // A few seeded courtyard details per block.
      const detail = mulberry32(i * 131 + j * 17 + 5);
      if (detail() < 0.4) {
        c.fillStyle = 'rgba(120,160,110,0.5)';
        const s = px(6 + detail() * 8);
        c.fillRect(px(cx - BLOCK / 2) + detail() * px(BLOCK - 12), px(cz - BLOCK / 2) + detail() * px(BLOCK - 12), s, s);
      }
    }
  }

  // Roads in two passes: first all sidewalk bands (light), then all
  // asphalt bands (dark). Painting road-by-road would drag each road's
  // sidewalk strips across the roads it crosses at intersections.
  const band = (x0, z0, x1, z1) => c.fillRect(px(x0), px(z0), px(x1) - px(x0), px(z1) - px(z0));
  c.fillStyle = '#8a8a90';
  for (let k = 0; k <= GRID; k++) {
    const line = (k - GRID / 2) * PITCH;
    band(line - ROAD / 2 - WALK, -HALF, line + ROAD / 2 + WALK, HALF);
    band(-HALF, line - ROAD / 2 - WALK, HALF, line + ROAD / 2 + WALK);
  }
  c.fillStyle = '#3a3a40';
  for (let k = 0; k <= GRID; k++) {
    const line = (k - GRID / 2) * PITCH;
    band(line - ROAD / 2, -HALF, line + ROAD / 2, HALF);
    band(-HALF, line - ROAD / 2, HALF, line + ROAD / 2);
  }

  // Centre dashes on every road.
  c.fillStyle = 'rgba(240,220,120,0.85)';
  for (let k = 0; k <= GRID; k++) {
    const line = (k - GRID / 2) * PITCH;
    for (let t = -HALF + 8; t < HALF - 8; t += 12) {
      c.fillRect(px(line) - 1, px(t), 2, px(5) - px(0));
      c.fillRect(px(t), px(line) - 1, px(5) - px(0), 2);
    }
  }

  // Crosswalks at every intersection: white stripes across each road.
  c.fillStyle = 'rgba(240,240,240,0.8)';
  for (let i = 0; i <= GRID; i++) {
    for (let j = 0; j <= GRID; j++) {
      const x = (i - GRID / 2) * PITCH;
      const z = (j - GRID / 2) * PITCH;
      for (let s = -1; s <= 1; s++) {
        c.fillRect(px(x - ROAD / 2 + 1 + s * 4), px(z - ROAD / 2 - 2), px(2) - px(0), px(4) - px(0));
        c.fillRect(px(x - ROAD / 2 - 2), px(z - ROAD / 2 + 1 + s * 4), px(4) - px(0), px(2) - px(0));
      }
    }
  }

  // Helipads (v2): dark circle, yellow ring, white H. Painted on the ground
  // map so they read from the air and from the birdseye shot. The 3D pads
  // in props.js sit on these exact spots (same centre + radius).
  for (const pad of HELIPADS) {
    const cx = px(pad.x);
    const cz = px(pad.z);
    const r = px(pad.radius) - px(0);
    c.fillStyle = '#2e2e34';
    c.beginPath();
    c.arc(cx, cz, r, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = 'rgba(240,220,120,0.9)';
    c.lineWidth = 3;
    c.beginPath();
    c.arc(cx, cz, r - 3, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.9)';
    c.font = `bold ${Math.round(r * 1.1)}px Arial, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('H', cx, cz + 1);
  }

  // Plaza (v2): a round paved gathering space at the Beachfront corner.
  {
    const cx = px(PLAZA.x);
    const cz = px(PLAZA.z);
    const r = px(PLAZA.radius) - px(0);
    c.fillStyle = '#b8a888';
    c.beginPath();
    c.arc(cx, cz, r, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = 'rgba(120,100,70,0.7)';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(cx, cz, r * 0.55, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = 'rgba(90,140,180,0.8)';
    c.beginPath();
    c.arc(cx, cz, r * 0.18, 0, Math.PI * 2);
    c.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// The ocean: a small tile that repeats and scrolls.
export function makeOceanTexture(THREE) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const c = canvas.getContext('2d');
  const noise = mulberry32(4242); // seeded streaks
  const grad = c.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#2a5a8a');
  grad.addColorStop(0.5, '#1f4a76');
  grad.addColorStop(1, '#2a5a8a');
  c.fillStyle = grad;
  c.fillRect(0, 0, 256, 256);
  c.strokeStyle = 'rgba(255,255,255,0.12)';
  c.lineWidth = 1.5;
  for (let i = 0; i < 40; i++) {
    const y = noise() * 256;
    const x = noise() * 256;
    const len = 12 + noise() * 30;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + len, y);
    c.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 8);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A soft radial disc (v2): white centre fading to transparent. One texture,
// three uses — the rotor blur disc above the heli, the feathered edge of
// the searchlight pool, and the heli's soft blob shadow (police.js). The
// hard inner core keeps the rotor disc readable as a solid disc from far
// away, instead of washing out into a faint halo.
export function makeDiscTexture(THREE) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const c = canvas.getContext('2d');
  const grad = c.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.75)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = grad;
  c.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A glowing neon sign texture (transparent background).
export function makeNeonTexture(THREE, text, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const c = canvas.getContext('2d');
  c.clearRect(0, 0, 512, 128);
  c.font = 'bold 64px Arial, sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.shadowColor = color;
  c.shadowBlur = 24;
  c.strokeStyle = color;
  c.lineWidth = 3;
  c.strokeText(text, 256, 64);
  c.fillStyle = '#ffffff';
  c.shadowBlur = 8;
  c.fillText(text, 256, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A billboard: solid background, two lines of bold text, a border.
export function makeBillboardTexture(THREE, line1, line2, bg) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const c = canvas.getContext('2d');
  c.fillStyle = bg;
  c.fillRect(0, 0, 512, 256);
  c.strokeStyle = '#ffffff';
  c.lineWidth = 8;
  c.strokeRect(8, 8, 496, 240);
  c.fillStyle = '#ffffff';
  c.textAlign = 'center';
  c.font = 'bold 64px Arial, sans-serif';
  c.fillText(line1, 256, 104);
  c.font = 'bold 44px Arial, sans-serif';
  c.fillStyle = '#ffd76b';
  c.fillText(line2, 256, 180);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
