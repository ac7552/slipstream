// The vehicle engine: a single car on flat ground, stepped 1,000 times a second.
//
//   body     three degrees of freedom in the plane: forward speed, sideways speed and yaw rate
//   wheels   four, each with its own spin, load, slip ratio and slip angle; the tyre forces come from
//            tyre.js and act where each wheel touches the ground, so they also turn the car
//   loads    static weight, downforce growing with the square of speed (split by the aero balance), and
//            weight moved forward, back and sideways by the car's own acceleration (through the height of
//            the centre of gravity, split between the axles by roll stiffness)
//   engine   torque curve, eight gears, a clutch that slips at the start, a rev limiter, engine braking,
//            and a limited-slip differential between the rear wheels
//   brakes   torque at each wheel with a front-to-rear bias; a wheel can lock
//   air      drag and downforce with the square of speed; rolling resistance with the load on each tyre
//
// Each wheel's spin is stepped implicitly in the tyre's own stiffness, so the step stays stable at low
// speed, where the tyre is stiffest against the wheel's small inertia.
import { AIR, CAR, G, downforce, frontAxle, rearAxle, rpmFromWheel, torqueAt, wheelPositions } from "./car.js";
import { tyreForces } from "./tyre.js";

export const DT = 0.001; // s
const SLIP_FLOOR = 3; // m/s: slip is measured against at least this speed, so it stays finite at rest
const LOAD_LAG = 0.02; // s: the springs and dampers take this long to move weight across the car
const STEER_RATE = 1.2; // rad/s at the road wheels: how fast the rack turns
const SHIFT_TIME = 0.04; // s with the drive cut during a gear change
const UPSHIFT_RPM = 14200, DOWNSHIFT_RPM = 9000, MIN_SHIFT_GAP = 0.25; // the automatic box

export const ASPHALT = { grip: 1, rolling: CAR.rollingResistance };
const WHEELS = wheelPositions();

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function newCar({ x = 0, y = 0, heading = 0, speed = 0, gear = 1, auto = true } = {}) {
  const w = speed / CAR.wheelRadius;
  return {
    x, y, heading, vx: speed, vy: 0, r: 0, omega: [w, w, w, w], steer: 0, gear, auto, shiftTimer: 0, sinceShift: 1,
    rpm: CAR.idleRpm, ax: 0, ay: 0, dvx: 0, t: 0,
    loads: [0, 0, 0, 0], slip: [0, 0, 0, 0], angle: [0, 0, 0, 0], force: [[0, 0], [0, 0], [0, 0], [0, 0]],
  };
}

// Load on each tyre (N): front left, front right, rear left, rear right.
export function wheelLoads(s) {
  const m = CAR.mass, L = CAR.wheelbase, h = CAR.cgHeight;
  const down = downforce(Math.hypot(s.vx, s.vy));
  const front = (m * G * rearAxle()) / L + down * CAR.aeroBalance - (m * s.ax * h) / L;
  const rear = (m * G * frontAxle()) / L + down * (1 - CAR.aeroBalance) + (m * s.ax * h) / L;
  const latF = (m * s.ay * h * CAR.rollStiffnessFront) / CAR.trackFront; // turning left (ay > 0) loads the right
  const latR = (m * s.ay * h * (1 - CAR.rollStiffnessFront)) / CAR.trackRear;
  return [front / 2 - latF, front / 2 + latF, rear / 2 - latR, rear / 2 + latR].map((f) => Math.max(0, f));
}

export function shift(s, dir) {
  const g = clamp(s.gear + dir, 1, CAR.gears.length);
  if (g !== s.gear) { s.gear = g; s.shiftTimer = SHIFT_TIME; s.sinceShift = 0; }
}

// Drive torque at the rear axle (N m, both wheels together) and the engine speed.
function driveline(s, throttle) {
  const wRear = (s.omega[2] + s.omega[3]) / 2;
  if (s.gear === 0) return { torque: 0, rpm: CAR.idleRpm + throttle * (CAR.limiterRpm - CAR.idleRpm) * 0.6 };
  const wheelRpm = rpmFromWheel(wRear, s.gear);
  const cut = s.shiftTimer > 0;
  const t = cut ? 0 : throttle;
  if (wheelRpm < CAR.idleRpm && t <= 0.02) return { torque: 0, rpm: CAR.idleRpm }; // clutch open
  let rpm = Math.max(CAR.idleRpm, wheelRpm);
  if (s.gear === 1 && wheelRpm < CAR.launchRpm && t > 0.02) rpm = Math.max(wheelRpm, CAR.idleRpm + (CAR.launchRpm - CAR.idleRpm) * t); // clutch slipping
  const engine = t > 0 ? t * torqueAt(rpm) + (1 - t) * CAR.engineBraking(rpm) : CAR.engineBraking(rpm);
  return { torque: engine * CAR.gears[s.gear - 1] * CAR.efficiency, rpm };
}

// One step. input: { throttle 0..1, brake 0..1, steer -1..1 (left positive) }.
// surfaceAt(x, y): the ground under a point, { grip, rolling }; left out, everything is dry asphalt.
export function step(s, input, dt = DT, surfaceAt = null) {
  const throttle = clamp(input.throttle || 0, 0, 1), brake = clamp(input.brake || 0, 0, 1);
  const target = clamp(input.steer || 0, -1, 1) * CAR.maxSteer;
  s.steer += clamp(target - s.steer, -STEER_RATE * dt, STEER_RATE * dt);
  if (s.shiftTimer > 0) s.shiftTimer -= dt;

  s.sinceShift += dt;
  if (s.auto && s.gear > 0 && s.sinceShift > MIN_SHIFT_GAP) {
    // The automatic box goes by road speed, not wheel speed, so wheelspin does not make it hunt.
    const road = Math.max(0, s.vx) / CAR.wheelRadius;
    if (s.gear < CAR.gears.length && rpmFromWheel(road, s.gear) > UPSHIFT_RPM) shift(s, 1);
    else if (s.gear > 1 && rpmFromWheel(road, s.gear) < DOWNSHIFT_RPM && rpmFromWheel(road, s.gear - 1) < UPSHIFT_RPM - 400) shift(s, -1);
  }

  const { torque, rpm } = driveline(s, throttle);
  s.rpm = rpm;
  const lock = CAR.diffLocking * (s.omega[2] - s.omega[3]);
  const drive = [0, 0, torque / 2 - lock / 2, torque / 2 + lock / 2];
  const brakeAll = brake * CAR.brakeTorque;
  const brakes = [1, 1, 0, 0].map((front) => (front ? (brakeAll * CAR.brakeBias) / 2 : (brakeAll * (1 - CAR.brakeBias)) / 2));

  const loads = wheelLoads(s);
  const R = CAR.wheelRadius, cosH = Math.cos(s.heading), sinH = Math.sin(s.heading);
  let Fx = 0, Fy = 0, Mz = 0;
  const omega = s.omega.slice();
  for (let i = 0; i < 4; i++) {
    const [px, py] = WHEELS[i];
    const d = i < 2 ? s.steer : 0, c = Math.cos(d), sn = Math.sin(d);
    const vxw = s.vx - s.r * py, vyw = s.vy + s.r * px;
    const vl = vxw * c + vyw * sn, vt = -vxw * sn + vyw * c; // along and across the wheel
    const den = Math.max(Math.abs(vl), SLIP_FLOOR);
    const ground = surfaceAt ? surfaceAt(s.x + px * cosH - py * sinH, s.y + px * sinH + py * cosH) : ASPHALT;
    const slip = (s.omega[i] * R - vl) / den;
    const angle = Math.atan(vt / den);
    const [fx, fy] = tyreForces(slip, angle, loads[i], ground.grip);
    // Spin: I dw/dt = drive - brake - R fx, implicit in the tyre's slope so it stays stable. The slip at the
    // end of the step also depends on how the car's own speed changes over it; that is taken from the last
    // step, or the stiff tyre would make the wheel lag the car and seem heavier than it is.
    const h = 1e-4;
    const slope = Math.max(0, (tyreForces(slip + h, angle, loads[i], ground.grip)[0] - tyreForces(slip - h, angle, loads[i], ground.grip)[0]) / (2 * h));
    const turning = s.omega[i] !== 0 ? Math.sign(s.omega[i]) : Math.sign(vl);
    const net = drive[i] - brakes[i] * turning - R * fx + (R * slope * s.dvx * dt) / den;
    let w = s.omega[i] + (dt * net) / (CAR.wheelInertia + (dt * R * R * slope) / den);
    if (brakes[i] > 0 && turning !== 0 && Math.sign(w) !== turning && Math.abs(drive[i]) < brakes[i]) w = 0; // locked
    omega[i] = w;
    const roll = ground.rolling * loads[i] * Math.tanh(vl / 0.5);
    const ax = fx - roll;
    const bx = ax * c - fy * sn, by = ax * sn + fy * c;
    Fx += bx; Fy += by; Mz += px * by - py * bx;
    s.loads[i] = loads[i]; s.slip[i] = slip; s.angle[i] = angle; s.force[i] = [fx, fy];
  }
  const speed = Math.hypot(s.vx, s.vy);
  Fx -= 0.5 * AIR * CAR.dragArea * s.vx * speed;
  Fy -= 0.5 * AIR * CAR.dragArea * s.vy * speed;

  const m = CAR.mass, axm = Fx / m, aym = Fy / m;
  s.dvx = axm + s.r * s.vy;
  s.vx += s.dvx * dt;
  s.vy += (aym - s.r * s.vx) * dt;
  s.r += (Mz / CAR.yawInertia) * dt;
  s.heading += s.r * dt;
  s.x += (s.vx * Math.cos(s.heading) - s.vy * Math.sin(s.heading)) * dt;
  s.y += (s.vx * Math.sin(s.heading) + s.vy * Math.cos(s.heading)) * dt;
  s.omega = omega;
  const k = Math.min(1, dt / LOAD_LAG);
  s.ax += (axm - s.ax) * k;
  s.ay += (aym - s.ay) * k;
  s.t += dt;
  return s;
}

export const speedKmh = (s) => Math.hypot(s.vx, s.vy) * 3.6;
