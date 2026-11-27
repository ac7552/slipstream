// Sound, made in the browser from the engine's state: no recordings. The engine note is built from the firing
// frequency of a six-cylinder four-stroke (three pulses per turn of the crank) and its harmonics, roughened
// and opened up with the throttle; tyres scrub with filtered noise when they slip; wind rises with speed;
// kerbs rumble; a hit on the barrier thumps.
export function makeSound() {
  let ctx = null, nodes = null, muted = false;

  function noiseBuffer(c) {
    const b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  function start() {
    if (ctx) { ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    const master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.55;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);

    // Engine: three oscillators an octave and a fifth apart, through a soft clipper and a low-pass filter.
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = (i / 512) - 1; curve[i] = Math.tanh(2.2 * x); }
    shaper.curve = curve;
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass"; tone.Q.value = 2.5;
    const engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    shaper.connect(tone).connect(engineGain).connect(master);
    const osc = [["sawtooth", 1, 0.5], ["square", 0.5, 0.35], ["sawtooth", 2, 0.18], ["triangle", 1.5, 0.2]].map(([type, mul, level]) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; g.gain.value = level;
      o.connect(g).connect(shaper);
      o.start();
      return { o, mul };
    });
    // Intake roar: noise around the firing frequency.
    const nb = noiseBuffer(ctx);
    const intake = ctx.createBufferSource(); intake.buffer = nb; intake.loop = true;
    const intakeF = ctx.createBiquadFilter(); intakeF.type = "bandpass"; intakeF.Q.value = 1.2;
    const intakeG = ctx.createGain(); intakeG.gain.value = 0;
    intake.connect(intakeF).connect(intakeG).connect(master); intake.start();
    // Tyres.
    const squeal = ctx.createBufferSource(); squeal.buffer = nb; squeal.loop = true;
    const squealF = ctx.createBiquadFilter(); squealF.type = "bandpass"; squealF.frequency.value = 1100; squealF.Q.value = 9;
    const squealG = ctx.createGain(); squealG.gain.value = 0;
    squeal.connect(squealF).connect(squealG).connect(master); squeal.start(0, 0.7);
    // Wind.
    const wind = ctx.createBufferSource(); wind.buffer = nb; wind.loop = true;
    const windF = ctx.createBiquadFilter(); windF.type = "lowpass"; windF.frequency.value = 500;
    const windG = ctx.createGain(); windG.gain.value = 0;
    wind.connect(windF).connect(windG).connect(master); wind.start(0, 1.3);
    // Kerb rumble: a low square wave gated by the kerb.
    const rumble = ctx.createOscillator(); rumble.type = "square";
    const rumbleF = ctx.createBiquadFilter(); rumbleF.type = "lowpass"; rumbleF.frequency.value = 180;
    const rumbleG = ctx.createGain(); rumbleG.gain.value = 0;
    rumble.connect(rumbleF).connect(rumbleG).connect(master); rumble.start();

    nodes = { master, osc, tone, engineGain, intakeF, intakeG, squealF, squealG, windF, windG, rumble, rumbleG, nb };
  }

  // Called every frame with what the car is doing.
  function update({ rpm, throttle, speed, slip, kerb, cut }) {
    if (!ctx || !nodes) return;
    const t = ctx.currentTime, k = 0.03;
    const firing = (rpm / 60) * 3; // Hz
    for (const { o, mul } of nodes.osc) o.frequency.setTargetAtTime(firing * mul * 0.5, t, 0.01);
    const load = cut ? 0.15 : 0.35 + 0.65 * throttle;
    nodes.engineGain.gain.setTargetAtTime(0.18 + 0.3 * load, t, k);
    nodes.tone.frequency.setTargetAtTime(500 + 2600 * load + rpm * 0.12, t, k);
    nodes.intakeF.frequency.setTargetAtTime(firing, t, k);
    nodes.intakeG.gain.setTargetAtTime(0.12 * throttle * (rpm / 15000), t, k);
    const scrub = Math.max(0, Math.min(1, (slip - 0.06) * 5));
    nodes.squealG.gain.setTargetAtTime(speed > 3 ? 0.22 * scrub : 0, t, 0.05);
    nodes.squealF.frequency.setTargetAtTime(900 + 500 * scrub, t, 0.05);
    const v = Math.min(1, speed / 95);
    nodes.windG.gain.setTargetAtTime(0.25 * v * v, t, 0.1);
    nodes.windF.frequency.setTargetAtTime(300 + 1400 * v, t, 0.1);
    nodes.rumble.frequency.setTargetAtTime(Math.max(8, speed / 1.5), t, 0.02);
    nodes.rumbleG.gain.setTargetAtTime(kerb ? 0.35 : 0, t, 0.02);
  }

  function thump(strength = 1) {
    if (!ctx || !nodes) return;
    const s = ctx.createBufferSource(); s.buffer = nodes.nb;
    const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 220;
    const g = ctx.createGain(), t = ctx.currentTime;
    g.gain.setValueAtTime(Math.min(1.2, 0.5 * strength), t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    s.connect(f).connect(g).connect(nodes.master);
    s.start(t, Math.random()); s.stop(t + 0.6);
  }

  function setMuted(m) {
    muted = m;
    if (nodes) nodes.master.gain.setTargetAtTime(m ? 0 : 0.55, ctx.currentTime, 0.05);
  }

  function pause(p) { if (ctx) (p ? ctx.suspend() : ctx.resume()); }

  return { start, update, thump, setMuted, pause, get muted() { return muted; } };
}
