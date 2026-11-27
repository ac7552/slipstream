// The regression baseline: numbers recorded from this engine, so a change that moves them fails the tests.
// It is not a check against the real world. Re-record on purpose, after a change you mean to make:
//   node tools/baseline.mjs --record
import fs from "node:fs";
import { braking, circuit, drivenLaps, launch } from "./runs.mjs";

export function measure() {
  const laps = drivenLaps(2);
  return {
    launch: launch().map((m) => ({ kmh: m.kmh, time_s: round(m.time_s, 3) })),
    braking_300_100: (({ distance_m, time_s }) => ({ distance_m: round(distance_m, 2), time_s: round(time_s, 3) }))(braking()),
    planned_lap_s: round(circuit().plan.time, 3),
    driven_lap_s: round(laps.lapTimes[1], 3),
  };
}
const round = (x, d) => Number(x.toFixed(d));

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const now = measure();
  const file = new URL("../test/reference/baseline.json", import.meta.url);
  if (process.argv.includes("--record")) {
    fs.writeFileSync(file, JSON.stringify({
      what: "Recorded from this engine: a standing start with traction control, braking from 300 to 100 km/h with ABS, the planned lap, and a flying lap by the built-in driver",
      tolerance_fraction: 0.01,
      ...now,
    }, null, 2) + "\n");
    console.log("recorded test/reference/baseline.json");
  }
  console.log(JSON.stringify(now, null, 2));
}
