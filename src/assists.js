// Driver aids: traction control and anti-lock brakes. Each one trims the pedal so the worst tyre keeps some
// grip in hand. A tyre's grip is shared between driving or braking and turning (the friction ellipse in
// tyre.js), so they watch both slips together, each as a share of the slip where the tyre grips best:
//
//   use = hypot(slip ratio / 0.11, slip angle / 0.137)
//
// and hold it near 0.85. Traction control watches the rear tyres under power, so a car that is turning keeps
// enough sideways grip at the back not to spin; ABS watches all four under braking. They act on the pedal the
// driver gives, every step, the way a real system acts on the engine and the brake pressure; the car itself is
// unchanged. Real cars of this class race without them; the page lets you switch them off.
import { TYRE, peakSlip } from "./tyre.js";

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const PEAK_SLIP = peakSlip(TYRE.lon), PEAK_ANGLE = peakSlip(TYRE.lat);
export const TARGET_USE = 0.85;
const GAIN = 7; // pedal per second, per unit of error in use

export const tyreUse = (slip, angle) => Math.hypot(slip / PEAK_SLIP, angle / PEAK_ANGLE);

export const newAssists = () => ({ tc: true, abs: true, tcLimit: 1, absLimit: 1, tcActive: false, absActive: false });

// Returns the throttle and brake to use this step.
export function applyAssists(a, s, throttle, brake, dt) {
  if (a.tc && s.gear > 0) {
    const use = Math.max(tyreUse(Math.max(0, s.slip[2]), s.angle[2]), tyreUse(Math.max(0, s.slip[3]), s.angle[3]));
    a.tcLimit = clamp(a.tcLimit + dt * GAIN * (TARGET_USE - use), 0, 1);
    if (throttle <= a.tcLimit) a.tcLimit = Math.max(a.tcLimit, throttle); // nothing to trim
    a.tcActive = throttle > a.tcLimit + 0.01;
    throttle = Math.min(throttle, a.tcLimit);
  } else a.tcActive = false;
  if (a.abs && Math.hypot(s.vx, s.vy) > 2) {
    let use = 0;
    for (let i = 0; i < 4; i++) use = Math.max(use, tyreUse(Math.min(0, s.slip[i]), s.angle[i]));
    a.absLimit = clamp(a.absLimit + dt * GAIN * (TARGET_USE - use), 0.05, 1);
    if (brake <= a.absLimit) a.absLimit = Math.max(a.absLimit, brake);
    a.absActive = brake > a.absLimit + 0.01;
    brake = Math.min(brake, a.absLimit);
  } else a.absActive = false;
  return { throttle, brake };
}
