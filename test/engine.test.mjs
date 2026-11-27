import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import { CAR, G, downforce } from "../src/car.js";
import { TYRE, gripAt, magic, peakSlip, tyreForces } from "../src/tyre.js";
import { newCar, step, wheelLoads } from "../src/vehicle.js";
import { CIRCUIT, HALF_WIDTH, RUNOFF, STEP, buildTrack, locate } from "../src/track.js";
import { cornerSpeed, lateralLimit, topSpeed } from "../src/lapsim.js";
import { coastDown, drivenLaps, flatOut, steadyYaw } from "../tools/runs.mjs";
import { measure } from "../tools/baseline.mjs";

const close = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (tolerance ${tol})`);
const reference = (name) => JSON.parse(fs.readFileSync(new URL(`./reference/${name}.json`, import.meta.url)));

// The bar: reference tables in test/reference/, each with its own stated tolerance.
test("reference table: coasting in neutral matches the closed-form coast-down", () => {
  const ref = reference("coast-down");
  for (const v0 of new Set(ref.rows.map((r) => r.v0_kmh))) {
    const rows = ref.rows.filter((r) => r.v0_kmh === v0);
    const got = coastDown(v0 / 3.6, rows.map((r) => r.t_s));
    rows.forEach((r, i) => close(got[i], r.v_m_s, ref.tolerance_fraction_of_v0 * (v0 / 3.6), `from ${v0} km/h at ${r.t_s} s`));
  }
});

test("reference table: flat out in a gear settles at the steady-state top speed", () => {
  const ref = reference("top-speed");
  for (const r of ref.rows) close(flatOut(r.gear, r.v_m_s - 3, 40) * 3.6, r.v_kmh, ref.tolerance_kmh, `gear ${r.gear}`);
});

test("reference table: steady yaw rate matches the linear bicycle model", () => {
  const ref = reference("yaw-gain");
  for (const r of ref.rows) {
    const got = steadyYaw(r.v_m_s, r.steer_rad);
    close(got.yawRate / r.yaw_rate_rad_s, 1, ref.tolerance_fraction, `${r.v_m_s} m/s`);
  }
});

test("regression: launch, braking and laps keep to the recorded baseline", () => {
  const ref = reference("baseline"), now = measure(), tol = ref.tolerance_fraction;
  for (const m of ref.launch) close(now.launch.find((x) => x.kmh === m.kmh).time_s / m.time_s, 1, tol, `0 to ${m.kmh} km/h`);
  close(now.braking_300_100.distance_m / ref.braking_300_100.distance_m, 1, tol, "braking distance 300 to 100 km/h");
  close(now.planned_lap_s / ref.planned_lap_s, 1, tol, "planned lap");
  close(now.driven_lap_s / ref.driven_lap_s, 1, tol, "driven lap");
});

// The engine's own rules.
test("the tyres: peak force is grip times load, grip falls as load rises, and the friction ellipse holds", () => {
  for (const c of [TYRE.lon, TYRE.lat]) close(magic(peakSlip(c), c), 1, 1e-4, "Magic Formula peak");
  assert.ok(gripAt(2000) > gripAt(4000) && gripAt(4000) > gripAt(8000), "load sensitivity");
  close(gripAt(TYRE.refLoad), TYRE.grip, 1e-12, "grip at the reference load");
  for (const slip of [-0.5, -0.1, 0, 0.05, 0.11, 0.4]) for (const angle of [-0.3, -0.05, 0, 0.1, 0.2]) {
    const [fx, fy] = tyreForces(slip, angle, 5000);
    assert.ok(Math.hypot(fx, fy) <= gripAt(5000) * 5000 + 1e-6, `ellipse at ${slip}, ${angle}`);
    assert.ok(fy * angle <= 0, "the side force pushes against the slip angle");
  }
});

test("loads: they add up to the weight plus the downforce, however the car is accelerating", () => {
  for (const [v, ax, ay] of [[0, 0, 0], [50, 0, 0], [80, -40, 0], [60, 10, 25], [30, 0, -18]]) {
    const L = wheelLoads({ vx: v, vy: 0, ax, ay });
    close(L.reduce((a, b) => a + b), CAR.mass * G + downforce(v), 1e-6, `${v} m/s, ax ${ax}, ay ${ay}`);
  }
  const L = wheelLoads({ vx: 0, vy: 0, ax: 0, ay: 0 });
  close((L[0] + L[1]) / (CAR.mass * G), CAR.frontWeight, 1e-12, "static front share");
  const braking = wheelLoads({ vx: 60, vy: 0, ax: -40, ay: 0 }), cruising = wheelLoads({ vx: 60, vy: 0, ax: 0, ay: 0 });
  assert.ok(braking[0] > cruising[0] && braking[2] < cruising[2], "braking moves weight forward");
  const left = wheelLoads({ vx: 40, vy: 0, ax: 0, ay: 20 });
  assert.ok(left[1] > left[0] && left[3] > left[2], "a left turn loads the right-hand tyres");
});

test("a car at rest stays at rest, and a coasting car never gains energy", () => {
  const s = newCar();
  for (let k = 0; k < 3000; k++) step(s, { throttle: 0, brake: 0, steer: 0 });
  close(Math.hypot(s.x, s.y), 0, 1e-9, "creep");
  const c = newCar({ speed: 70, gear: 0, auto: false });
  const energy = () => 0.5 * CAR.mass * (c.vx ** 2 + c.vy ** 2) + 0.5 * CAR.wheelInertia * c.omega.reduce((a, w) => a + w * w, 0);
  let last = energy();
  for (let k = 0; k < 10000; k++) {
    step(c, { throttle: 0, brake: 0, steer: 0.3 * Math.sin(k / 400) });
    const e = energy();
    assert.ok(e <= last + 1e-6, `energy rose at step ${k}`);
    last = e;
  }
});

test("the circuit closes on itself, turns once round, and never comes near itself", () => {
  const t = buildTrack();
  close(t.heading[t.n - 1] + t.curvature[t.n - 1] * STEP, -2 * Math.PI, 1e-9, "total turn (clockwise)");
  const end = t.points[t.n - 1], h = t.heading[t.n - 1] + t.curvature[t.n - 1] * STEP;
  close(Math.hypot(end[0] + STEP * Math.cos(h), end[1] + STEP * Math.sin(h)), 0, 0.05, "gap at the start line");
  for (const L of t.openStraights) assert.ok(L > 100, `open straight ${L} m`);
  close(t.length, 4326, 2, "lap length");
  // Parts of the lap more than 300 m apart along it stay further apart than both run-off areas.
  for (let i = 0; i < t.n; i += 5) for (let j = i + 150; j < t.n; j += 5) {
    if (t.n - (j - i) < 150) continue;
    const d = Math.hypot(t.points[i][0] - t.points[j][0], t.points[i][1] - t.points[j][1]);
    assert.ok(d > 2 * RUNOFF + 20, `${i * STEP} m and ${j * STEP} m are ${d.toFixed(1)} m apart`);
  }
  assert.ok(CIRCUIT.filter((s) => s[0] === "straight" && s[1] === null).length === 2, "two open straights");
  const h7 = t.heading[700], loc = locate(t, t.points[700][0] - 3 * Math.sin(h7), t.points[700][1] + 3 * Math.cos(h7));
  assert.equal(loc.i, 700);
  close(loc.lateral, 3, 0.001, "3 m to the left");
});

test("the lap planner: grip rises with downforce, corners have a speed limit, top speed matches the table", () => {
  assert.ok(lateralLimit(80) > lateralLimit(40) && lateralLimit(40) > lateralLimit(10), "more grip with speed");
  close(lateralLimit(0) / G, 1.8, 0.1, "under 2 g with no downforce");
  assert.ok(cornerSpeed(1 / 55) < cornerSpeed(1 / 200), "tighter corners are slower");
  close(topSpeed() * 3.6, reference("top-speed").rows.at(-1).v_kmh, 2, "planner's top speed");
});

test("the driver laps the circuit on the asphalt, within 5 % of the planned lap", () => {
  const r = drivenLaps(2);
  assert.equal(r.lapTimes.length, 2);
  assert.ok(r.widest_m <= HALF_WIDTH, `widest ${r.widest_m} m from the centre line`);
  assert.equal(r.barrierHits, 0);
  assert.ok(r.lapTimes[1] >= r.planned_s, "no faster than the plan");
  close(r.lapTimes[1] / r.planned_s, 1, 0.05, "flying lap against the plan");
});
