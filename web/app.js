// The page: the vehicle engine stepped 1,000 times a second, drawn from the cockpit or from outside, with
// lap timing, start lights, sound and a heads-up display. All of the driving is done by src/; this file only
// reads the controls, keeps time and draws.
import * as THREE from "three";
import { CAR } from "../src/car.js";
import { gripAt } from "../src/tyre.js";
import { DT, newCar, shift, step } from "../src/vehicle.js";
import { RUNOFF, STEP, barrier, buildTrack, locate, surfaceAt } from "../src/track.js";
import { racingLine } from "../src/line.js";
import { planLap } from "../src/lapsim.js";
import { applyAssists, newAssists } from "../src/assists.js";
import { drive, newDriver } from "../src/driver.js";
import { buildWorld } from "./world.js";
import { buildCar } from "./car-model.js";
import { makeSound } from "./sound.js";
import { makeInput } from "./input.js";

const $ = (id) => document.getElementById(id);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const fmt = (t) => (t == null ? "-" : `${Math.floor(t / 60)}:${(t % 60).toFixed(3).padStart(6, "0")}`);

// The circuit, its racing line and the planned speeds: the same objects the tests use.
const track = buildTrack(), line = racingLine(track), plan = planLap(line);
const L = track.length;

// Drawing. Without a graphics card the browser draws in software, so the page draws fewer pixels when frames
// come slowly, and more when they come quickly.
const canvas = $("view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const MAX_SCALE = Math.min(1.5, devicePixelRatio);
let renderScale = Math.min(1, MAX_SCALE);
renderer.setPixelRatio(renderScale);
const pace = { frames: 0, since: performance.now() };
function adapt(now) {
  pace.frames++;
  if (now - pace.since < 1000) return;
  const fps = (pace.frames * 1000) / (now - pace.since), before = renderScale;
  pace.frames = 0; pace.since = now;
  if (fps < 30 && renderScale > 0.35) renderScale = Math.max(0.35, renderScale * 0.82);
  else if (fps > 55 && renderScale < MAX_SCALE) renderScale = Math.min(MAX_SCALE, renderScale * 1.12);
  if (renderScale !== before) { renderer.setPixelRatio(renderScale); resize(); }
}

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, 1, 0.08, 6000);
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();

const world = buildWorld(scene, track, line, plan);
const model = buildCar();
scene.add(model.group);
// A soft shadow under the car, longer than it is wide.
{
  const c = document.createElement("canvas");
  c.width = 128; c.height = 64;
  const g = c.getContext("2d");
  g.scale(2, 1);
  const grd = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  grd.addColorStop(0, "rgba(0,0,0,0.62)"); grd.addColorStop(0.55, "rgba(0,0,0,0.4)"); grd.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 2.5), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6 }));
  blob.geometry.rotateX(-Math.PI / 2);
  blob.position.set(-0.1, 0.02, 0);
  model.group.add(blob);
}

// The car, its aids, and the built-in driver for the autopilot.
let car, assists, driver;
const wheelSurface = ["track", "track", "track", "track"], wheelHints = [null, null, null, null];
let wheelCall = 0, carHint = null;
// The ground under each wheel, remembering where each wheel was so each lookup only searches nearby.
function ground(x, y) {
  const j = wheelCall++ % 4;
  const loc = locate(track, x, y, wheelHints[j]);
  wheelHints[j] = Math.abs(loc.lateral) > RUNOFF + 20 ? null : loc.i;
  const sfc = surfaceAt(track, loc);
  wheelSurface[j] = sfc.name;
  return sfc;
}

// Puts the car at a distance along the lap, sideways by an offset, at rest.
function placeCar(s, offset) {
  const i = Math.floor((((s % L) + L) % L) / STEP), p = track.points[i], h = track.heading[i];
  const keep = car ? { tc: assists.tc, abs: assists.abs, auto: car.auto } : { tc: true, abs: true, auto: true };
  const t = car ? car.t : 0; // the clock runs on through a reset
  car = newCar({ x: p[0] - Math.sin(h) * offset, y: p[1] + Math.cos(h) * offset, heading: h, gear: 1, auto: keep.auto });
  car.t = t;
  assists = newAssists();
  assists.tc = keep.tc; assists.abs = keep.abs;
  driver = newDriver(track, line, plan, { pace: 0.98 });
  wheelHints.fill(null); carHint = null; wheelCall = 0;
}

// Game state.
const CAMERAS = ["Cockpit", "Onboard", "Chase", "Trackside"];
const game = {
  mode: "menu", camera: 0, autopilot: false, lightsAt: 0, goAt: 0, lit: 0,
  lap: { number: 1, start: 0, crossed: false, armed: false, valid: true, sectors: [], trace: [] },
  best: null, bestTrace: null, bestSectors: [null, null, null], last: null,
  lastS: 0, message: { text: "", until: 0, kind: "" }, shake: 0, kerb: 0,
};
const sound = makeSound();

function say(text, kind = "", seconds = 2.6) { game.message = { text, kind, until: performance.now() + seconds * 1000 }; }

function startSession(autopilot) {
  placeCar(L - 5.2, 2.6); // the first grid box, nose at its bar
  game.autopilot = autopilot;
  game.camera = autopilot ? 2 : 0; // drive from the cockpit, watch from behind
  game.mode = "lights";
  game.lightsAt = performance.now();
  game.goAt = game.lightsAt + 5000 + 400 + Math.random() * 2200; // five lights a second apart, then a wait
  game.lit = 0;
  game.lap = { number: 1, start: 0, crossed: false, armed: false, valid: true, sectors: [], trace: [] };
  game.lastS = locate(track, car.x, car.y).s;
  $("menu").hidden = true; $("hud").hidden = false;
  sound.start();
}

function resetToTrack() {
  if (!car || game.mode === "menu") return;
  const loc = locate(track, car.x, car.y, carHint);
  const s = loc.i * STEP;
  placeCar(s, line.offset[loc.i]);
  game.lap.valid = false;
  game.lastS = s;
  say("Back on track", "bad");
}

function action(a) {
  if (a === "pause") return togglePause();
  if (game.mode === "menu") return;
  switch (a) {
    case "up": case "down":
      if (car.auto) { car.auto = false; say("Manual gears"); }
      shift(car, a === "up" ? 1 : -1);
      break;
    case "auto": car.auto = !car.auto; say(car.auto ? "Automatic gears" : "Manual gears"); break;
    case "camera": game.camera = (game.camera + 1) % CAMERAS.length; break;
    case "reset": resetToTrack(); break;
    case "autopilot": game.autopilot = !game.autopilot; say(game.autopilot ? "Autopilot on" : "Autopilot off"); break;
    case "tc": assists.tc = !assists.tc; say(assists.tc ? "Traction control on" : "Traction control off"); break;
    case "abs": assists.abs = !assists.abs; say(assists.abs ? "ABS on" : "ABS off"); break;
    case "mute": sound.setMuted(!sound.muted); say(sound.muted ? "Sound off" : "Sound on"); break;
    case "line": world.raceLine.visible = !world.raceLine.visible; break;
    case "help": $("menu").hidden = !$("menu").hidden; break;
  }
}
const input = makeInput(action);

function togglePause() {
  if (game.mode === "menu") return;
  if (game.mode === "paused") { game.mode = game.resume; $("paused").hidden = true; sound.pause(false); }
  else { game.resume = game.mode; game.mode = "paused"; $("paused").hidden = false; sound.pause(true); }
}
document.addEventListener("visibilitychange", () => { if (document.hidden && game.mode !== "paused" && game.mode !== "menu") togglePause(); });

$("go").addEventListener("click", () => startSession(false));
$("watch").addEventListener("click", () => startSession(true));

// Lap timing: the control line is at s = 0, with two splits making three sectors. The first lap runs from
// lights out; the grid is just behind the line. A lap with all four wheels off the track at any point, or a
// trip back onto the track, is not counted for best.
function timeLap(sNow, t) {
  const lap = game.lap, prev = game.lastS;
  const crossedLine = prev > L - 300 && sNow < 300;
  if (crossedLine && !lap.crossed) lap.crossed = true;
  else if (crossedLine && lap.armed) {
    const crossing = t - sNow / Math.max(1, Math.hypot(car.vx, car.vy));
    lap.sectors.push(crossing - lap.start);
    finishLap(crossing - lap.start, crossing);
  }
  const now = game.lap;
  if (now.crossed && !now.armed && sNow > 200 && sNow < L / 2) now.armed = true;
  for (const [k, edge] of [[0, L / 3], [1, (2 * L) / 3]]) if (now.armed && prev < edge && sNow >= edge && now.sectors.length === k) now.sectors.push(t - now.start);
  // Time at every 10 m, for the running gap to the best lap.
  if (now.crossed && sNow < L - 20) while (now.trace.length * 10 <= sNow) now.trace.push(t - now.start);
  game.lastS = sNow;
}

function finishLap(time, crossing) {
  const lap = game.lap;
  game.last = { time, valid: lap.valid };
  const sec = [lap.sectors[0], lap.sectors[1] - lap.sectors[0], lap.sectors[2] - lap.sectors[1]];
  if (lap.valid) {
    sec.forEach((v, k) => { if (v > 0 && (game.bestSectors[k] == null || v < game.bestSectors[k])) game.bestSectors[k] = v; });
    if (game.best == null || time < game.best) {
      const first = game.best == null;
      game.best = time; game.bestTrace = lap.trace.slice();
      say(`${first ? "Lap" : "Best lap"} ${fmt(time)}`, "best", 4);
    } else say(`Lap ${fmt(time)}  +${(time - game.best).toFixed(3)}`, "", 4);
  } else say(`Lap ${fmt(time)} not counted: track limits`, "bad", 4);
  game.lap = { number: lap.number + 1, start: crossing, crossed: true, armed: false, valid: true, sectors: [], trace: [] };
}

// One step of the engine with whoever is driving.
let barrierCooldown = 0;
function stepCar(controls) {
  let inp;
  if (game.autopilot) inp = drive(driver, car, DT);
  else {
    const { throttle, brake } = applyAssists(assists, car, controls.throttle, controls.brake, DT);
    inp = { throttle, brake, steer: controls.steer };
  }
  step(car, inp, DT, ground);
  const hit = barrier(track, car, carHint);
  carHint = hit.loc.i;
  if (hit.hit && barrierCooldown <= 0) { sound.thump(1); game.shake = 1; barrierCooldown = 0.4; game.lap.valid = false; say("Barrier", "bad"); }
  barrierCooldown -= DT;
  return inp;
}

// Cameras.
const tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(0, 0, 0, "YXZ");
const head = { x: 0, y: 0, roll: 0 };
const chase = { heading: 0, init: false };
let towerIndex = 0;
const bodyPoint = (x, y, z) => model.group.localToWorld(tmpV.set(x, z, -y));
function placeCamera(dt, now) {
  const speed = Math.hypot(car.vx, car.vy);
  const k = 1 - Math.exp(-dt / 0.12);
  head.x += (clamp(-car.ax * 0.0022, -0.07, 0.07) - head.x) * k;
  head.y += (clamp(-car.ay * 0.0018, -0.06, 0.06) - head.y) * k;
  head.roll += (clamp(-car.ay * 0.0035, -0.09, 0.09) - head.roll) * k;
  const buzz = (0.0006 + 0.0000025 * speed * speed / 80) * (1 + 4 * game.kerb) + 0.03 * game.shake;
  const jitter = () => (Math.random() - 0.5) * buzz;
  game.shake *= Math.exp(-dt / 0.25);
  model.group.updateMatrixWorld();
  const mode = CAMERAS[game.camera];
  model.helmet.visible = model.visor.visible = model.stripe.visible = mode !== "Cockpit";
  if (mode === "Cockpit" || mode === "Onboard") {
    const cockpit = mode === "Cockpit";
    const p = cockpit ? bodyPoint(0.03 + head.x, head.y, 0.9) : bodyPoint(-0.28, 0, 1.17); // the driver's eyes; above the airbox
    camera.position.set(p.x + jitter(), p.y + jitter(), p.z + jitter());
    tmpE.set(cockpit ? -0.09 : -0.1, -Math.PI / 2, cockpit ? head.roll : 0);
    tmpQ.setFromEuler(tmpE);
    camera.quaternion.copy(model.group.quaternion).multiply(tmpQ);
    camera.rotateX(jitter() * 0.6); camera.rotateY(jitter() * 0.6);
    camera.fov = (cockpit ? 70 : 66) + speed * 0.05;
  } else if (mode === "Chase") {
    // Behind the car, swinging out a little as it turns.
    const want = car.heading + Math.atan2(car.vy, Math.max(3, car.vx)) * 0.6;
    if (!chase.init) { chase.heading = want; chase.init = true; }
    let d = want - chase.heading; d = Math.atan2(Math.sin(d), Math.cos(d));
    chase.heading += d * (1 - Math.exp(-dt / 0.18));
    const back = 6.4 + speed * 0.012, up = 1.85;
    const cx = car.x - Math.cos(chase.heading) * back, cy = car.y - Math.sin(chase.heading) * back;
    camera.position.set(cx + jitter(), up + jitter(), -cy + jitter());
    camera.lookAt(car.x + Math.cos(chase.heading) * 4, 0.75, -(car.y + Math.sin(chase.heading) * 4));
    camera.fov = 62 + speed * 0.08;
  } else {
    // A camera on a tower beside the track, the next one along, zooming to keep the car in frame.
    const i = carHint ?? 0, towers = world.towers;
    let best = towerIndex, score = Infinity;
    for (let k = 0; k < towers.length; k++) {
      let ahead = towers[k].i + 30 - i; ahead = ((ahead % track.n) + track.n) % track.n;
      if (ahead > track.n / 2) ahead -= track.n;
      const sc = ahead < -25 ? Infinity : Math.abs(ahead - 20);
      if (sc < score) { score = sc; best = k; }
    }
    towerIndex = best;
    const t = towers[towerIndex];
    camera.position.set(t.x, t.z, -t.y);
    camera.lookAt(car.x, 0.6, -car.y);
    const dist = Math.hypot(t.x - car.x, t.y - car.y, t.z);
    camera.fov = clamp((2 * Math.atan(9 / dist) * 180) / Math.PI, 6, 60);
  }
  camera.updateProjectionMatrix();
  for (const o of world.sky) o.position.copy(camera.position).add(o.userData.offset); // the sky stays at infinity
}

// The heads-up display.
const leds = $("leds");
for (let k = 0; k < 15; k++) leds.appendChild(document.createElement("i"));
const ledAt = Array.from({ length: 15 }, (_, k) => 10500 + k * 260);
const tyreEls = [...$("tyres").children];
const gctx = $("gmeter").getContext("2d");
const map = $("map"), mctx = map.getContext("2d");
const mapBox = (() => {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of track.points) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const scale = 190 / Math.max(x1 - x0, y1 - y0);
  return { x0, y0, x1, y1, scale, ox: (220 - (x1 - x0) * scale) / 2, oy: (220 - (y1 - y0) * scale) / 2 };
})();
const toMap = (x, y) => [mapBox.ox + (x - mapBox.x0) * mapBox.scale, 220 - (mapBox.oy + (y - mapBox.y0) * mapBox.scale)];
const mapBase = (() => {
  const c = document.createElement("canvas"); c.width = c.height = 220;
  const g = c.getContext("2d");
  g.lineJoin = "round"; g.lineCap = "round";
  for (const [w, col] of [[9, "rgba(255,255,255,0.18)"], [4, "rgba(255,255,255,0.85)"]]) {
    g.beginPath();
    track.points.forEach(([x, y], i) => { const [u, v] = toMap(x, y); i ? g.lineTo(u, v) : g.moveTo(u, v); });
    g.closePath(); g.lineWidth = w; g.strokeStyle = col; g.stroke();
  }
  const [u, v] = toMap(...track.points[0]);
  g.fillStyle = "#ffb21c"; g.fillRect(u - 1.5, v - 7, 3, 14);
  return c;
})();
const shown = {};
const setText = (id, text) => { if (shown[id] !== text) { shown[id] = text; $(id).textContent = text; } };
const setClass = (el, cls, on) => el.classList.toggle(cls, !!on);
let lastHud = 0;
function hud(now, inp) {
  const speed = Math.hypot(car.vx, car.vy);
  setText("speed", String(Math.round(speed * 3.6)));
  setText("gear", car.gear === 0 ? "N" : String(car.gear));
  setText("rpm", `${Math.round(car.rpm).toLocaleString()} rpm`);
  const flash = car.rpm > 14300 && Math.floor(now / 90) % 2 === 0;
  setClass(leds, "flash", flash);
  [...leds.children].forEach((el, k) => { el.className = !flash && car.rpm > ledAt[k] ? (k < 5 ? "g" : k < 10 ? "r" : "b") : ""; });
  $("throttlebar").style.setProperty("--v", `${Math.round((inp.throttle || 0) * 100)}%`);
  $("brakebar").style.setProperty("--v", `${Math.round((inp.brake || 0) * 100)}%`);

  // Timing.
  const lap = game.lap, t = car.t;
  const running = game.mode === "drive" || game.mode === "paused";
  setText("lapnum", `Lap ${lap.number}`);
  setText("laptime", running ? fmt(Math.max(0, t - lap.start)) : fmt(0));
  setClass($("laptime").parentElement, "invalid", !lap.valid);
  setText("last", game.last ? `${fmt(game.last.time)}${game.last.valid ? "" : " *"}` : "-");
  setText("best", fmt(game.best));
  const d = $("delta");
  if (game.bestTrace && lap.crossed && running) {
    const s = game.lastS, k = Math.min(game.bestTrace.length - 1, Math.floor(s / 10));
    const delta = t - lap.start - game.bestTrace[k];
    setText("delta", `${delta >= 0 ? "+" : "-"}${Math.abs(delta).toFixed(2)}`);
    setClass(d, "ahead", delta < 0); setClass(d, "behind", delta >= 0);
  } else { setText("delta", "-"); setClass(d, "ahead", false); setClass(d, "behind", false); }
  [...$("sectors").children].forEach((el, k) => {
    const done = lap.sectors.length > k;
    const v = done ? lap.sectors[k] - (k ? lap.sectors[k - 1] : 0) : null;
    el.className = !done ? "" : game.bestSectors[k] == null || v <= game.bestSectors[k] ? "best" : "slow";
  });

  // Chips.
  setText("chip-cam", CAMERAS[game.camera]);
  setClass($("chip-tc"), "on", assists.tc); setClass($("chip-tc"), "act", assists.tc && assists.tcActive);
  setClass($("chip-abs"), "on", assists.abs); setClass($("chip-abs"), "act", assists.abs && assists.absActive);
  setText("chip-box", car.auto ? "Auto" : "Manual"); setClass($("chip-box"), "on", true);
  setClass($("chip-ap"), "on", game.autopilot);

  // Lights and messages.
  [...$("lights").children].forEach((el, k) => setClass(el, "on", k < game.lit));
  $("lights").hidden = !(game.mode === "lights" || now < game.goAt + 1500);
  const m = $("message");
  if (now < game.message.until) { setText("message", game.message.text); m.className = `show ${game.message.kind}`; } else m.className = "";

  if (now - lastHud < 50) return;
  lastHud = now;
  // g-meter: sideways across, forward up; the ring is 5 g.
  gctx.clearRect(0, 0, 88, 88);
  gctx.strokeStyle = "rgba(255,255,255,0.18)"; gctx.lineWidth = 1;
  for (const r of [14, 28, 42]) { gctx.beginPath(); gctx.arc(44, 44, r, 0, 7); gctx.stroke(); }
  gctx.beginPath(); gctx.moveTo(44, 2); gctx.lineTo(44, 86); gctx.moveTo(2, 44); gctx.lineTo(86, 44); gctx.stroke();
  const gx = clamp(-car.ay / 9.81, -6, 6) * 8.4, gy = clamp(-car.ax / 9.81, -6, 6) * 8.4;
  gctx.fillStyle = "#ffb21c"; gctx.beginPath(); gctx.arc(44 + gx, 44 + gy, 5, 0, 7); gctx.fill();
  gctx.fillStyle = "rgba(255,255,255,0.6)"; gctx.font = "10px system-ui"; gctx.fillText(`${(Math.hypot(car.ax, car.ay) / 9.81).toFixed(1)} g`, 4, 84);
  // Tyres: white with grip to spare, yellow near the limit, red past it.
  tyreEls.forEach((el, i) => {
    const load = car.loads[i], f = car.force[i];
    const use = load > 0 ? Math.hypot(f[0], f[1]) / (gripAt(load) * load) : 0;
    const slide = Math.abs(car.slip[i]) > 0.16 || Math.abs(car.angle[i]) > 0.16;
    el.style.background = slide ? "#ff4a4a" : use > 0.9 ? "#ffd23a" : use > 0.6 ? "#f6efc9" : "#e8e8e8";
    el.style.opacity = wheelSurface[i] === "grass" ? 0.45 : 1;
  });
  // Minimap.
  mctx.clearRect(0, 0, 220, 220);
  mctx.drawImage(mapBase, 0, 0);
  const [u, v] = toMap(car.x, car.y);
  mctx.fillStyle = "#6f66ff"; mctx.strokeStyle = "#fff"; mctx.lineWidth = 2;
  mctx.beginPath(); mctx.arc(u, v, 5.5, 0, 7); mctx.fill(); mctx.stroke();
}

// The frame loop.
let lastFrame = performance.now(), acc = 0;
let lastInput = { throttle: 0, brake: 0, steer: 0 };
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  adapt(now);
  if (!car) { renderer.render(scene, camera); return; }

  const speed = Math.hypot(car.vx, car.vy);
  const controls = input.read(dt, speed);
  if (game.mode === "lights") {
    const lit = Math.min(5, Math.floor((now - game.lightsAt) / 1000) + 1);
    game.lit = now >= game.goAt ? 0 : lit;
    world.setLights(game.lit);
    // Held on the brakes; the throttle only revs the engine.
    const t = game.autopilot ? 0.85 : controls.throttle;
    car.rpm = CAR.idleRpm + (CAR.launchRpm - CAR.idleRpm) * t;
    lastInput = { throttle: t, brake: 1, steer: controls.steer };
    if (now >= game.goAt) { game.mode = "drive"; game.lap.start = car.t; say("Lights out", "", 1.5); acc = 0; }
  } else if (game.mode === "drive") {
    world.setLights(0);
    acc += dt;
    let n = 0;
    while (acc >= DT && n < 100) { lastInput = stepCar(controls); acc -= DT; n++; }
    if (n === 100) acc = 0;
    const loc = locate(track, car.x, car.y, carHint);
    carHint = loc.i;
    if (wheelSurface.every((w) => w === "grass") && game.lap.valid) { game.lap.valid = false; say("Track limits", "bad"); }
    game.kerb = wheelSurface.some((w) => w === "kerb") ? 1 : 0;
    timeLap(loc.s, car.t);
  }

  model.update(car, game.mode === "drive" ? dt : 0, now);
  placeCamera(dt, now);
  const slip = Math.max(...car.slip.map(Math.abs), ...car.angle.map((a) => Math.abs(a) * 0.8));
  sound.update({ rpm: car.rpm, throttle: lastInput.throttle || 0, speed, slip: speed > 2 ? slip : 0, kerb: game.kerb && speed > 5, cut: car.shiftTimer > 0 });
  hud(now, lastInput);
  renderer.render(scene, camera);
}

// Show the car on the grid behind the menu.
placeCar(L - 5.2, 2.6);
game.camera = 2;
$("loading").hidden = true;
requestAnimationFrame(frame);
window.slipstream = { game, get car() { return car; }, track, plan, line, startSession, scene, camera, world };
