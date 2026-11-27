// The car: a made-up single-seater of the modern open-wheel kind. Every number is chosen to be typical of
// that class of car, not taken from any real team's car.
//
// Body frame: x forward, y to the left, z up. Yaw is counterclockwise seen from above. Steering is positive
// to the left.

export const G = 9.81; // m/s^2
export const AIR = 1.2; // kg/m^3, air at about 20 C at sea level

export const CAR = {
  mass: 798, // kg, with the driver
  wheelbase: 3.6, // m
  frontWeight: 0.455, // share of the static weight on the front axle
  cgHeight: 0.3, // m
  trackFront: 1.6, // m between the front tyre centres
  trackRear: 1.55,
  yawInertia: 1050, // kg m^2

  wheelRadius: 0.36, // m, loaded
  wheelInertia: 1.2, // kg m^2 for each wheel with its brake disc
  rollingResistance: 0.012, // times the load on the tyre

  dragArea: 1.2, // Cd A, m^2
  liftArea: 4.2, // Cl A, m^2 of downforce
  aeroBalance: 0.42, // share of the downforce on the front axle

  maxSteer: 0.32, // rad at the road wheels
  rollStiffnessFront: 0.52, // share of the roll stiffness at the front

  brakeTorque: 16000, // N m for all four wheels together at full pedal
  brakeBias: 0.57, // share at the front

  // Engine torque (N m) against crank speed (rpm), joined by straight lines. About 750 kW at 12,000 rpm.
  torqueCurve: [[4000, 330], [6000, 410], [8000, 480], [10000, 560], [11000, 595], [12000, 600], [13000, 560], [14000, 505], [15000, 450]],
  idleRpm: 4000,
  launchRpm: 9500, // the clutch holds the engine here while it slips at the start
  limiterRpm: 15000,
  engineBraking: (rpm) => -(40 + 0.004 * rpm), // N m with the throttle closed
  // Overall ratios, gearbox and final drive together, engine turns per wheel turn.
  gears: [17.0, 14.13, 11.74, 9.76, 8.11, 6.74, 5.6, 4.65],
  efficiency: 0.95, // gearbox and final drive
  diffLocking: 40, // N m of torque moved between the rear wheels per rad/s of speed difference
};

// Distances from the centre of gravity to each axle.
export const frontAxle = () => CAR.wheelbase * (1 - CAR.frontWeight);
export const rearAxle = () => CAR.wheelbase * CAR.frontWeight;

// The wheels in the body frame, in the order front left, front right, rear left, rear right.
export function wheelPositions() {
  const a = frontAxle(), b = rearAxle();
  return [[a, CAR.trackFront / 2], [a, -CAR.trackFront / 2], [-b, CAR.trackRear / 2], [-b, -CAR.trackRear / 2]];
}

// Engine torque (N m) at a crank speed, full throttle.
export function torqueAt(rpm) {
  const c = CAR.torqueCurve;
  if (rpm <= c[0][0]) return c[0][1];
  if (rpm >= CAR.limiterRpm) return 0;
  for (let i = 1; i < c.length; i++) if (rpm <= c[i][0]) {
    const [r0, t0] = c[i - 1], [r1, t1] = c[i];
    return t0 + ((t1 - t0) * (rpm - r0)) / (r1 - r0);
  }
  return c[c.length - 1][1];
}

export const rpmFromWheel = (omega, gear) => (omega * CAR.gears[gear - 1] * 60) / (2 * Math.PI);
export const downforce = (v) => 0.5 * AIR * CAR.liftArea * v * v;
export const drag = (v) => 0.5 * AIR * CAR.dragArea * v * v;
