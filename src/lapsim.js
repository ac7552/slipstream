// The quasi-steady-state lap: a simpler, separate model of the same car, used to plan a lap and to check the
// full engine against. The car is a point that, at each speed, can turn, accelerate and brake as hard as its
// four tyres, engine and brakes allow at that speed, combined on a friction ellipse:
//
//   turning      the tyres' grip under static weight, downforce and the weight moved across the car, limited
//                by whichever axle gives up first
//   driving      the rear tyres' grip (with weight moved back), or the engine's best gear, whichever is less
//   braking      four tyres with the fixed brake bias, so the first axle to reach its limit sets the total, or
//                the brakes' own torque
//   resisting    drag and rolling resistance
//
// Two passes over the lap, one accelerating out of every corner and one braking back from the next, give the
// fastest speed the car can carry at each point. Nothing here is stepped in time.
import { CAR, G, downforce, drag, rpmFromWheel, torqueAt } from "./car.js";
import { gripAt } from "./tyre.js";
import { wheelLoads } from "./vehicle.js";

export const M_EFF = CAR.mass + (4 * CAR.wheelInertia) / CAR.wheelRadius ** 2; // the wheels' spin, as mass
const capacity = (load) => gripAt(load) * load;
const a = CAR.wheelbase * (1 - CAR.frontWeight), b = CAR.wheelbase * CAR.frontWeight; // CG to front, rear axle

// Fixed point in an acceleration: the limit depends on the loads, which depend on the acceleration.
function settle(f, guess) { let x = guess; for (let k = 0; k < 40; k++) x = 0.5 * x + 0.5 * f(x); return x; }

// The most sideways acceleration (m/s^2) at speed v.
export function lateralLimit(v) {
  return settle((ay) => {
    const L = wheelLoads({ vx: v, vy: 0, ax: 0, ay });
    const front = capacity(L[0]) + capacity(L[1]), rear = capacity(L[2]) + capacity(L[3]);
    return Math.min((front * CAR.wheelbase) / (CAR.mass * b), (rear * CAR.wheelbase) / (CAR.mass * a));
  }, 2 * G);
}

// The most the engine can push with (N at the road), in its best gear at speed v, no wheelspin.
export function engineForce(v) {
  let best = 0;
  for (let g = 1; g <= CAR.gears.length; g++) {
    let rpm = rpmFromWheel(v / CAR.wheelRadius, g);
    if (g === 1) rpm = Math.max(rpm, CAR.launchRpm); // the clutch slips at the start
    if (rpm >= CAR.limiterRpm) continue;
    best = Math.max(best, (torqueAt(rpm) * CAR.gears[g - 1] * CAR.efficiency) / CAR.wheelRadius);
  }
  return best;
}

// The most the rear tyres can push with (N), with the weight that moves back as the car speeds up.
export function tractionLimit(v) {
  return settle((F) => {
    const L = wheelLoads({ vx: v, vy: 0, ax: F / M_EFF, ay: 0 });
    return capacity(L[2]) + capacity(L[3]);
  }, CAR.mass * G);
}

// The most braking force (N) from the tyres and brakes, with the weight that moves forward.
export function brakingLimit(v) {
  return settle((F) => {
    const L = wheelLoads({ vx: v, vy: 0, ax: -F / M_EFF, ay: 0 });
    const front = capacity(L[0]) + capacity(L[1]), rear = capacity(L[2]) + capacity(L[3]);
    return Math.min(front / CAR.brakeBias, rear / (1 - CAR.brakeBias), CAR.brakeTorque / CAR.wheelRadius);
  }, 2 * CAR.mass * G);
}

export const resistance = (v) => drag(v) + CAR.rollingResistance * (CAR.mass * G + downforce(v));

// Tables against speed, every 0.25 m/s, so a lap is quick to plan.
const DV = 0.25, VMAX = 110;
let tables = null;
function table() {
  if (tables) return tables;
  const ay = [], push = [], brake = [];
  for (let v = 0; v <= VMAX + DV; v += DV) {
    ay.push(lateralLimit(v));
    push.push(Math.min(engineForce(v), tractionLimit(v)));
    brake.push(brakingLimit(v));
  }
  return (tables = { ay, push, brake });
}
const lookup = (arr, v) => { const x = Math.max(0, Math.min(VMAX, v)) / DV, i = Math.floor(x), f = x - i; return arr[i] * (1 - f) + arr[i + 1] * f; };

// Top speed on a straight: where the engine's push meets drag and rolling resistance.
let vtopCache = null;
export function topSpeed() {
  if (vtopCache) return vtopCache;
  let lo = 50, hi = VMAX;
  for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (Math.min(engineForce(m), tractionLimit(m)) > resistance(m)) lo = m; else hi = m; }
  return (vtopCache = lo);
}

// Fastest speed (m/s) through a constant curvature (1/m).
export function cornerSpeed(kappa) {
  const k = Math.abs(kappa), vtop = topSpeed();
  if (k < 1e-6) return vtop;
  let lo = 1, hi = vtop;
  if (hi * hi * k <= lookup(table().ay, hi)) return vtop;
  for (let it = 0; it < 50; it++) { const m = (lo + hi) / 2; if (m * m * k <= lookup(table().ay, m)) lo = m; else hi = m; }
  return lo;
}

// Plans a lap along a path given by its curvature and the distance between samples. Returns the speed at each
// sample and the lap time.
export function planLap({ curvature, ds }) {
  const n = curvature.length, T = table();
  const limit = curvature.map(cornerSpeed);
  const used = (v, k) => Math.min(1, (v * v * Math.abs(k)) / lookup(T.ay, v));
  const ellipse = (v, k) => Math.sqrt(Math.max(0, 1 - used(v, k) ** 2));
  const start = limit.indexOf(Math.min(...limit));
  const v = limit.slice();
  // Speeding up out of each corner, twice round so the lap joins up.
  for (let j = 0; j < 2 * n; j++) {
    const i = (start + j) % n, nx = (i + 1) % n;
    const acc = (lookup(T.push, v[i]) * ellipse(v[i], curvature[i]) - resistance(v[i])) / M_EFF;
    v[nx] = Math.min(v[nx], Math.sqrt(Math.max(0, v[i] * v[i] + 2 * acc * ds[i])));
  }
  // Braking back from each corner.
  for (let j = 0; j < 2 * n; j++) {
    const nx = (start - j + 2 * n) % n, i = (nx - 1 + n) % n;
    const dec = (lookup(T.brake, v[nx]) * ellipse(v[nx], curvature[nx]) + resistance(v[nx])) / M_EFF;
    v[i] = Math.min(v[i], Math.sqrt(v[nx] * v[nx] + 2 * dec * ds[i]));
  }
  let time = 0;
  for (let i = 0; i < n; i++) time += (2 * ds[i]) / (v[i] + v[(i + 1) % n]);
  return { speed: v, limit, time };
}
