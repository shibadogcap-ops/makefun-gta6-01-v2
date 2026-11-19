// WebAudio synth for Palm Bay Heat: a continuous engine drone and siren plus one-shot
// noise/sine effects. Nothing is created until ensure() is called from a user gesture, so
// browsers never block the context and every method is a harmless no-op before that point.

/** A tiny deterministic PRNG for the noise buffer — no Math.random() anywhere in the game. */
let noiseSeed = 0x13579bdf;
function noiseRandom() {
  noiseSeed = (Math.imul(noiseSeed, 1664525) + 1013904223) >>> 0;
  return noiseSeed / 4294967296;
}

function clamp01(v) {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}

export function createAudio() {
  const audio = { muted: false };

  // All WebAudio state stays private to this instance.
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let noiseBuffer = null;
  let sirenPhase = 0;

  function buildNoiseBuffer() {
    const length = Math.floor(ctx.sampleRate); // exactly one second
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = noiseRandom() * 2 - 1;
    return buffer;
  }

  /** Create (or resume) the context. Safe to call on every click/keypress. */
  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return; // no WebAudio support: stay silent

    ctx = new AudioCtor();

    master = ctx.createGain();
    master.gain.value = audio.muted ? 0 : 0.5;
    master.connect(ctx.destination);

    // Engine: sawtooth -> gain -> lowpass -> master.
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 700;
    engineOsc.connect(engineGain);
    engineGain.connect(engineFilter);
    engineFilter.connect(master);
    engineOsc.start();

    // Siren: square -> gain -> master; the two-tone wail is driven by sirenPhase in update().
    sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'square';
    sirenOsc.frequency.value = 700;
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    sirenOsc.connect(sirenGain);
    sirenGain.connect(master);
    sirenOsc.start();

    noiseBuffer = buildNoiseBuffer();
  }

  /** Continuous levels: engine 0..1 (throttle/speed), siren 0..1 (loudness). */
  function update(dt, levels) {
    if (!ctx) return;
    const lvl = levels || {};
    const engine = clamp01(lvl.engine);
    const siren = clamp01(lvl.siren);
    const t = ctx.currentTime;

    engineOsc.frequency.setTargetAtTime(50 + engine * 140, t, 0.08);
    engineGain.gain.setTargetAtTime(engine > 0.02 ? 0.05 + engine * 0.10 : 0, t, 0.08);

    sirenPhase += dt * 2.2;
    const wail = Math.sin(sirenPhase * Math.PI) > 0 ? 880 : 660;
    sirenOsc.frequency.setTargetAtTime(wail, t, 0.03);
    sirenGain.gain.setTargetAtTime(siren * 0.045, t, 0.03);
  }

  /** One filtered slice of the shared noise buffer with a fast decay envelope. */
  function noiseBurst(duration, filterType, frequency, peak, decay) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = frequency;
    const gain = ctx.createGain();
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(peak, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t);
    src.stop(t + duration);
  }

  /** Short band-passed crack. */
  function shot() {
    if (!ctx) return;
    noiseBurst(0.09, 'bandpass', 900, 0.25, 0.06);
  }

  /** Low thud plus a short body hit blip. */
  function hit() {
    if (!ctx) return;
    noiseBurst(0.05, 'lowpass', 400, 0.2, 0.045);
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(90, t);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + 0.12);
  }

  /** Two staggered sine notes: the job-complete chime. */
  function chime() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const notes = [[880, 0], [1320, 0.07]];
    for (const [freq, delay] of notes) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + delay);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.12, t + delay);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + delay + 0.18);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t + delay);
      osc.stop(t + delay + 0.18);
    }
  }

  /** A single rising sine blip for pickups. */
  function pickup() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, t);
    osc.frequency.exponentialRampToValueAtTime(780, t + 0.09);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + 0.1);
  }

  /** Flip mute and fade the master bus; returns the new muted flag. */
  function toggleMute() {
    audio.muted = !audio.muted;
    if (ctx) master.gain.setTargetAtTime(audio.muted ? 0 : 0.5, ctx.currentTime, 0.02);
    return audio.muted;
  }

  audio.ensure = ensure;
  audio.update = update;
  audio.shot = shot;
  audio.hit = hit;
  audio.chime = chime;
  audio.pickup = pickup;
  audio.toggleMute = toggleMute;
  return audio;
}
