// Garage + safehouse for Fortuna Bay — store cars, respray, upgrade the
// engine, heal up and save at the Safehouse. The zone is a 16 m radius
// around the safehouse; actions are triggered by keys (main.js) and the
// prompt text tells the player what is available right now.
export function createGarage(G) {
  const { city, state, emit } = G;
  const safe = city.landmarks.safehouse;
  const ZONE_RADIUS = 16;
  const RESPRAY_COST = 50;
  const UPGRADE_COST = 300;
  const MAX_UPGRADES = 3;

  function playerPos() {
    if (state.inCar && state.car) return state.car.pos;
    return G.player.pos;
  }

  function inZone() {
    const pp = playerPos();
    return Math.hypot(pp.x - safe.x, pp.z - safe.z) < ZONE_RADIUS;
  }

  // What the prompt bar should say right now ('' = nothing available).
  function prompt() {
    if (!inZone()) return '';
    if (state.inCar && state.car) {
      const car = state.car;
      const parts = ['[G] Store car'];
      parts.push(`[H] Respray $${RESPRAY_COST}`);
      if ((car.upgrades || 0) < MAX_UPGRADES) parts.push(`[J] Engine +10% ($${UPGRADE_COST})`);
      return parts.join('  ');
    }
    if (state.garage.length > 0) {
      const kinds = state.garage.map((g) => g.kind).join(', ');
      return `[G] Take car out (${state.garage.length} stored: ${kinds})  ·  Safehouse — health restored`;
    }
    return 'Safehouse — health restored';
  }

  function storeCar() {
    if (!inZone() || !state.inCar || !state.car) return false;
    const car = state.car;
    state.garage.push({ kind: car.kind, color: car.color, upgrades: car.upgrades || 0 });
    G.vehicles.removeCar(car);
    state.inCar = false;
    state.car = null;
    if (G.player) {
      G.player.setPos(safe.x + 4, safe.z + 4, Math.PI);
      G.player.group.visible = true;
    }
    if (G.audio) G.audio.setEngine(false, 0);
    emit('toast', { text: 'Car stored in the garage' });
    if (G.saveGame) G.saveGame();
    return true;
  }

  function takeOut() {
    if (!inZone() || state.inCar || state.garage.length === 0) return false;
    const stored = state.garage.shift();
    const car = G.vehicles.spawnCar(stored.kind, safe.x + 6, safe.z + 6, Math.PI, {
      driver: null, color: stored.color,
    });
    car.upgrades = stored.upgrades || 0;
    car.maxSpeed *= 1 + 0.1 * car.upgrades;
    emit('toast', { text: 'Car taken out of the garage' });
    if (G.saveGame) G.saveGame();
    return true;
  }

  function respray() {
    if (!inZone() || !state.inCar || !state.car) return false;
    if (state.cash < RESPRAY_COST) {
      emit('toast', { text: `Respray costs $${RESPRAY_COST}` });
      return false;
    }
    state.cash -= RESPRAY_COST;
    const palette = [0xc84444, 0x4488c8, 0xe8e8e8, 0x44a868, 0xd8a83c, 0x8855aa, 0x333333, 0xe88a4a];
    const newColor = palette[Math.floor(Math.random() * palette.length)];
    state.car.color = newColor;
    if (state.car.bodyMat) state.car.bodyMat.color.setHex(newColor);
    emit('toast', { text: 'Resprayed — fresh paint!' });
    return true;
  }

  function upgrade() {
    if (!inZone() || !state.inCar || !state.car) return false;
    const car = state.car;
    if ((car.upgrades || 0) >= MAX_UPGRADES) {
      emit('toast', { text: 'Engine is already maxed out' });
      return false;
    }
    if (state.cash < UPGRADE_COST) {
      emit('toast', { text: `Engine upgrade costs $${UPGRADE_COST}` });
      return false;
    }
    state.cash -= UPGRADE_COST;
    car.upgrades = (car.upgrades || 0) + 1;
    car.maxSpeed *= 1.1;
    emit('toast', { text: `Engine upgraded — level ${car.upgrades}` });
    return true;
  }

  function update() {
    // On foot in the zone with missing health: heal up and autosave.
    if (inZone() && !state.inCar && state.health < 100) {
      state.health = 100;
      emit('toast', { text: 'Rested at the Safehouse — health restored' });
      if (G.saveGame) G.saveGame();
    }
  }

  return {
    get inZone() { return inZone(); },
    get prompt() { return prompt(); },
    storeCar, takeOut, respray, upgrade, update,
  };
}
