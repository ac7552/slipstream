// The racing line: the smoothest path the car can take inside the track, found by pulling a band tight. Each
// point may slide sideways across the track, no closer than a margin to either edge, toward the middle of its
// neighbours; repeated, that straightens the line through each corner the way a driver uses the whole width,
// out, in to the apex and out again. It is a minimum-curvature line, which is close to, but not quite, the
// fastest line.
import { HALF_WIDTH, STEP } from "./track.js";

const MARGIN = 1.6; // m kept from the edge of the asphalt to the car's centre line (the car is 2 m wide)

// Signed curvature (1/m) through three points: left turns positive.
export function curvatureOf(a, b, c) {
  const abx = b[0] - a[0], aby = b[1] - a[1], bcx = c[0] - b[0], bcy = c[1] - b[1];
  const cross = abx * bcy - aby * bcx;
  const la = Math.hypot(abx, aby), lb = Math.hypot(bcx, bcy), lc = Math.hypot(c[0] - a[0], c[1] - a[1]);
  return (2 * cross) / (la * lb * lc || 1);
}

export function racingLine(track, { margin = MARGIN, iterations = 1500, span = 4 } = {}) {
  const { points, heading, n } = track;
  const nx = heading.map((h) => -Math.sin(h)), ny = heading.map((h) => Math.cos(h)); // left normal
  const limit = HALF_WIDTH - margin;
  const w = new Float64Array(n);
  const px = new Float64Array(n), py = new Float64Array(n);
  const place = () => { for (let i = 0; i < n; i++) { px[i] = points[i][0] + nx[i] * w[i]; py[i] = points[i][1] + ny[i] * w[i]; } };
  // Several passes at shrinking spans: long spans find the shape of each corner, short ones smooth it.
  for (const k of [span * 8, span * 4, span * 2, span]) {
    for (let it = 0; it < iterations / 4; it++) {
      place();
      for (let i = 0; i < n; i++) {
        const a = (i - k + n) % n, b = (i + k) % n;
        const mx = (px[a] + px[b]) / 2, my = (py[a] + py[b]) / 2;
        const move = (mx - px[i]) * nx[i] + (my - py[i]) * ny[i];
        w[i] = Math.max(-limit, Math.min(limit, w[i] + 0.5 * move));
      }
    }
  }
  place();
  const pts = Array.from({ length: n }, (_, i) => [px[i], py[i]]);
  const ds = pts.map((p, i) => Math.hypot(pts[(i + 1) % n][0] - p[0], pts[(i + 1) % n][1] - p[1]));
  const raw = pts.map((p, i) => curvatureOf(pts[(i - 1 + n) % n], p, pts[(i + 1) % n]));
  // A light smoothing of the curvature: the points are only as smooth as the band.
  const curvature = raw.map((_, i) => { let a = 0; for (let j = -3; j <= 3; j++) a += raw[(i + j + n) % n]; return a / 7; });
  const length = ds.reduce((a, b) => a + b, 0);
  return { points: pts, offset: Array.from(w), ds, curvature, length, n, step: STEP };
}
