// The engine's side of each check: short runs of the full vehicle engine, shared by the tests, the accuracy
// report and the regression baseline.
import { buildTrack, groundFor, barrier, HALF_WIDTH } from "../src/track.js";
import { racingLine } from "../src/line.js";
import { planLap } from "../src/lapsim.js";
import { DT, newCar, step } from "../src/vehicle.js";
import { applyAssists, newAssists } from "../src/assists.js";
import { drive, newDriver } from "../src/driver.js";
import { CAR } from "../src/car.js";

// Coasting in neutral from v0 (m/s); speed at each time asked for (s, ascending).
export function coastDown(v0, times) {
  const s = newCar({ speed: v0, gear: 0, auto: false });
  const out = [];
  for (const t of times) { while (s.t < t - 1e-9) step(s, { throttle: 0, brake: 0, steer: 0 }); out.push(s.vx); }
  return out;
}

// Flat out in one gear from a start speed (m/s) for a while; the speed it settles at.
export function flatOut(gear, v0, seconds = 40) {
  const s = newCar({ speed: v0, gear, auto: false });
  while (s.t < seconds) step(s, { throttle: 1, brake: 0, steer: 0 });
  return s.vx;
}

// A fixed small steering angle (rad at the road wheels) at a held speed (m/s); the steady yaw rate.
export function steadyYaw(v, delta, seconds = 12) {
  const s = newCar({ speed: v, gear: 8, auto: true });
  let integral = 0;
  while (s.t < seconds) {
    const e = v - s.vx;
    integral += e * DT;
    const throttle = Math.max(0, Math.min(1, 0.3 + 0.5 * e + 0.5 * integral));
    step(s, { throttle, brake: 0, steer: delta / CAR.maxSteer });
  }
  return { yawRate: s.r, speed: s.vx, steer: s.steer };
}

// Standing start, flat out, with traction control: times to each speed mark (km/h).
export function launch(marks = [100, 200, 300]) {
  const s = newCar(), a = newAssists(), got = {};
  while (s.t < 30 && Object.keys(got).length < marks.length) {
    const { throttle, brake } = applyAssists(a, s, 1, 0, DT);
    step(s, { throttle, brake, steer: 0 });
    for (const m of marks) if (got[m] === undefined && s.vx * 3.6 >= m) got[m] = s.t;
  }
  return marks.map((m) => ({ kmh: m, time_s: got[m] }));
}

// Full braking with ABS from one speed to another (km/h): distance and time.
export function braking(fromKmh = 300, toKmh = 100) {
  const s = newCar({ speed: fromKmh / 3.6, gear: 8 }), a = newAssists();
  let peak = 0;
  while (s.vx * 3.6 > toKmh) {
    const { brake } = applyAssists(a, s, 0, 1, DT);
    step(s, { throttle: 0, brake, steer: 0 });
    peak = Math.max(peak, -s.ax);
  }
  return { distance_m: s.x, time_s: s.t, peak_g: peak / 9.81 };
}

// The circuit, its racing line and the planned lap, built once.
let world = null;
export function circuit() {
  if (world) return world;
  const track = buildTrack(), line = racingLine(track), plan = planLap(line);
  return (world = { track, line, plan });
}

// The driver takes the car from rest on the line round the circuit; the second lap is a flying lap.
export function drivenLaps(laps = 2, pace = 0.98) {
  const { track, line, plan } = circuit();
  const p0 = line.points[0], p1 = line.points[1];
  const s = newCar({ x: p0[0], y: p0[1], heading: Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) });
  const d = newDriver(track, line, plan, { pace });
  const ground = groundFor(track);
  const crossings = [];
  let last = 0, widest = 0, barrierHits = 0, offLine = 0;
  while (crossings.length < laps && s.t < 200) {
    step(s, drive(d, s, DT), DT, ground);
    if (barrier(track, s, d.hint).hit) barrierHits++;
    widest = Math.max(widest, Math.abs(d.loc.lateral));
    offLine = Math.max(offLine, Math.abs(d.loc.lateral - line.offset[d.loc.i]));
    if (d.loc.s < last - track.length / 2 && s.t > 1) crossings.push(s.t); // the start is on the line
    last = d.loc.s;
  }
  const times = crossings.map((t, i) => (i === 0 ? t : t - crossings[i - 1]));
  return { lapTimes: times, widest_m: widest, offLine_m: offLine, barrierHits, edge_m: HALF_WIDTH, planned_s: plan.time };
}
