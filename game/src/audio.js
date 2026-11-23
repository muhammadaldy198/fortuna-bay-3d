// Sound, synthesized: no audio files, no network — every noise is an
// oscillator or a burst of generated static through the Web Audio API. The
// engine hums with speed, the siren wails in two tones, gunshots crack,
// coins chime. The context is created at boot (suspended until the first
// key press, as browsers require) and every call is guarded, so a browser
// without audio simply plays silent.

/**
 * Create the audio system for world G. Returns:
 * - context — the AudioContext, or null when audio is unavailable
 * - siren(on) / engine(speed, driving) / gunshot() / punch() / door() / coin()
 * - setMuted(muted)
 * - update(dt)
 */
export function createAudio(G) {
  let context = null;
  let master = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenLfo = null;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;
  let muted = false;

  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    context = new AudioContextClass();
    master = context.createGain();
    master.gain.value = 0.5;
    master.connect(context.destination);
  } catch {
    context = null;
  }

  function resume() {
    if (context && context.state === 'suspended') context.resume().catch(() => {});
  }
  window.addEventListener('keydown', resume, { once: false });
  window.addEventListener('mousedown', resume, { once: false });

  function blip(freq, dur, type, vol, slideTo) {
    if (!context || muted) return;
    resume();
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, context.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, context.currentTime + dur);
    gain.gain.setValueAtTime(vol || 0.2, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    osc.stop(context.currentTime + dur);
  }

  function noiseBurst(dur, filterFreq, vol) {
    if (!context || muted) return;
    resume();
    const len = Math.floor(context.sampleRate * dur);
    const buffer = context.createBuffer(1, len, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterFreq;
    const gain = context.createGain();
    gain.gain.value = vol || 0.4;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start();
  }

  function siren(on) {
    if (!context) return;
    if (on && !sirenOsc) {
      resume();
      sirenOsc = context.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 820;
      sirenLfo = context.createOscillator();
      sirenLfo.type = 'sine';
      sirenLfo.frequency.value = 0.9;
      const lfoGain = context.createGain();
      lfoGain.gain.value = 180;
      sirenLfo.connect(lfoGain);
      lfoGain.connect(sirenOsc.frequency);
      sirenGain = context.createGain();
      sirenGain.gain.value = muted ? 0 : 0.06;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      sirenLfo.start();
    } else if (!on && sirenOsc) {
      try {
        sirenOsc.stop();
        sirenLfo.stop();
      } catch { /* already stopped */ }
      sirenOsc = null;
      sirenLfo = null;
      sirenGain = null;
    } else if (sirenGain) {
      sirenGain.gain.value = muted ? 0 : 0.06;
    }
  }

  function engine(speed, driving) {
    if (!context) return;
    if (driving && !engineOsc) {
      resume();
      engineOsc = context.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 60;
      engineFilter = context.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 400;
      engineGain = context.createGain();
      engineGain.gain.value = muted ? 0 : 0.05;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
    } else if (!driving && engineOsc) {
      try {
        engineOsc.stop();
      } catch { /* already stopped */ }
      engineOsc = null;
      engineGain = null;
      engineFilter = null;
    }
    if (engineOsc) {
      engineOsc.frequency.value = 55 + Math.abs(speed) * 3.2;
      engineFilter.frequency.value = 300 + Math.abs(speed) * 22;
      engineGain.gain.value = muted ? 0 : 0.05;
    }
  }

  function gunshot() {
    noiseBurst(0.16, 1200, 0.5);
  }

  function punch() {
    blip(150, 0.12, 'sine', 0.35, 55);
  }

  function door() {
    blip(220, 0.08, 'square', 0.12, 180);
  }

  function coin() {
    blip(880, 0.12, 'sine', 0.2);
    setTimeout(() => blip(1320, 0.18, 'sine', 0.2), 90);
  }

  function setMuted(value) {
    muted = value;
    if (master) master.gain.value = muted ? 0 : 0.5;
  }

  function update() {
    if (!context) return;
    const driving = !!G.player.car;
    engine(driving ? G.player.car.speed : 0, driving);
  }

  return {
    get context() {
      return context;
    },
    siren,
    engine,
    gunshot,
    punch,
    door,
    coin,
    setMuted,
    update,
  };
}
