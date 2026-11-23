// Crew abilities for Fortuna Bay — three specialists on hotkeys with
// cooldowns. Rico repairs the car, Vex drops a wanted star, Lola sends the
// cops chasing a decoy.
// Time note: the decoy expiry is WALL-CLOCK (performance.now), because the
// police check it against wall-clock too — mixing it with simulation time
// would make the decoy last forever while paused.
import { CREW } from './config.js';

export function createCrew(G) {
  const { state, emit } = G;
  const cooldowns = { rico: 0, vex: 0, lola: 0 };

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
      const a = Math.random() * Math.PI * 2;
      state.decoy = {
        x: pp.x + Math.sin(a) * 120,
        z: pp.z + Math.cos(a) * 120,
        until: performance.now() / 1000 + 20,
      };
      emit('toast', { text: 'Lola sent the cops chasing a ghost' });
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
