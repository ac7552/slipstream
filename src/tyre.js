// The tyre: Pacejka's Magic Formula for the force against slip, with grip that falls slowly as the load
// rises, and a friction ellipse when the tyre is asked to brake or drive and turn at once.
//
//   F = D sin(C atan(B x - E (B x - atan(B x))))
//
// x is the slip ratio (driving or braking) or the slip angle in radians (turning). D is the peak force,
// grip times load. The coefficients describe a made-up dry slick, not any real tyre.

export const TYRE = {
  grip: 1.75, // peak friction at the reference load
  refLoad: 4000, // N
  loadSensitivity: 0.08, // grip lost per reference load of extra load
  minGrip: 1.0,
  lon: { B: 14, C: 1.6, E: 0.1 }, // against slip ratio; peaks near 0.11
  lat: { B: 16, C: 1.4, E: 0.1 }, // against slip angle (rad); peaks near 7.5 degrees
};

export const magic = (x, { B, C, E }) => Math.sin(C * Math.atan(B * x - E * (B * x - Math.atan(B * x))));

// Peak friction at a load (N).
export const gripAt = (load) => Math.max(TYRE.minGrip, TYRE.grip * (1 - (TYRE.loadSensitivity * (load - TYRE.refLoad)) / TYRE.refLoad));

// Forces (N) in the wheel's own frame: [along the wheel, across it]. slip: the slip ratio, (wR - v) / v.
// angle: the slip angle (rad); the side force pushes against it. surface: a grip factor for the ground.
export function tyreForces(slip, angle, load, surface = 1) {
  if (load <= 0) return [0, 0];
  const D = gripAt(load) * load * surface;
  let fx = D * magic(slip, TYRE.lon);
  let fy = -D * magic(angle, TYRE.lat);
  const used = Math.hypot(fx, fy) / D;
  if (used > 1) { fx /= used; fy /= used; }
  return [fx, fy];
}

// Slip ratio at which a tyre gives its peak driving or braking force, and slip angle for the peak side force.
export function peakSlip(coeffs) {
  let best = 0, at = 0;
  for (let x = 0.001; x < 0.6; x += 0.0005) { const f = magic(x, coeffs); if (f > best) { best = f; at = x; } }
  return at;
}
