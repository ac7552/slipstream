// The circuit: a made-up closed track, about 4.3 km, laid out from straights and constant-radius corners like
// a surveyor's description, with the curvature eased so every corner has a transition. Two straights are
// sized so the lap closes on itself. Sampled every 2 m.
//
// Coordinates: x east, y north, metres; the start line is at the origin, part way down the main straight,
// heading east, so no corner's easing reaches across it. The lap runs
// clockwise. Lateral position is positive to the left of the racing direction.

export const CIRCUIT = [
  ["straight", 750], // from the start line down the main straight, heading east
  ["corner", -90, 55], // turn 1: heavy braking, right, heading south
  ["straight", 200],
  ["corner", 40, 140], // turns 2 and 3: a fast left-right
  ["corner", -40, 120],
  ["straight", 420],
  ["corner", -90, 25], // turn 4: the slowest corner, onto the back straight
  ["straight", null], // the back straight, heading west, sized to close the lap
  ["corner", 30, 220], // turn 5: a flat-out left kink
  ["corner", -120, 110], // turn 6: long right, heading north
  ["straight", 260],
  ["corner", 45, 45], // turns 7 and 8: the chicane
  ["corner", -45, 45],
  ["straight", null], // heading north, sized to close the lap
  ["corner", -90, 160], // the last corner, onto the main straight
  ["straight", 350], // the start of the main straight, to the line
];

export const STEP = 2; // m between samples
export const HALF_WIDTH = 6.5; // m from the centre line to each edge
export const KERB = 1.2; // m of kerb beyond the edge, at corners
export const RUNOFF = 22; // m from the centre line to the barrier
const EASE = 25; // m: the curvature is smoothed over about this length

export const SURFACES = {
  track: { name: "track", grip: 1, rolling: 0.012 },
  kerb: { name: "kerb", grip: 0.92, rolling: 0.02 },
  grass: { name: "grass", grip: 0.5, rolling: 0.08 },
};

// Curvature (1/m) at each sample for a list of segments with the given straight lengths.
function curvatureProfile(segments) {
  const k = [];
  for (const seg of segments) {
    if (seg[0] === "straight") for (let d = 0; d < seg[1]; d += STEP) k.push(0);
    else {
      const [, deg, radius] = seg, len = (Math.abs(deg) * Math.PI * radius) / 180;
      const n = Math.max(1, Math.round(len / STEP));
      const each = ((deg * Math.PI) / 180) / (n * STEP); // keeps the turned angle exact
      for (let j = 0; j < n; j++) k.push(each);
    }
  }
  // Ease: a circular Gaussian blur keeps the total angle turned, so the lap still turns 360 degrees.
  const n = k.length, sigma = EASE / STEP, w = [];
  for (let j = -Math.ceil(3 * sigma); j <= Math.ceil(3 * sigma); j++) w.push([j, Math.exp((-j * j) / (2 * sigma * sigma))]);
  const total = w.reduce((a, [, v]) => a + v, 0);
  return k.map((_, i) => w.reduce((a, [j, v]) => a + v * k[(i + j + n) % n], 0) / total);
}

function walk(curv) {
  const pts = [[0, 0]], head = [0];
  let x = 0, y = 0, h = 0;
  for (let i = 0; i < curv.length; i++) {
    const mid = h + (curv[i] * STEP) / 2;
    x += STEP * Math.cos(mid); y += STEP * Math.sin(mid); h += curv[i] * STEP;
    pts.push([x, y]); head.push(h);
  }
  return { pts, head };
}

// Sizes the two open straights so the lap closes. Along exact straights and arcs the end of the lap moves in
// a straight line as each open straight grows, so two lengths can be solved for directly.
function closeLap(segments) {
  const open = segments.map((s, i) => (s[0] === "straight" && s[1] === null ? i : -1)).filter((i) => i >= 0);
  let x = 0, y = 0, h = 0;
  const dirs = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg[0] === "straight") {
      if (open.includes(i)) dirs.push([Math.cos(h), Math.sin(h)]);
      else { x += seg[1] * Math.cos(h); y += seg[1] * Math.sin(h); }
    } else {
      const phi = (seg[1] * Math.PI) / 180, R = seg[2] * Math.sign(phi);
      x += R * (Math.sin(h + phi) - Math.sin(h)); y += R * (Math.cos(h) - Math.cos(h + phi)); h += phi;
    }
  }
  const [[a, c], [b, d]] = dirs, det = a * d - b * c; // solve L1 dirs[0] + L2 dirs[1] = -(x, y)
  const L = [(-x * d + y * b) / det, (-y * a + x * c) / det];
  if (!(L[0] > 0 && L[1] > 0)) throw new Error(`the circuit cannot close: open straights ${L}`);
  return { segments: segments.map((s, i) => (open.includes(i) ? ["straight", L[open.indexOf(i)]] : s)), lengths: L };
}

export function buildTrack(def = CIRCUIT) {
  const { segments, lengths } = closeLap(def);
  const curvature = curvatureProfile(segments);
  const { pts, head } = walk(curvature);
  // Easing the corners and rounding to whole samples leave a small gap; spread it along the lap.
  const end = pts[pts.length - 1], n = curvature.length;
  pts.pop(); head.pop();
  for (let i = 0; i < n; i++) { pts[i][0] -= (end[0] * i) / n; pts[i][1] -= (end[1] * i) / n; }
  const corner = curvature.map((k) => Math.abs(k) > 1 / 450);
  return { points: pts, heading: head, curvature, corner, n, length: n * STEP, openStraights: lengths, segments };
}

// Nearest point on the centre line. hint: a sample index to search near (from the last call), or null to
// search the whole lap. Returns the sample index, distance along the lap s, and lateral offset (left +).
export function locate(track, x, y, hint = null) {
  const { points, n } = track;
  let best = Infinity, bi = 0;
  const scan = (i) => { const p = points[(i + n) % n], d = (p[0] - x) ** 2 + (p[1] - y) ** 2; if (d < best) { best = d; bi = (i + n) % n; } };
  if (hint === null) for (let i = 0; i < n; i++) scan(i);
  else for (let i = hint - 30; i <= hint + 30; i++) scan(i);
  // Refine on the segment to the next sample.
  const a = points[bi], b = points[(bi + 1) % n];
  const ex = b[0] - a[0], ey = b[1] - a[1], len2 = ex * ex + ey * ey;
  let t = ((x - a[0]) * ex + (y - a[1]) * ey) / len2;
  t = Math.max(-1, Math.min(1, t));
  const lx = a[0] + t * ex, ly = a[1] + t * ey;
  const lateral = (ex * (y - ly) - ey * (x - lx)) / Math.sqrt(len2);
  return { i: bi, s: ((bi + t) * STEP + track.length) % track.length, lateral };
}

export function surfaceAt(track, loc) {
  const off = Math.abs(loc.lateral);
  if (off <= HALF_WIDTH) return SURFACES.track;
  if (off <= HALF_WIDTH + KERB && track.corner[loc.i]) return SURFACES.kerb;
  return SURFACES.grass;
}

// A ground function for vehicle.step that remembers where each point was last time, so each lookup only
// searches nearby.
export function groundFor(track) {
  const hints = [null, null, null, null];
  let k = 0;
  return (x, y) => {
    const j = k++ % 4;
    const loc = locate(track, x, y, hints[j]);
    if (Math.abs(loc.lateral) > RUNOFF + 20) { hints[j] = null; } else hints[j] = loc.i;
    return surfaceAt(track, loc);
  };
}

// Keeps the car inside the barriers: a car that reaches one is stopped against it, losing most of its speed.
export function barrier(track, s, hint = null) {
  const loc = locate(track, s.x, s.y, hint);
  if (Math.abs(loc.lateral) <= RUNOFF) return { hit: false, loc };
  const side = Math.sign(loc.lateral), i = loc.i, h = track.heading[i];
  const nx = -Math.sin(h) * side, ny = Math.cos(h) * side; // outward normal
  const p = track.points[i];
  const tx = Math.cos(h), ty = Math.sin(h);
  const along = (s.x - p[0]) * tx + (s.y - p[1]) * ty;
  s.x = p[0] + along * tx + nx * (RUNOFF - 0.5);
  s.y = p[1] + along * ty + ny * (RUNOFF - 0.5);
  // World velocity, kill the part into the wall, keep 30 % of the rest.
  const ch = Math.cos(s.heading), sh = Math.sin(s.heading);
  let wx = s.vx * ch - s.vy * sh, wy = s.vx * sh + s.vy * ch;
  const into = wx * nx + wy * ny;
  if (into > 0) { wx -= into * nx; wy -= into * ny; }
  wx *= 0.3; wy *= 0.3;
  s.vx = wx * ch + wy * sh; s.vy = -wx * sh + wy * ch; s.r *= 0.2;
  s.omega = s.omega.map(() => s.vx / 0.36);
  return { hit: true, loc };
}
