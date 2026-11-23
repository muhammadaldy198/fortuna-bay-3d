// Procedural textures, painted on canvas at boot: no image files, no network,
// and every speckle placed by the seeded rng so the same seed paints the same
// walls. Facades carry lit-window grids (they read as a city at night);
// asphalt carries lane dashes; sand and water carry soft noise.

import * as THREE from 'three';

function makeCanvas(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return { canvas, ctx: canvas.getContext('2d') };
}

function toTexture(canvas, repeatX, repeatY) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** One facade: a concrete face with a grid of windows, some lit warm. */
function paintFacade(rng, base, litRatio) {
  const { canvas, ctx } = makeCanvas(256);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  // Concrete noise.
  for (let i = 0; i < 900; i += 1) {
    ctx.fillStyle = rng.chance(0.5) ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)';
    ctx.fillRect(rng.int(0, 255), rng.int(0, 255), 2, 2);
  }
  // Window grid: 8 columns x 12 rows.
  for (let col = 0; col < 8; col += 1) {
    for (let row = 0; row < 12; row += 1) {
      const x = 8 + col * 30;
      const y = 8 + row * 20;
      if (rng.chance(litRatio)) ctx.fillStyle = '#ffd98a';
      else if (rng.chance(0.5)) ctx.fillStyle = '#2c3e50';
      else ctx.fillStyle = '#7fb2d9';
      ctx.fillRect(x, y, 20, 12);
    }
  }
  return canvas;
}

/** Asphalt with a dashed centre line and edge wear. */
function paintAsphalt(rng) {
  const { canvas, ctx } = makeCanvas(256);
  ctx.fillStyle = '#2b2f36';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1400; i += 1) {
    ctx.fillStyle = rng.chance(0.5) ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.06)';
    ctx.fillRect(rng.int(0, 255), rng.int(0, 255), 2, 2);
  }
  ctx.fillStyle = '#e8e0c8';
  for (let y = 0; y < 256; y += 32) ctx.fillRect(126, y, 4, 18);
  return canvas;
}

/** Sidewalk paving: light slabs with dark joints. */
function paintSidewalk(rng) {
  const { canvas, ctx } = makeCanvas(256);
  ctx.fillStyle = '#9aa0a8';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 256; i += 64) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 256);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(256, i);
    ctx.stroke();
  }
  for (let i = 0; i < 300; i += 1) {
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    ctx.fillRect(rng.int(0, 255), rng.int(0, 255), 3, 3);
  }
  return canvas;
}

/** Sand: warm grain with soft patches. */
function paintSand(rng) {
  const { canvas, ctx } = makeCanvas(256);
  ctx.fillStyle = '#e8d8a8';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2200; i += 1) {
    ctx.fillStyle = rng.chance(0.5) ? 'rgba(180,150,90,0.25)' : 'rgba(255,245,210,0.3)';
    ctx.fillRect(rng.int(0, 255), rng.int(0, 255), 2, 2);
  }
  return canvas;
}

/** Water: deep teal with lighter wave streaks. */
function paintWater(rng) {
  const { canvas, ctx } = makeCanvas(256);
  ctx.fillStyle = '#1e90a8';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 60; i += 1) {
    const y = rng.int(0, 255);
    ctx.beginPath();
    ctx.moveTo(rng.int(0, 200), y);
    ctx.lineTo(rng.int(56, 256), y + rng.int(-6, 6));
    ctx.stroke();
  }
  return canvas;
}

/**
 * Paint every texture for world G. Returns { facade: [t, t, t], asphalt,
 * sidewalk, sand, water }. The rng is a fork so texture painting never
 * disturbs the world's main sequence.
 */
export function createTextures(G) {
  const rng = G.rng.fork(303);
  return {
    facade: [
      toTexture(paintFacade(rng, '#b8b0a0', 0.25), 1, 2),
      toTexture(paintFacade(rng, '#8fa3b8', 0.35), 1, 3),
      toTexture(paintFacade(rng, '#c9a689', 0.2), 1, 2),
    ],
    asphalt: toTexture(paintAsphalt(rng), 1, 24),
    sidewalk: toTexture(paintSidewalk(rng), 8, 8),
    sand: toTexture(paintSand(rng), 6, 2),
    water: toTexture(paintWater(rng), 10, 10),
  };
}
