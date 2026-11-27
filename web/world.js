// The circuit as you see it: asphalt with a rubbered-in racing line, white edge lines, kerbs at the corners,
// grass, barriers and catch fencing, grandstands, a pit building, a start gantry, braking boards, trees, hills
// and sky. Everything is built from the same centre line the engine drives on, so what you see is where the
// grip is. Textures are drawn at start-up; there are no image files.
//
// Physics coordinates are x east, y north; three.js has y up, so a point (x, y) sits at (x, 0, -y).
import * as THREE from "three";
import { HALF_WIDTH, KERB, RUNOFF, STEP } from "../src/track.js";

const rand = (() => { let s = 20260214; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();

function canvasTexture(w, h, draw, { repeat = true, srgb = true } = {}) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function speckle(g, w, h, base, spread, count, size = 1) {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let k = 0; k < count; k++) {
    const v = (rand() - 0.5) * spread;
    g.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v)})`;
    g.fillRect(rand() * w, rand() * h, size + rand() * size, size + rand() * size);
  }
}

const TEX = {
  asphalt: () => canvasTexture(512, 512, (g, w, h) => {
    speckle(g, w, h, "#5d5f63", 0.22, 26000, 1);
    speckle(g, w, h, "rgba(0,0,0,0)", 0.12, 3000, 2);
  }),
  grass: () => canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = "#4f7a2f"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#5a8735"; g.fillRect(0, 0, w / 2, h); // mowing stripes
    for (let k = 0; k < 30000; k++) {
      const v = rand();
      g.fillStyle = v < 0.5 ? `rgba(30,55,15,${0.25 * rand()})` : `rgba(150,190,80,${0.2 * rand()})`;
      g.fillRect(rand() * w, rand() * h, 1, 2 + rand() * 3);
    }
  }),
  kerb: () => canvasTexture(64, 256, (g, w, h) => {
    g.fillStyle = "#d42323"; g.fillRect(0, 0, w, h / 2);
    g.fillStyle = "#f2f2f2"; g.fillRect(0, h / 2, w, h / 2);
    for (let k = 0; k < 800; k++) { g.fillStyle = `rgba(0,0,0,${0.12 * rand()})`; g.fillRect(rand() * w, rand() * h, 2, 2); }
  }),
  armco: () => canvasTexture(64, 64, (g, w, h) => {
    g.fillStyle = "#8a9096"; g.fillRect(0, 0, w, h);
    for (const y of [10, 34]) {
      const grd = g.createLinearGradient(0, y, 0, y + 18);
      grd.addColorStop(0, "#dfe4e8"); grd.addColorStop(0.5, "#a8aeb4"); grd.addColorStop(1, "#6d737a");
      g.fillStyle = grd; g.fillRect(0, y, w, 18);
    }
    g.fillStyle = "#4c5156"; g.fillRect(0, 56, w, 8);
    g.fillStyle = "#c9a227"; g.fillRect(0, 0, w, 4);
  }),
  fence: () => canvasTexture(64, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = "rgba(200,205,210,0.55)"; g.lineWidth = 1.4;
    for (let k = -64; k < 128; k += 8) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 64, 64); g.stroke(); g.beginPath(); g.moveTo(k + 64, 0); g.lineTo(k, 64); g.stroke(); }
  }),
  crowd: () => canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = "#3a3d44"; g.fillRect(0, 0, w, h);
    const hues = ["#d63a3a", "#f2c230", "#2f6fd6", "#f4f4f4", "#e57b2b", "#3aa35c", "#8a3ad6", "#1d1d1d", "#c9b79c"];
    for (let r = 0; r < 16; r++) {
      g.fillStyle = "#25272c"; g.fillRect(0, r * 16 + 13, w, 3);
      for (let x = 2; x < w; x += 5 + rand() * 3) if (rand() < 0.85) {
        g.fillStyle = hues[Math.floor(rand() * hues.length)]; g.fillRect(x, r * 16 + 4 + rand() * 3, 4, 7);
        g.fillStyle = "#d9b38c"; g.fillRect(x + 0.5, r * 16 + 1 + rand() * 2, 3, 3);
      }
    }
  }),
  board: (text, bg, fg) => canvasTexture(512, 128, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg; g.font = "italic 800 78px system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(text, w / 2, h / 2 + 4);
  }, { repeat: false }),
  distance: (n) => canvasTexture(128, 96, (g, w, h) => {
    g.fillStyle = "#f6f6f6"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "#111"; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
    g.fillStyle = "#111"; g.font = "bold 58px system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(String(n), w / 2, h / 2 + 3);
  }, { repeat: false }),
  cloud: () => canvasTexture(256, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let k = 0; k < 26; k++) {
      const x = 40 + rand() * 176, y = 50 + rand() * 40, r = 18 + rand() * 30;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, "rgba(255,255,255,0.5)"); grd.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
  }, { repeat: false }),
};

export function buildWorld(scene, track, line, plan) {
  const { points, heading, n, corner, curvature, length } = track;
  const nx = heading.map((h) => -Math.sin(h)), ny = heading.map((h) => Math.cos(h)); // left normal
  const at = (i, off) => { const j = ((i % n) + n) % n; return [points[j][0] + nx[j] * off, points[j][1] + ny[j] * off]; };

  // A strip along the lap, or part of it: offsets across (left +), a height for each, u across, v along.
  function ribbon(offsets, heights, { from = 0, to = n, vScale = 4, uScale = 4, color = null } = {}) {
    const pos = [], uv = [], col = [], idx = [], cols = offsets.length;
    for (let i = from; i <= to; i++) {
      for (let k = 0; k < cols; k++) {
        const [x, y] = at(i, offsets[k]);
        pos.push(x, heights[k], -y);
        uv.push(offsets[k] / uScale, (i * STEP) / vScale);
        if (color) col.push(...color(i, offsets[k]));
      }
    }
    for (let i = 0; i < to - from; i++) for (let k = 0; k < cols - 1; k++) {
      const a = i * cols + k, b = a + 1, c = a + cols, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    if (color) g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
  const add = (g, m) => { const mesh = new THREE.Mesh(g, m); scene.add(mesh); return mesh; };

  // Sky, sun and haze.
  const haze = new THREE.Color(0xd6e3ef);
  scene.fog = new THREE.FogExp2(haze, 0.00024);
  scene.background = haze;
  {
    const g = new THREE.SphereGeometry(4500, 32, 16), c = [], p = g.attributes.position;
    const top = new THREE.Color(0x3d78c4), horizon = new THREE.Color(0xd9e6f2);
    for (let i = 0; i < p.count; i++) { const t = Math.max(0, p.getY(i) / 4500); const k = new THREE.Color().lerpColors(horizon, top, Math.pow(t, 0.55)); c.push(k.r, k.g, k.b); }
    g.setAttribute("color", new THREE.Float32BufferAttribute(c, 3));
    const dome = add(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    dome.renderOrder = -2;
    dome.userData.followCamera = true;
  }
  const sunDir = new THREE.Vector3(-0.45, 0.62, 0.64).normalize();
  scene.add(new THREE.HemisphereLight(0xd7e6ff, 0x55663a, 1.15));
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.1);
  sun.position.copy(sunDir).multiplyScalar(100);
  scene.add(sun);
  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(90, 24), new THREE.MeshBasicMaterial({ color: 0xfff8e6, fog: false }));
  sunDisc.position.copy(sunDir).multiplyScalar(4200);
  sunDisc.lookAt(0, 0, 0);
  sunDisc.userData.followCamera = true;
  scene.add(sunDisc);
  {
    const tex = TEX.cloud();
    for (let k = 0; k < 26; k++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, fog: false, depthWrite: false, opacity: 0.85 }));
      const a = rand() * Math.PI * 2, r = 1500 + rand() * 2500;
      s.position.set(400 + Math.cos(a) * r, 380 + rand() * 500, 400 + Math.sin(a) * r);
      s.scale.set(700 + rand() * 600, 220 + rand() * 120, 1);
      s.renderOrder = -1;
      scene.add(s);
    }
  }

  // The ground, and hills on the horizon.
  const grassTex = TEX.grass();
  grassTex.repeat.set(160, 160);
  // Pushed back in depth a little, so the asphalt never flickers through it far away.
  const ground = add(new THREE.PlaneGeometry(9000, 9000), new THREE.MeshLambertMaterial({ map: grassTex, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 8 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(300, -0.03, 400);
  {
    const g = new THREE.CylinderGeometry(3800, 3800, 1, 160, 6, true), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x), up = p.getY(i) > 0;
      const hgt = 90 + 70 * Math.sin(a * 3 + 1) + 45 * Math.sin(a * 7 + 2) + 30 * Math.sin(a * 13);
      p.setY(i, up ? Math.max(30, hgt) : -5);
    }
    g.computeVertexNormals();
    const hills = add(g, new THREE.MeshLambertMaterial({ color: 0x51704a, side: THREE.BackSide }));
    hills.position.set(330, 0, 420);
  }

  // Asphalt, darker where cars run on the racing line.
  const across = [];
  for (let k = 0; k <= 12; k++) across.push(-HALF_WIDTH + (2 * HALF_WIDTH * k) / 12);
  const asphaltTex = TEX.asphalt();
  add(ribbon(across, across.map(() => 0), {
    vScale: 7, uScale: 7,
    color: (i, off) => { const d = off - line.offset[i % n], k = 1 - 0.28 * Math.exp(-(d * d) / 2.2); return [k, k, k * 1.01]; },
  }), new THREE.MeshLambertMaterial({ map: asphaltTex, vertexColors: true }));
  const paint = new THREE.MeshLambertMaterial({ color: 0xf0f0ee, polygonOffset: true, polygonOffsetFactor: -2 });
  for (const side of [-1, 1]) add(ribbon([side * (HALF_WIDTH - 0.42), side * (HALF_WIDTH - 0.08)].sort((a, b) => a - b), [0.004, 0.004]), paint);

  // Kerbs at the corners, on both sides, raised a few centimetres.
  const kerbTex = TEX.kerb();
  const kerbMat = new THREE.MeshLambertMaterial({ map: kerbTex });
  for (let i = 0; i < n; ) {
    if (!corner[i]) { i++; continue; }
    let j = i; while (j < n && corner[j]) j++;
    const from = Math.max(0, i - 4), to = Math.min(n, j + 4);
    add(ribbon([HALF_WIDTH, HALF_WIDTH + 0.4, HALF_WIDTH + KERB], [0.012, 0.055, 0.02], { from, to, vScale: 3 }), kerbMat);
    add(ribbon([-HALF_WIDTH - KERB, -HALF_WIDTH - 0.4, -HALF_WIDTH], [0.02, 0.055, 0.012], { from, to, vScale: 3 }), kerbMat);
    i = j;
  }

  // Start line and grid slots.
  {
    const startMat = new THREE.MeshLambertMaterial({ color: 0xf4f4f4, polygonOffset: true, polygonOffsetFactor: -3 });
    // A painted patch from s0 to s1 along the lap and o0 to o1 across it, placed between samples exactly.
    const strip = (s0, s1, o0, o1) => {
      const pos = [], idx = [], N = Math.max(1, Math.ceil((s1 - s0) / STEP));
      for (let k = 0; k <= N; k++) {
        const f = ((((s0 + ((s1 - s0) * k) / N) / STEP) % n) + n) % n, i = Math.floor(f), t = f - i;
        for (const o of [o0, o1]) { const a = at(i, o), b = at(i + 1, o); pos.push(a[0] + (b[0] - a[0]) * t, 0.006, -(a[1] + (b[1] - a[1]) * t)); }
      }
      for (let k = 0; k < N; k++) { const a = 2 * k; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      return add(g, startMat);
    };
    strip(-0.6, 0.6, -HALF_WIDTH, HALF_WIDTH); // the line, then grid boxes behind it
    // Each box: a bar the front wing stops behind, and its sides back from it.
    for (let k = 1; k <= 6; k++) {
      const s = length - 16 * k + (k % 2) * 8, o = (k % 2 ? 1 : -1) * 2.6;
      strip(s + 5.4, s + 6, o - 1.6, o + 1.6);
      strip(s, s + 5.4, o - 1.6, o - 1.35);
      strip(s, s + 5.4, o + 1.35, o + 1.6);
    }
  }

  // Barriers, with catch fencing on top, both sides of the whole lap.
  const armco = TEX.armco();
  armco.repeat.set(1, 1);
  const wallMat = new THREE.MeshLambertMaterial({ map: armco, side: THREE.DoubleSide });
  const fenceTex = TEX.fence();
  const fenceMat = new THREE.MeshBasicMaterial({ map: fenceTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, color: 0xcfd4d8 });
  function wall(off, h0, h1, mat, vScale) {
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= n; i++) {
      const [x, y] = at(i, off);
      pos.push(x, h0, -y, x, h1, -y);
      uv.push((i * STEP) / vScale, 0, (i * STEP) / vScale, 1);
    }
    for (let i = 0; i < n; i++) { const a = 2 * i; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return add(g, mat);
  }
  for (const side of [-1, 1]) {
    wall(side * RUNOFF, 0, 1.0, wallMat, 4);
    const f = wall(side * (RUNOFF + 0.4), 1.0, 4.2, fenceMat, 3.2);
    f.renderOrder = 1;
  }
  {
    const post = new THREE.BoxGeometry(0.12, 4.4, 0.12), mat = new THREE.MeshLambertMaterial({ color: 0x7d838a });
    const every = 5, count = 2 * Math.ceil(n / every);
    const posts = new THREE.InstancedMesh(post, mat, count), m = new THREE.Matrix4();
    let k = 0;
    for (const side of [-1, 1]) for (let i = 0; i < n; i += every) {
      const [x, y] = at(i, side * (RUNOFF + 0.45));
      m.makeTranslation(x, 2.2, -y);
      posts.setMatrixAt(k++, m);
    }
    posts.count = k;
    scene.add(posts);
  }

  // Grandstands facing the track: rows of seats with a crowd, a roof on pillars.
  const crowd = TEX.crowd();
  const standMat = new THREE.MeshLambertMaterial({ map: crowd });
  const concrete = new THREE.MeshLambertMaterial({ color: 0xbfc2c4 });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0xe9ebee, side: THREE.DoubleSide });
  function grandstand(i, side, len, rows = 14) {
    const [x, y] = at(i, side * (RUNOFF + 6)), h = heading[i % n];
    const grp = new THREE.Group();
    const depth = rows * 0.85, rise = rows * 0.5;
    const seats = new THREE.PlaneGeometry(len, Math.hypot(depth, rise));
    const uv = seats.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setX(k, (uv.getX(k) * len) / 25);
    const s = new THREE.Mesh(seats, standMat);
    s.rotation.x = -Math.atan2(rise, depth);
    s.position.set(0, 1.2 + rise / 2, -depth / 2);
    grp.add(s);
    const back = new THREE.Mesh(new THREE.BoxGeometry(len, rise + 1.2, 0.4), concrete);
    back.position.set(0, (rise + 1.2) / 2, -depth - 0.2);
    grp.add(back);
    const front = new THREE.Mesh(new THREE.BoxGeometry(len, 1.2, 0.3), concrete);
    front.position.set(0, 0.6, 0);
    grp.add(front);
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(len + 2, depth + 3), roofMat);
    roof.rotation.x = -Math.PI / 2 + 0.08;
    roof.position.set(0, rise + 5.2, -depth / 2 + 0.5);
    grp.add(roof);
    for (let k = -len / 2; k <= len / 2; k += 12) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.3, rise + 5.2, 0.3), concrete);
      p.position.set(k, (rise + 5.2) / 2, -depth - 0.1);
      grp.add(p);
    }
    // Local z points away from the track, x along it.
    grp.position.set(x, 0, -y);
    grp.rotation.y = h + (side > 0 ? 0 : Math.PI);
    scene.add(grp);
  }
  // Main straight: grandstand opposite the pits, which are on the inside of the lap.
  grandstand(Math.round((length - 120) / STEP), 1, 260);
  grandstand(Math.round(160 / STEP), 1, 180);
  {
    const [x, y] = at(0, -(RUNOFF + 14));
    const pits = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(420, 9, 16), new THREE.MeshLambertMaterial({ color: 0xdfe2e6 }));
    body.position.set(-60, 4.5, 8);
    pits.add(body);
    const band = new THREE.Mesh(new THREE.BoxGeometry(421, 1.6, 16.2), new THREE.MeshLambertMaterial({ color: 0x34308c }));
    band.position.set(-60, 8.3, 8);
    pits.add(band);
    for (let k = -260; k < 140; k += 14) {
      const door = new THREE.Mesh(new THREE.PlaneGeometry(10, 5), new THREE.MeshLambertMaterial({ color: 0x23262c }));
      door.position.set(k + 7, 2.6, -0.01);
      door.rotation.y = Math.PI;
      pits.add(door);
    }
    pits.position.set(x, 0, -y);
    pits.rotation.y = heading[0];
    scene.add(pits);
  }

  // Grandstands round the slow corners: on the outside of each, where the run-off is.
  const slow = [];
  for (let i = 0; i < n; i++) {
    const v = plan.speed[i];
    if (v < plan.speed[(i - 1 + n) % n] && v <= plan.speed[(i + 1) % n]) {
      let before = 0;
      for (let j = 1; j < 250; j++) before = Math.max(before, plan.speed[(i - j + n) % n]);
      if (before - v > 80 / 3.6) slow.push(i);
    }
  }
  for (const i of slow) {
    let k = 0, j = i; for (let d = -20; d <= 20; d++) if (Math.abs(curvature[(i + d + n) % n]) > Math.abs(k)) { k = curvature[(i + d + n) % n]; j = (i + d + n) % n; }
    grandstand(j, -Math.sign(k), 120, 12);
  }

  // Braking boards before each heavy braking zone, on the side the cars arrive on.
  for (const i of slow) {
    let k = 0; for (let d = -20; d <= 20; d++) if (Math.abs(curvature[(i + d + n) % n]) > Math.abs(k)) k = curvature[(i + d + n) % n];
    let entry = i;
    while (plan.speed[(entry - 1 + n) % n] < plan.speed[i] + 8 / 3.6 && entry > i - 100) entry--;
    const side = -Math.sign(k);
    for (const dist of [300, 200, 100]) {
      const j = (entry - Math.round(dist / STEP) + n) % n;
      const [x, y] = at(j, side * (HALF_WIDTH + 3.2));
      const b = new THREE.Group();
      const face = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.1), new THREE.MeshLambertMaterial({ map: TEX.distance(dist) }));
      face.position.y = 1.6;
      b.add(face);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.2, 0.1), concrete);
      post.position.y = 0.6;
      b.add(post);
      b.position.set(x, 0, -y);
      b.rotation.y = heading[j] - Math.PI / 2; // face the oncoming cars
      scene.add(b);
    }
  }

  // Boards along the barriers on the outside of corners and down the main straight.
  {
    const kinds = [TEX.board("SLIPSTREAM", "#34308c", "#ffffff"), TEX.board("SLIPSTREAM", "#ffb21c", "#1a1450"), TEX.board("CIRCUIT", "#f4f4f4", "#34308c")];
    const mats = kinds.map((t) => new THREE.MeshLambertMaterial({ map: t }));
    const geo = new THREE.PlaneGeometry(6, 1.5);
    for (let i = 0; i < n; i += 30) {
      const k = curvature[i], straight = i * STEP < 700 || i * STEP > length - 400;
      if (Math.abs(k) < 1 / 600 && !straight) continue;
      const side = straight ? 1 : -Math.sign(k);
      const [x, y] = at(i, side * (RUNOFF - 0.05));
      const m = new THREE.Mesh(geo, mats[(i / 30) % 3]);
      m.position.set(x, 0.75, -y);
      m.rotation.y = heading[i] + (side > 0 ? 0 : Math.PI); // facing the track
      scene.add(m);
    }
  }

  // The start gantry over the line: five pairs of red lights facing the grid.
  const lamps = [];
  {
    const gantry = new THREE.Group(), steel = new THREE.MeshLambertMaterial({ color: 0x30343a });
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7, 0.5), steel);
      post.position.set(0, 3.5, side * (HALF_WIDTH + 2.5));
      gantry.add(post);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 2 * HALF_WIDTH + 5.5), steel);
    beam.position.set(0, 6.6, 0);
    gantry.add(beam);
    for (let k = 0; k < 5; k++) {
      const pod = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.3, 0.7), new THREE.MeshLambertMaterial({ color: 0x0b0c0e }));
      pod.position.set(-0.4, 5.9, -2.4 + k * 1.2);
      gantry.add(pod);
      for (const dy of [0.3, -0.25]) {
        const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.19, 16), new THREE.MeshBasicMaterial({ color: 0x220606 }));
        lamp.position.set(-0.61, 5.9 + dy, -2.4 + k * 1.2);
        lamp.rotation.y = -Math.PI / 2;
        gantry.add(lamp);
        lamps.push({ k, lamp });
      }
    }
    const [x, y] = at(0, 0);
    gantry.position.set(x, 0, -y);
    gantry.rotation.y = heading[0];
    scene.add(gantry);
  }
  const setLights = (count) => lamps.forEach(({ k, lamp }) => lamp.material.color.setHex(k < count ? 0xff1b1b : 0x220606));

  // Trees, kept well back from the track.
  {
    const cell = 40, grid = new Map(), key = (x, y) => `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
    for (let i = 0; i < n; i++) { const k = key(points[i][0], points[i][1]); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(points[i]); }
    const near = (x, y, r) => {
      for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) {
        for (const p of grid.get(`${Math.floor(x / cell) + dx},${Math.floor(y / cell) + dy}`) || []) if ((p[0] - x) ** 2 + (p[1] - y) ** 2 < r * r) return true;
      }
      return false;
    };
    const trunk = new THREE.CylinderGeometry(0.25, 0.35, 3, 5), crown = new THREE.ConeGeometry(3.2, 9, 7);
    const crowns = [new THREE.MeshLambertMaterial({ color: 0x2f5a2a }), new THREE.MeshLambertMaterial({ color: 0x3d6b2c })];
    const total = 1400, spotsOk = [];
    while (spotsOk.length < total) {
      const x = -900 + rand() * 2700, y = -1700 + rand() * 2500;
      if (!near(x, y, RUNOFF + 18)) spotsOk.push([x, y, 0.7 + rand() * 0.8]);
    }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    const t = new THREE.InstancedMesh(trunk, new THREE.MeshLambertMaterial({ color: 0x5a4330 }), total);
    const c = [new THREE.InstancedMesh(crown, crowns[0], total), new THREE.InstancedMesh(crown, crowns[1], total)];
    const counts = [0, 0];
    spotsOk.forEach(([x, y, s], k) => {
      sc.set(s, s, s);
      m.compose(new THREE.Vector3(x, 1.5 * s, -y), q, sc); t.setMatrixAt(k, m);
      const which = k % 2;
      m.compose(new THREE.Vector3(x, (3 + 4.5) * s, -y), q, sc); c[which].setMatrixAt(counts[which]++, m);
    });
    c[0].count = counts[0]; c[1].count = counts[1];
    scene.add(t, c[0], c[1]);
  }

  // The racing line, to switch on: green where the plan accelerates, red where it brakes.
  const raceLine = (() => {
    const pos = [], col = [], idx = [];
    for (let i = 0; i <= n; i++) {
      const j = i % n, p = line.points[j], q = line.points[(j + 1) % n];
      const hx = q[0] - p[0], hy = q[1] - p[1], l = Math.hypot(hx, hy) || 1, lx = -hy / l, ly = hx / l;
      const dv = plan.speed[(j + 1) % n] - plan.speed[j];
      const c = dv > 0.02 ? [0.2, 0.9, 0.3] : dv < -0.05 ? [1, 0.15, 0.1] : [1, 0.85, 0.15];
      for (const s of [-0.45, 0.45]) { pos.push(p[0] + lx * s, 0.012, -(p[1] + ly * s)); col.push(...c); }
    }
    for (let i = 0; i < n; i++) { const a = 2 * i; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    const m = add(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
    m.visible = false;
    return m;
  })();

  // Where the trackside cameras stand: every 200 m, on the outside of the lap, up on a tower.
  const towers = [];
  for (let i = 0; i < n; i += 100) {
    let k = 0; for (let d = 0; d < 60; d++) k += curvature[(i + d) % n];
    const side = k < 0 ? 1 : -1;
    const [x, y] = at(i + 30, side * (RUNOFF + 7));
    towers.push({ i, x, y, z: 6 });
  }

  const skyParts = scene.children.filter((o) => o.userData.followCamera);
  for (const o of skyParts) o.userData.offset = o.position.clone();
  return { setLights, raceLine, towers, sky: skyParts };
}
