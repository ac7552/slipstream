// Writes the reference tables in test/reference/: answers worked out on paper from the car's numbers, without
// running the engine. The engine is then held to them by the tests. Run:  node tools/make_reference.mjs
//
//   coast-down   rolling to a stop in neutral: drag and rolling resistance (both growing with v^2 because
//                downforce adds load), with the wheels' spin counted as extra mass. Closed form:
//                  m_eff dv/dt = -(A + B v^2)  =>  v(t) = sqrt(A/B) tan(atan(v0 sqrt(B/A)) - sqrt(A B) t / m_eff)
//   top-speed    flat out in one gear: the speed where the engine's push at the rear tyres equals drag plus
//                rolling resistance, with the rear tyres' own slip setting the engine speed. Solved by bisection.
//   yaw-gain     steady cornering at small steering angles: the linear bicycle model with a limited-slip
//                differential, which pushes the slower inside rear wheel harder and so resists turning:
//                  r = v delta / (L + K v^2 + (D v / L) (1 / Cf + 1 / Cr))
//                  K = (m / L) (b / Cf - a / Cr),   D = k_diff t_rear^2 / (2 R^2)
//                with each axle's cornering stiffness from the tyre's slope at zero slip, B C D, at the loads
//                the car carries at that speed.
import fs from "node:fs";
import { AIR, CAR, G, downforce, drag, rpmFromWheel, torqueAt } from "../src/car.js";
import { TYRE, gripAt, magic } from "../src/tyre.js";

const out = (name, obj) => fs.writeFileSync(new URL(`../test/reference/${name}.json`, import.meta.url), JSON.stringify(obj, null, 2) + "\n");
const round = (x, d) => Number(x.toFixed(d));
const m = CAR.mass, L = CAR.wheelbase, R = CAR.wheelRadius;
const a = L * (1 - CAR.frontWeight), b = L * CAR.frontWeight; // CG to the front axle, to the rear axle
const mEff = m + (4 * CAR.wheelInertia) / (R * R);

// Coast-down.
{
  const A = CAR.rollingResistance * m * G, B = 0.5 * AIR * (CAR.dragArea + CAR.rollingResistance * CAR.liftArea);
  const rows = [];
  for (const kmh of [300, 150]) {
    const v0 = kmh / 3.6, k = Math.sqrt(B / A), w = Math.sqrt(A * B) / mEff;
    const stop = Math.atan(v0 * k) / w;
    for (let t = 0; t <= 60; t += 2) {
      const v = Math.tan(Math.atan(v0 * k) - w * t) / k;
      if (t > stop || v < 10) break;
      rows.push({ v0_kmh: kmh, t_s: t, v_m_s: round(v, 4) });
    }
  }
  out("coast-down", {
    what: "Speed while coasting in neutral on flat asphalt, no steering, from 300 and 150 km/h, stopping at 10 m/s",
    formula: "m_eff dv/dt = -(A + B v^2); A = c_rr m g; B = rho/2 (CdA + c_rr ClA); m_eff = m + 4 I_wheel / R^2",
    constants: { m_kg: m, m_eff_kg: round(mEff, 3), A_N: round(A, 4), B_N_s2_m2: round(B, 6) },
    tolerance_fraction_of_v0: 0.0005,
    rows,
  });
}

// Top speed in a gear.
{
  const rearLoad = (v) => (m * G * (L - b)) / L / 2 + (downforce(v) * (1 - CAR.aeroBalance)) / 2; // each rear tyre, ax = 0
  const resist = (v) => drag(v) + CAR.rollingResistance * (m * G + downforce(v));
  // Slip ratio a rear tyre needs to give a force (N), by bisection on the Magic Formula.
  const slipFor = (F, load) => {
    const D = gripAt(load) * load;
    let lo = 0, hi = 0.11;
    for (let k = 0; k < 80; k++) { const mid = (lo + hi) / 2; if (D * magic(mid, TYRE.lon) < F) lo = mid; else hi = mid; }
    return lo;
  };
  const balance = (v, gear) => {
    const need = resist(v), slip = slipFor(need / 2, rearLoad(v));
    const rpm = rpmFromWheel((v * (1 + slip)) / R, gear);
    return { push: (torqueAt(rpm) * CAR.gears[gear - 1] * CAR.efficiency) / R - need, rpm, slip };
  };
  const rows = [];
  for (const gear of [7, 8]) {
    let lo = 60, hi = 110;
    for (let k = 0; k < 80; k++) { const mid = (lo + hi) / 2; if (balance(mid, gear).push > 0) lo = mid; else hi = mid; }
    const { rpm, slip } = balance(lo, gear);
    if (rpm >= CAR.limiterRpm - 1) throw new Error(`gear ${gear} reaches the limiter`);
    rows.push({ gear, v_m_s: round(lo, 4), v_kmh: round(lo * 3.6, 2), rpm: round(rpm, 1), rear_slip: round(slip, 5) });
  }
  out("top-speed", {
    what: "Steady top speed flat out in a fixed gear, on flat asphalt, no steering",
    formula: "T(rpm) * ratio * efficiency / R = 1/2 rho CdA v^2 + c_rr (m g + 1/2 rho ClA v^2); rpm from the rear wheel speed v (1 + slip) / R",
    tolerance_kmh: 0.3,
    rows,
  });
}

// Yaw gain.
{
  const stiffness = (load) => TYRE.lat.B * TYRE.lat.C * gripAt(load) * load; // N/rad, one tyre
  const rows = [];
  for (const v of [20, 40, 60, 80]) {
    const front = (m * G * b) / L / 2 + (downforce(v) * CAR.aeroBalance) / 2;
    const rear = (m * G * a) / L / 2 + (downforce(v) * (1 - CAR.aeroBalance)) / 2;
    const Cf = 2 * stiffness(front), Cr = 2 * stiffness(rear);
    const K = (m / L) * (b / Cf - a / Cr);
    const D = (CAR.diffLocking * CAR.trackRear ** 2) / (2 * R * R);
    const delta = (1.0 * L) / (v * v); // about 1 m/s^2 of cornering: well inside the linear range
    const r = (v * delta) / (L + K * v * v + ((D * v) / L) * (1 / Cf + 1 / Cr));
    rows.push({ v_m_s: v, steer_rad: round(delta, 7), Cf_N_rad: round(Cf, 1), Cr_N_rad: round(Cr, 1), K_rad_s2_m: Number(K.toPrecision(6)), yaw_rate_rad_s: round(r, 7) });
  }
  out("yaw-gain", {
    what: "Steady yaw rate for a small fixed steering angle at four speeds, holding speed",
    formula: "r = v delta / (L + K v^2 + (D v / L) (1/Cf + 1/Cr)); K = (m / L) (b / Cf - a / Cr); D = k_diff t_rear^2 / (2 R^2); C = 2 B C D(load) per axle",
    constants: { L_m: L, a_m: round(a, 4), b_m: round(b, 4), m_kg: m, D_N_m_s: round((CAR.diffLocking * CAR.trackRear ** 2) / (2 * R * R), 3) },
    tolerance_fraction: 0.005,
    rows,
  });
}
console.log("wrote test/reference/coast-down.json, top-speed.json, yaw-gain.json");
