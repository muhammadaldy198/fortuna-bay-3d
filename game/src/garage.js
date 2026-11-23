// The garage: a Marina lock-up where the player stores cars they like.
// Park a car inside the zone and sit still for three seconds — it is stored
// (and leaves the world). Walk into the zone on foot and the most recently
// stored car rolls back out beside the player. Stored models persist through
// save.js.

import * as THREE from 'three';

const GARAGE = { x: 0, z: 232, w: 26, d: 18 };

/**
 * Create the garage for world G. Returns:
 * - stored — [{ model }] in store order
 * - restore(models) — rebuild the stored list from a save
 * - update(dt)
 */
export function createGarage(G) {
  const stored = [];
  let parkTimer = 0;
  let retrieveCooldown = 0;

  // The building: a wide low box with a striped door, plus a sign.
  const shell = new THREE.Mesh(
    new THREE.BoxGeometry(GARAGE.w, 7, GARAGE.d),
    new THREE.MeshLambertMaterial({ color: 0x7a6a55 }),
  );
  shell.position.set(GARAGE.x, 3.5, GARAGE.z);
  G.scene.add(shell);
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(GARAGE.w * 0.7, 4.5, 0.3),
    new THREE.MeshLambertMaterial({ color: 0x3a3f45 }),
  );
  door.position.set(GARAGE.x, 2.25, GARAGE.z - GARAGE.d / 2 - 0.2);
  G.scene.add(door);
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(10, 1.6, 0.4),
    new THREE.MeshBasicMaterial({ color: 0x22d3ee }),
  );
  sign.position.set(GARAGE.x, 8, GARAGE.z - GARAGE.d / 2 - 0.2);
  G.scene.add(sign);

  function inside(x, z) {
    return Math.abs(x - GARAGE.x) < GARAGE.w / 2 && Math.abs(z - GARAGE.z) < GARAGE.d / 2;
  }

  function restore(models) {
    stored.length = 0;
    for (const model of models) stored.push({ model });
  }

  function update(dt) {
    retrieveCooldown = Math.max(0, retrieveCooldown - dt);
    const player = G.player;
    if (player.car) {
      // Parked in the zone: count down, then store the car.
      if (inside(player.pos.x, player.pos.z) && Math.abs(player.car.speed) < 0.5) {
        parkTimer += dt;
        if (G.hud && parkTimer < 3) G.hud.setObjective(`Storing ${player.car.model}… ${Math.ceil(3 - parkTimer)}`);
        if (parkTimer >= 3) {
          stored.push({ model: player.car.model });
          G.vehicles.removeCar(player.car);
          player.car = null;
          player.mesh.visible = true;
          parkTimer = 0;
          if (G.hud) {
            G.hud.banner('Stored in the garage');
            G.hud.setObjective(`Garage: ${stored.length} car${stored.length === 1 ? '' : 's'} stored.`);
          }
          if (G.audio) G.audio.coin();
        }
      } else {
        parkTimer = 0;
      }
      return;
    }
    parkTimer = 0;
    // On foot in the zone: bring the last stored car out.
    if (inside(player.pos.x, player.pos.z) && stored.length > 0 && retrieveCooldown <= 0) {
      const entry = stored.pop();
      const car = G.vehicles.createCar(entry.model, player.pos.x + 4, player.pos.z + 2, player.heading);
      retrieveCooldown = 5;
      if (G.hud) G.hud.message(`${entry.model} rolled out of the garage.`);
      if (G.audio) G.audio.door();
    }
  }

  return { stored, restore, update, spot: GARAGE };
}
