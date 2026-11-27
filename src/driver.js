// A driver for the car: it follows the racing line at a share of the planned speed. It drives the full engine
// with the same pedals and wheel a person has, so a lap it drives is a test of the engine as a whole, and on
// the page it can take over the car. It steers by the line's own curvature a moment ahead, corrected for its
// heading and for how far the front of the car is off the line, and it chases the planned speed a moment
// ahead, so it brakes before each corner, not in it. It uses traction control and ABS.
import { CAR } from "./car.js";
import { STEP, locate } from "./track.js";
import { applyAssists, newAssists } from "./assists.js";

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const UNDERSTEER = 0.00006; // rad of extra steering per m/s^2 of cornering: this car is close to neutral

export function newDriver(track, line, plan, { pace = 0.98 } = {}) {
  return { track, line, plan, pace, hint: null, assists: newAssists(), loc: null };
}

// The pedals and wheel for this step: { throttle, brake, steer } with steer in -1..1.
export function drive(d, s, dt) {
  const loc = locate(d.track, s.x, s.y, d.hint);
  d.hint = loc.i; d.loc = loc;
  const n = d.line.n, v = Math.max(2, Math.hypot(s.vx, s.vy));

  // Steering: the angle the line's own curvature asks for a moment ahead (with the extra a car needs as it
  // understeers), plus corrections for the heading and for how far the front axle is off the line.
  const lp = d.line.points;
  let j = loc.i, best = Infinity;
  const fx = s.x + Math.cos(s.heading) * 1.9, fy = s.y + Math.sin(s.heading) * 1.9; // near the front axle
  for (let k = loc.i - 12; k <= loc.i + 12; k++) {
    const p = lp[(k + n) % n], dd = (p[0] - fx) ** 2 + (p[1] - fy) ** 2;
    if (dd < best) { best = dd; j = (k + n) % n; }
  }
  const p0 = lp[j], p1 = lp[(j + 1) % n];
  const lineHeading = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
  const err = (Math.cos(lineHeading) * (fy - p0[1]) - Math.sin(lineHeading) * (fx - p0[0])); // left of the line +
  let headingErr = lineHeading - s.heading - Math.atan2(s.vy, Math.max(2, s.vx));
  headingErr = Math.atan2(Math.sin(headingErr), Math.cos(headingErr));
  let kappa = 0;
  const pre = Math.round((0.12 * v) / STEP);
  for (let k = 0; k <= 2; k++) kappa += d.line.curvature[(j + pre + k) % n] / 3;
  const ff = Math.atan(CAR.wheelbase * kappa) + UNDERSTEER * v * v * kappa;
  const angle = ff + 0.9 * headingErr - Math.atan((0.9 * err) / (v + 3)) - 0.03 * (s.r - v * kappa);
  const steer = clamp(angle / CAR.maxSteer, -1, 1);

  let target = Infinity;
  const ahead = Math.round((0.2 * v + 3) / STEP);
  for (let j = 0; j <= ahead; j++) target = Math.min(target, d.plan.speed[(loc.i + j) % n]);
  target *= d.pace;
  const e = target - v;
  let throttle = clamp(0.6 + 0.6 * e, 0, 1), brake = clamp(-0.6 * (e + 0.3), 0, 1);
  if (brake > 0) throttle = 0;
  ({ throttle, brake } = applyAssists(d.assists, s, throttle, brake, dt));
  return { throttle, brake, steer };
}
