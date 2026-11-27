// Pedals and steering from the keyboard or a gamepad. Keys are on or off, so they are smoothed the way a
// person's foot and hands would move: the throttle and brake take a moment to go down, and the steering turns
// in at a set rate and asks for less lock at speed, where a little goes a long way. A gamepad's triggers and
// stick are used as they are, with a small dead zone.
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function makeInput(actions) {
  const down = new Set();
  const state = { throttle: 0, brake: 0, steer: 0, source: "keyboard" };
  const pressed = new Map(); // gamepad buttons, for edges

  const map = {
    ArrowUp: "throttle", KeyW: "throttle", ArrowDown: "brake", KeyS: "brake",
    ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right",
  };
  const once = {
    KeyE: "up", KeyX: "up", KeyQ: "down", KeyZ: "down", KeyC: "camera", KeyR: "reset", KeyP: "autopilot",
    KeyT: "tc", KeyB: "abs", KeyG: "auto", KeyM: "mute", KeyL: "line", KeyH: "help", Escape: "pause",
  };
  addEventListener("keydown", (e) => {
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    if (map[e.code]) { down.add(map[e.code]); state.source = "keyboard"; e.preventDefault(); }
    else if (once[e.code] && !e.repeat) { actions(once[e.code]); e.preventDefault(); }
  });
  addEventListener("keyup", (e) => { if (map[e.code]) down.delete(map[e.code]); });
  addEventListener("blur", () => down.clear());

  // Gamepad: right trigger throttle, left trigger brake, left stick steer; bumpers shift; Y camera, B reset,
  // X autopilot, Start pause.
  function pad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p || !p.connected) continue;
      const btn = (i) => (p.buttons[i] ? p.buttons[i].value : 0);
      const edge = (i, action) => { const on = btn(i) > 0.5; if (on && !pressed.get(i)) actions(action); pressed.set(i, on); };
      edge(5, "up"); edge(4, "down"); edge(3, "camera"); edge(1, "reset"); edge(2, "autopilot"); edge(9, "pause");
      const x = p.axes[0] || 0, dz = 0.06;
      const stick = Math.abs(x) < dz ? 0 : (Math.sign(x) * (Math.abs(x) - dz)) / (1 - dz);
      const t = btn(7), b = btn(6);
      if (t > 0.02 || b > 0.02 || Math.abs(stick) > 0) state.source = "gamepad";
      if (state.source === "gamepad") return { throttle: t, brake: b, steer: -Math.sign(stick) * Math.abs(stick) ** 1.6 };
    }
    return null;
  }

  // Called once a frame: dt in seconds, speed in m/s.
  function read(dt, speed) {
    const p = pad();
    if (p) { Object.assign(state, p); return state; }
    const ramp = (v, on, upRate, downRate) => clamp(v + (on ? upRate : -downRate) * dt, 0, 1);
    state.throttle = ramp(state.throttle, down.has("throttle"), 6, 10);
    state.brake = ramp(state.brake, down.has("brake"), 8, 12);
    const want = (down.has("left") ? 1 : 0) - (down.has("right") ? 1 : 0);
    const reach = clamp(1 - speed / 70, 0.18, 1); // less lock at speed
    const target = want * reach;
    const rate = want === 0 || Math.sign(want) !== Math.sign(state.steer) ? 5 : 2.2;
    state.steer += clamp(target - state.steer, -rate * dt, rate * dt);
    return state;
  }

  return { read, state };
}
