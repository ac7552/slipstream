// How faithful the engine is, against answers known in advance, and what the car does. Run:  node tools/eval.mjs
//   closed form   the full engine against the coast-down, top-speed and bicycle-model tables
//   the car       launch, braking, cornering grip and top speed
//   the lap       the planned lap against a lap driven by the built-in driver on the full engine
import fs from "node:fs";
import { G } from "../src/car.js";
import { lateralLimit, topSpeed } from "../src/lapsim.js";
import { braking, circuit, coastDown, drivenLaps, flatOut, launch, steadyYaw } from "./runs.mjs";

const reference = (name) => JSON.parse(fs.readFileSync(new URL(`../test/reference/${name}.json`, import.meta.url)));
const rows = [];
const report = (group, name, value, unit, note = "") => rows.push({ group, name, value, unit, note });

{
  const ref = reference("coast-down");
  let worst = 0;
  for (const v0 of new Set(ref.rows.map((r) => r.v0_kmh))) {
    const rs = ref.rows.filter((r) => r.v0_kmh === v0), got = coastDown(v0 / 3.6, rs.map((r) => r.t_s));
    rs.forEach((r, i) => (worst = Math.max(worst, Math.abs(got[i] - r.v_m_s) / (v0 / 3.6))));
  }
  report("closed form", "coast-down in neutral vs the exact solution, worst", 100 * worst, "% of start speed", `tolerance ${100 * ref.tolerance_fraction_of_v0} %`);
  const top = reference("top-speed");
  for (const r of top.rows) report("closed form", `flat out in gear ${r.gear} vs the steady-state balance (${r.v_kmh} km/h)`, flatOut(r.gear, r.v_m_s - 3, 40) * 3.6 - r.v_kmh, "km/h", `tolerance ${top.tolerance_kmh} km/h`);
  const yaw = reference("yaw-gain");
  for (const r of yaw.rows) report("closed form", `yaw rate vs the bicycle model at ${r.v_m_s * 3.6} km/h`, 100 * (steadyYaw(r.v_m_s, r.steer_rad).yawRate / r.yaw_rate_rad_s - 1), "%", `tolerance ${100 * yaw.tolerance_fraction} %`);
}

{
  for (const m of launch()) report("the car", `0 to ${m.kmh} km/h, traction control on`, m.time_s, "s");
  const b = braking();
  report("the car", "300 to 100 km/h, ABS on", b.distance_m, "m", `${b.time_s.toFixed(2)} s, peak ${b.peak_g.toFixed(1)} g`);
  for (const kmh of [100, 200, 300]) report("the car", `most cornering grip at ${kmh} km/h`, lateralLimit(kmh / 3.6) / G, "g", "from the lap planner's tyre and load model");
  report("the car", "top speed, flat out in eighth", flatOut(8, 90, 40) * 3.6, "km/h", `the lap planner, which leaves out tyre slip, says ${(topSpeed() * 3.6).toFixed(1)}`);
}

{
  const { plan, track, line } = circuit();
  const r = drivenLaps(2);
  const fmt = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(3).padStart(6, "0")}`;
  report("the lap", "circuit length; racing line length", track.length, "m", `${line.length.toFixed(0)} m on the racing line`);
  report("the lap", "planned lap (quasi-steady-state)", plan.time, "s", fmt(plan.time));
  report("the lap", "flying lap by the built-in driver on the full engine", r.lapTimes[1], "s", `${fmt(r.lapTimes[1])}, ${(100 * (r.lapTimes[1] / plan.time - 1)).toFixed(1)} % slower than planned`);
  report("the lap", "average speed on the flying lap", (line.length / r.lapTimes[1]) * 3.6, "km/h");
  report("the lap", "furthest from the centre line", r.widest_m, "m", `the asphalt edge is at ${r.edge_m} m`);
}

const fmt = (v) => (Math.abs(v) < 0.01 && v !== 0 ? v.toExponential(1) : Math.abs(v) >= 1000 ? Math.round(v).toLocaleString() : v.toFixed(2));
let group = "";
for (const r of rows) {
  if (r.group !== group) { console.log(`\n${r.group}`); group = r.group; }
  console.log(`  ${r.name}: ${fmt(r.value)} ${r.unit}${r.note ? `  (${r.note})` : ""}`);
}
