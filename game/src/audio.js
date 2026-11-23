// Synthesized audio for Fortuna Bay — WebAudio only, no audio files.
// Everything is a no-op until init() runs from a user gesture (browsers block
// audio before that). Engine hum, two-tone siren, gunshots, radio, rain.
import { RADIO_STATIONS } from './config.js';

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineSub = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenPhase = 0;
  let rainSrc = null;
  let rainGain = null;
  let station = 0;
  let radioOn = false;
  let stepT = 0;
  let stepIdx = 0;

  function now() {
    return ctx ? ctx.currentTime : 0;
  }

  // A short burst of filtered noise (gunshots, crashes, punches).
  function noiseBurst(duration, filterFreq, gain, type = 'lowpass') {
    if (!ctx) return;
    const len = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, now());
    g.gain.exponentialRampToValueAtTime(0.001, now() + duration);
    src.connect(filter).connect(g).connect(master);
    src.start();
  }

  // A short pitched blip (UI clicks, pickups, siren notes).
  function blip(freq, duration, gain, type = 'sine', when = 0) {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    const t0 = now() + when;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  // One step of the radio sequencer: pad + bass + hat on a minor pentatonic.
  function radioStep() {
    if (!ctx || !radioOn) return;
    const st = RADIO_STATIONS[station];
    const scale = [1, 1.189, 1.335, 1.498, 1.782, 2]; // minor pentatonic ratios
    const beat = 60 / st.bpm / 2; // eighth notes
    const root = st.root;
    const melody = [0, 2, 1, 4, 3, 2, 4, 1];
    const note = melody[stepIdx % melody.length];
    blip(root * scale[note] * 2, beat * 0.9, 0.05, 'triangle');
    if (stepIdx % 4 === 0) blip(root / 2, beat * 1.8, 0.09, 'sine');
    if (stepIdx % 2 === 1) noiseBurst(0.04, 6000, 0.02, 'highpass');
    stepIdx++;
    stepT = beat;
  }

  return {
    get ready() {
      return !!ctx;
    },
    get radio() {
      return station;
    },

    // Must be called from a user gesture. Safe to call repeatedly.
    init() {
      if (ctx) {
        if (ctx.state === 'suspended') ctx.resume();
        return;
      }
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        master = ctx.createGain();
        master.gain.value = 0.5;
        master.connect(ctx.destination);
      } catch {
        ctx = null;
      }
    },

    // Continuous engine hum; speed is 0..1 (0 = idle, 1 = top speed).
    setEngine(on, speed) {
      if (!ctx) return;
      if (on && !engineOsc) {
        engineOsc = ctx.createOscillator();
        engineOsc.type = 'sawtooth';
        engineSub = ctx.createOscillator();
        engineSub.type = 'sine';
        engineGain = ctx.createGain();
        engineGain.gain.value = 0.0;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 600;
        engineOsc.connect(filter);
        engineSub.connect(filter);
        filter.connect(engineGain).connect(master);
        engineOsc.start();
        engineSub.start();
      }
      if (!on && engineOsc) {
        try { engineOsc.stop(); engineSub.stop(); } catch { /* already stopped */ }
        engineOsc = null;
        engineSub = null;
        engineGain = null;
        return;
      }
      if (engineOsc) {
        const s = Math.max(0, Math.min(1, speed || 0));
        engineOsc.frequency.value = 55 + s * 90;
        engineSub.frequency.value = 27 + s * 45;
        engineGain.gain.value = 0.05 + s * 0.05;
      }
    },

    // Two-tone police siren; the tone alternates in update().
    // level 0..1 fades it with the nearest cop's distance.
    setSiren(on, level = 1) {
      if (!ctx) return;
      const gain = 0.04 * Math.max(0.15, Math.min(1, level));
      if (on && !sirenOsc) {
        sirenOsc = ctx.createOscillator();
        sirenOsc.type = 'triangle';
        sirenGain = ctx.createGain();
        sirenGain.gain.value = gain;
        sirenOsc.connect(sirenGain).connect(master);
        sirenOsc.start();
      } else if (on && sirenGain) {
        sirenGain.gain.value = gain;
      }
      if (!on && sirenOsc) {
        try { sirenOsc.stop(); } catch { /* already stopped */ }
        sirenOsc = null;
        sirenGain = null;
      }
    },

    // Looping rain noise (filtered white noise) while it rains.
    setRain(on) {
      if (!ctx) return;
      if (on && !rainSrc) {
        const len = ctx.sampleRate * 2;
        const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        let last = 0;
        for (let i = 0; i < len; i++) {
          const white = Math.random() * 2 - 1;
          last = (last + 0.02 * white) / 1.02; // pink-ish, softer than white
          data[i] = last * 3.5;
        }
        rainSrc = ctx.createBufferSource();
        rainSrc.buffer = buffer;
        rainSrc.loop = true;
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 1800;
        filter.Q.value = 0.4;
        rainGain = ctx.createGain();
        rainGain.gain.value = 0.06;
        rainSrc.connect(filter).connect(rainGain).connect(master);
        rainSrc.start();
      }
      if (!on && rainSrc) {
        try { rainSrc.stop(); } catch { /* already stopped */ }
        rainSrc = null;
        rainGain = null;
      }
    },

    shot(weapon) {
      if (weapon === 'shotgun') noiseBurst(0.18, 900, 0.5);
      else if (weapon === 'rifle') noiseBurst(0.12, 1400, 0.4);
      else if (weapon === 'smg') noiseBurst(0.07, 1800, 0.3);
      else noiseBurst(0.09, 1600, 0.35);
    },
    punch() {
      noiseBurst(0.08, 400, 0.4);
    },
    crash(strength) {
      noiseBurst(0.25, 500, Math.min(0.6, 0.2 + (strength || 0) * 0.02));
    },
    explosion() {
      noiseBurst(0.7, 300, 0.7);
      blip(55, 0.5, 0.4, 'sine');
    },
    uiClick() {
      blip(880, 0.06, 0.12, 'square');
    },
    wantedUp() {
      blip(660, 0.12, 0.15, 'square');
      blip(880, 0.18, 0.15, 'square', 0.12);
    },
    missionComplete() {
      const notes = [523, 659, 784, 1047];
      notes.forEach((f, i) => blip(f, 0.22, 0.14, 'triangle', i * 0.11));
    },

    setRadio(index) {
      station = ((index % RADIO_STATIONS.length) + RADIO_STATIONS.length) % RADIO_STATIONS.length;
      radioOn = true;
      stepIdx = 0;
      stepT = 0;
    },

    update(dt) {
      if (!ctx) return;
      // Siren alternates 700 / 950 Hz every 0.4 s.
      if (sirenOsc) {
        sirenPhase += dt;
        sirenOsc.frequency.value = Math.floor(sirenPhase / 0.4) % 2 === 0 ? 700 : 950;
      }
      // Radio sequencer.
      if (radioOn) {
        stepT -= dt;
        if (stepT <= 0) radioStep();
      }
    },
  };
}
