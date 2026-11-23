// The four screenshot scenes behind ?shot=strip|night|chase|scale. Each one
// plays the real rules forward from a fresh world for a fixed number of
// steps — the player car drives itself down a road, the cops chase, the
// helicopter works its state machine — then frames the shot so the player
// AND the FALCON-1 helicopter are both inside the camera's field of view.
// The same seed always gives the same frame.
//
// Visibility rule learned from the first capture: the helicopter must sit
// OVER OPEN SKY from the camera's point of view, not just inside the
// frustum. A heli parked over a tower block at rooftop height is occluded
// by the towers even when its NDC is in range — so each stage keeps the
// heli above the street canyon (small side offset, high altitude) where the
// camera's sightline down the road meets only sky.

import * as THREE from 'three';
import { STEP } from './config.js';

/** Settle lengths in frames (60 fps): the chase needs 6 s for the heli to drop into track. */
const SETTLE = { strip: 240, night: 240, chase: 360, scale: 90 };

/**
 * Put the player in a car at (x, z) facing `heading`, ready to drive.
 * Returns the car.
 */
function placeDriver(G, model, x, z, heading) {
  const car = G.vehicles.createCar(model, x, z, heading);
  G.player.pos.set(x, 0, z);
  G.player.heading = heading;
  G.player.car = car;
  G.player.mesh.visible = false;
  return car;
}

/**
 * Drive the player's car forward for `frames` steps (autopilot: steady
 * throttle, no steer) and step the world. The player's position is synced
 * to the car every step — in shot mode player.update never runs, so without
 * this the police and the helicopter would chase the starting spot.
 */
function settle(G, frames, throttle) {
  for (let i = 0; i < frames; i += 1) {
    if (G.player.car) {
      G.vehicles.drive(G.player.car, throttle, 0, STEP);
      G.player.pos.copy(G.player.car.pos);
      G.player.heading = G.player.car.heading;
    }
    G.step(STEP);
  }
}

/**
 * Frame two points (the car and the helicopter) inside the vertical field of
 * view: the camera sits on the line from their midpoint along `dir`, far
 * enough that the pair's separation fits the frame with a 25% margin.
 */
function frameTwoPoints(G, a, b, dir) {
  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2;
  const midZ = (a.z + b.z) / 2;
  const sep = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  const halfFov = THREE.MathUtils.degToRad(G.camera.fov / 2);
  const dist = (sep / 2) / Math.tan(halfFov) * 1.25 + 7;
  const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
  const cx = midX + (dir.x / len) * dist;
  const cy = Math.max(10, midY + (dir.y / len) * dist);
  const cz = midZ + (dir.z / len) * dist;
  G.camera.position.set(cx, cy, cz);
  G.camera.lookAt(midX, midY, midZ);
}

/** Park the helicopter ahead of the player, spotlight locked on the car. */
function stageHeli(G, aheadDist, sideDist, alt) {
  const heli = G.police.heli;
  if (!heli) return null;
  const h = G.player.heading;
  heli.pos.set(
    G.player.pos.x + Math.sin(h) * aheadDist + Math.cos(h) * sideDist,
    alt,
    G.player.pos.z + Math.cos(h) * aheadDist - Math.sin(h) * sideDist,
  );
  heli.mode = 'spotlight';
  heli.modeTime = 0;
  heli.alt = alt;
  return heli;
}

/** Park two cruisers across the road ahead of the player (a staged roadblock). */
function stageRoadblock(G, aheadDist) {
  const h = G.player.heading;
  const cx = G.player.pos.x + Math.sin(h) * aheadDist;
  const cz = G.player.pos.z + Math.cos(h) * aheadDist;
  const snapped = G.city.nearestRoad(cx, cz);
  const px = Math.cos(h);
  const pz = -Math.sin(h);
  G.vehicles.createCar('cruiser', snapped.x + px * 3.5, snapped.z + pz * 3.5, h + Math.PI / 2);
  G.vehicles.createCar('cruiser', snapped.x - px * 3.5, snapped.z - pz * 3.5, h + Math.PI / 2);
}

/**
 * The Strip at noon: a coupe cruising past the neon, heli tracking above.
 * The heli stays over the road (side -4) at alt 42 — high above the street
 * canyon, silhouetted against the sky from the camera behind the car. An
 * earlier staging (side -18, alt 27) parked it over a tower block where the
 * towers hid it even though its NDC was in range.
 */
function stageStrip(G) {
  G.weather.setTimeOfDay(10.5);
  G.weather.setRain(false);
  placeDriver(G, 'coupe', 3.5, 210, Math.PI);
  G.police.setWanted(3);
  settle(G, SETTLE.strip, 0.7);
  const heli = stageHeli(G, 34, -4, 42);
  const car = G.player.car;
  frameTwoPoints(G, { x: car.pos.x, y: 1.5, z: car.pos.z }, heli.pos, {
    x: -Math.sin(G.player.heading),
    y: 0.5,
    z: -Math.cos(G.player.heading),
  });
}

/** Night on the Strip: neon, wet streets, the searchlight cone on the car. */
function stageNight(G) {
  G.weather.setTimeOfDay(21.5);
  G.weather.setRain(false);
  placeDriver(G, 'sedan', -36.5, 170, Math.PI / 2);
  G.police.setWanted(3);
  settle(G, SETTLE.night, 0.6);
  const heli = stageHeli(G, 30, 16, 25);
  const car = G.player.car;
  frameTwoPoints(G, { x: car.pos.x, y: 1.5, z: car.pos.z }, heli.pos, {
    x: -Math.sin(G.player.heading),
    y: 0.55,
    z: -Math.cos(G.player.heading),
  });
}

/** The chase: five stars, cruisers behind, a roadblock ahead, heli tracking. */
function stageChase(G) {
  G.weather.setTimeOfDay(15.0);
  G.weather.setRain(false);
  placeDriver(G, 'coupe', 3.5, 30, 0);
  G.police.setWanted(5);
  settle(G, SETTLE.chase, 0.9);
  stageRoadblock(G, 34);
  const heli = stageHeli(G, 38, -14, 26);
  const car = G.player.car;
  // Low and back: the car fills the lower frame, the heli the upper.
  frameTwoPoints(G, { x: car.pos.x, y: 1.5, z: car.pos.z }, heli.pos, {
    x: -Math.sin(G.player.heading) * 0.9,
    y: 0.35,
    z: -Math.cos(G.player.heading) * 0.9,
  });
}

/** The city at golden hour: skyline, beach and sea, heli in frame. */
function stageScale(G) {
  G.weather.setTimeOfDay(16.75);
  G.weather.setRain(false);
  placeDriver(G, 'suv', 3.5, 130, 0);
  G.police.setWanted(3);
  settle(G, SETTLE.scale, 0.4);
  const heli = stageHeli(G, 26, 22, 44);
  const car = G.player.car;
  // High and back: the whole downtown skyline behind the car and the heli.
  frameTwoPoints(G, { x: car.pos.x, y: 2, z: car.pos.z }, heli.pos, {
    x: 0.15,
    y: 0.85,
    z: 1,
  });
}

const STAGES = { strip: stageStrip, night: stageNight, chase: stageChase, scale: stageScale };

/**
 * Stage the named shot (strip, night, chase, scale; any other name is strip).
 * Runs the real sim forward, places the helicopter, and frames the camera.
 * The caller paints twice and sets window.__shotReady.
 */
export function stageShot(name, G) {
  G.shotMode = true;
  const stage = STAGES[name] || STAGES.strip;
  stage(G);
  G.hud.update();
  G.minimap.update();
  return { screen: 'play' };
}
