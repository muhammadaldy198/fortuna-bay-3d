// Crew abilities for Fortuna Bay — three specialists on hotkeys with
// cooldowns. Rico repairs the car, Vex drops a wanted star, Lola sends the
// cops chasing a decoy. v2: Lola's decoy fools FALCON-1 too — the heli
// tracks the ghost, so the player can slip out of the searchlight.
// Time note: the decoy expiry is WALL-CLOCK (performance.now), because the
// police check it against wall-clock too — mixing it with simulation time
// would make the decoy last forever while paused.
import { CREW } from './config.js';

const DECOY_SECONDS = 20; // how long Lola's ghost draws the cops (and the heli)

export function createCrew(G) {
  const { state, emit } = G;
  const cooldowns = { rico: 0, vex: 0, lola: 0 };

  // Seeded draw when the game provides its rng (main.js does), so the decoy
  // direction is reproducible for a given seed; Math.random only as a
  // fallback when this module is used standalone in a test.
  function draw() {
    return G.rng ? G.rng.next() : Math.random();
  }

  function use(key) {
    const def = CREW[key];
    if (!def) return false;
    if (cooldowns[key] > 0) {
      emit('toast', { text: `${def.name} is not ready yet (${Math.ceil(cooldowns[key])}s)` });
      return false;
    }
    if (key === 'rico') {
      if (!state.inCar || !state.car) {
        emit('toast', { text: 'Rico needs you in a car' });
        return false;
      }
      state.car.hp = 100;
      state.car.wrecked = false;
      if (G.effects) G.effects.burst({ x: state.car.pos.x, y: 1, z: state.car.pos.z }, 0x66ffaa, 20, 4);
      emit('toast', { text: 'Rico repaired your car' });
    } else if (key === 'vex') {
      if (state.wanted <= 0) {
        emit('toast', { text: 'Vex: no heat to clear' });
        return false;
      }
      G.police.setWanted(state.wanted - 1);
      emit('toast', { text: 'Vex scrubbed a wanted star' });
    } else if (key === 'lola') {
      const pp = state.inCar && state.car ? state.car.pos : G.player.pos;
      const a = draw() * Math.PI * 2;
      // Clamp the ghost onto the island: a decoy in the sea would send the
      // cops (and the heli) chasing a point no road reaches.
      const clamp = (v) => Math.max(-500, Math.min(500, v));
      state.decoy = {
        x: clamp(pp.x + Math.sin(a) * 120),
        z: clamp(pp.z + Math.cos(a) * 120),
        until: performance.now() / 1000 + DECOY_SECONDS,
      };
      emit('toast', { text: 'Lola sent the cops — and the heli — chasing a ghost' });
    }
    cooldowns[key] = def.cooldown;
    return true;
  }

  function update(dt) {
    for (const key of Object.keys(cooldowns)) {
      if (cooldowns[key] > 0) cooldowns[key] = Math.max(0, cooldowns[key] - dt);
    }
    // The decoy expires on wall-clock (see the note at the top).
    if (state.decoy && performance.now() / 1000 > state.decoy.until) {
      state.decoy = null;
    }
  }

  return { cooldowns, use, update };
}
