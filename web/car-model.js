// The car's shape: a made-up modern single-seater, built from lofted cross-sections, boxes and tubes, in a
// livery of its own. It is drawn in the car's body frame and placed by the engine's state each frame.
//
// Body frame here: x forward, y to the left, z up, metres, origin at the centre of gravity on the ground.
// three.js uses y up, so a body point (x, y, z) sits at (x, z, -y) in the model.
import * as THREE from "three";
import { CAR, frontAxle, rearAxle } from "../src/car.js";

const P = (x, y, z) => new THREE.Vector3(x, z, -y);

export const LIVERY = { body: 0x34308c, stripe: 0xf1f0f6, accent: 0xffb21c, carbon: 0x17181c, number: "27" };

// A tube along x through rounded cross-sections. Each section: { x, y, w, zb, zt, p } with w the half width,
// zb and zt the bottom and top, p the roundness (2 is an ellipse, larger is squarer).
function loft(sections, around = 20) {
  const pos = [], idx = [];
  for (const s of sections) {
    const h = (s.zt - s.zb) / 2, zc = (s.zt + s.zb) / 2, e = 2 / (s.p || 2.6);
    for (let k = 0; k < around; k++) {
      const t = (k / around) * Math.PI * 2, c = Math.cos(t), n = Math.sin(t);
      const y = (s.y || 0) + s.w * Math.sign(c) * Math.abs(c) ** e, z = zc + h * Math.sign(n) * Math.abs(n) ** e;
      pos.push(s.x, z, -y);
    }
  }
  for (let i = 0; i < sections.length - 1; i++) for (let k = 0; k < around; k++) {
    const a = i * around + k, b = i * around + ((k + 1) % around), c = a + around, d = b + around;
    idx.push(a, c, b, b, c, d);
  }
  for (const [i, flip] of [[0, false], [sections.length - 1, true]]) {
    const s = sections[i], centre = pos.length / 3;
    pos.push(s.x, (s.zt + s.zb) / 2, -(s.y || 0));
    for (let k = 0; k < around; k++) {
      const a = i * around + k, b = i * around + ((k + 1) % around);
      if (flip) idx.push(centre, a, b); else idx.push(centre, b, a);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function box(mat, [x0, x1], [y0, y1], [z0, z1]) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, z1 - z0, y1 - y0), mat);
  m.position.set((x0 + x1) / 2, (z0 + z1) / 2, -(y0 + y1) / 2);
  return m;
}

function tube(mat, points, radius) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => P(...p)));
  return new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(8, points.length * 8), radius, 8, false), mat);
}

function rod(mat, a, b, r = 0.018) {
  const A = P(...a), B = P(...b), len = A.distanceTo(B);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6), mat);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  return m;
}

function numberTexture(text, { bg = null, fg = "#fff", w = 256, h = 256, font = 170 } = {}) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d");
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
  g.fillStyle = fg;
  g.font = `italic 800 ${font}px system-ui, sans-serif`;
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(text, w / 2, h / 2 + font * 0.04);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function decal(texture, w, h) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: texture, transparent: true, polygonOffset: true, polygonOffsetFactor: -4, depthWrite: false }));
  return m;
}

// A tyre's cross-section, turned round the axle: rounded shoulders and a flat tread.
function tyreGeometry(radius, width) {
  const r0 = radius * 0.63, hw = width / 2, s = 0.05, pts = [];
  pts.push(new THREE.Vector2(r0, -hw + 0.01));
  for (let k = 0; k <= 6; k++) { const t = (k / 6) * (Math.PI / 2); pts.push(new THREE.Vector2(radius - s + s * Math.sin(t), -hw + s - s * Math.cos(t))); }
  for (let k = 0; k <= 6; k++) { const t = (k / 6) * (Math.PI / 2); pts.push(new THREE.Vector2(radius - s + s * Math.cos(t), hw - s + s * Math.sin(t))); }
  pts.push(new THREE.Vector2(r0, hw - 0.01));
  const g = new THREE.LatheGeometry(pts, 36);
  g.rotateX(Math.PI / 2); // axle along z, which is the body's sideways axis
  return g;
}

function rimTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = "#1c1d21"; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = "#7b7f88"; g.lineWidth = 9;
  for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; g.beginPath(); g.moveTo(64 + 14 * Math.cos(a), 64 + 14 * Math.sin(a)); g.lineTo(64 + 60 * Math.cos(a + 0.18), 64 + 60 * Math.sin(a + 0.18)); g.stroke(); }
  g.fillStyle = "#2a2c31"; g.beginPath(); g.arc(64, 64, 15, 0, 7); g.fill();
  g.strokeStyle = "#555"; g.lineWidth = 3; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.stroke();
  g.fillStyle = "#c79a2a"; for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; g.beginPath(); g.arc(64 + 9 * Math.cos(a), 64 + 9 * Math.sin(a), 2.5, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeWheel(front, mats, rim) {
  const radius = CAR.wheelRadius, width = front ? 0.37 : 0.45;
  const spin = new THREE.Group();
  const tyre = new THREE.Mesh(tyreGeometry(radius, width), mats.tyre);
  spin.add(tyre);
  // A band on the sidewall so the spin shows, and the rim inside.
  for (const side of [-1, 1]) {
    const band = new THREE.Mesh(new THREE.RingGeometry(radius * 0.78, radius * 0.83, 36), mats.band);
    band.position.z = (side * width) / 2 + side * 0.003;
    if (side < 0) band.rotation.y = Math.PI;
    spin.add(band);
    const face = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.63, 28), new THREE.MeshLambertMaterial({ map: rim }));
    face.position.z = side * (width / 2 - 0.04);
    if (side < 0) face.rotation.y = Math.PI;
    spin.add(face);
  }
  const steer = new THREE.Group();
  steer.add(spin);
  return { steer, spin };
}

export function buildCar() {
  const mats = {
    body: new THREE.MeshPhongMaterial({ color: LIVERY.body, specular: 0x9a9ab8, shininess: 70 }),
    stripe: new THREE.MeshPhongMaterial({ color: LIVERY.stripe, specular: 0x888888, shininess: 60 }),
    accent: new THREE.MeshPhongMaterial({ color: LIVERY.accent, specular: 0x666666, shininess: 50 }),
    carbon: new THREE.MeshPhongMaterial({ color: LIVERY.carbon, specular: 0x303038, shininess: 40 }),
    halo: new THREE.MeshPhongMaterial({ color: 0x4a4e5a, emissive: 0x1a1c24, specular: 0xb0b6c4, shininess: 70 }),
    tyre: new THREE.MeshLambertMaterial({ color: 0x1b1b1d }),
    band: new THREE.MeshLambertMaterial({ color: 0xd8d8d8, side: THREE.DoubleSide }),
    dark: new THREE.MeshLambertMaterial({ color: 0x08080a }),
    helmet: new THREE.MeshPhongMaterial({ color: 0xf4f4f6, specular: 0xffffff, shininess: 90 }),
    visor: new THREE.MeshPhongMaterial({ color: 0x0b0d12, specular: 0xbfc7ff, shininess: 120 }),
    suspension: new THREE.MeshLambertMaterial({ color: 0x101114 }),
  };
  const car = new THREE.Group();
  const add = (m) => (car.add(m), m);
  const a = frontAxle(), b = rearAxle();

  // Nose and survival cell, one loft from the tip of the nose to behind the driver.
  add(new THREE.Mesh(loft([
    { x: a + 1.12, w: 0.07, zb: 0.17, zt: 0.25, p: 2.2 },
    { x: a + 0.85, w: 0.12, zb: 0.14, zt: 0.33, p: 2.4 },
    { x: a + 0.3, w: 0.18, zb: 0.12, zt: 0.47, p: 2.6 },
    { x: a - 0.3, w: 0.25, zb: 0.09, zt: 0.58, p: 2.8 },
    { x: a - 1.1, w: 0.35, zb: 0.05, zt: 0.64, p: 3.2 },
    { x: 0.4, w: 0.39, zb: 0.04, zt: 0.63, p: 3.4 },
    { x: -0.2, w: 0.42, zb: 0.04, zt: 0.62, p: 3.4 },
    { x: -0.45, w: 0.4, zb: 0.04, zt: 0.6, p: 3.2 },
  ]), mats.body));
  // A white stripe down the top of the nose.
  add(new THREE.Mesh(loft([
    { x: a + 1.0, w: 0.035, zb: 0.24, zt: 0.29, p: 2 },
    { x: a + 0.3, w: 0.05, zb: 0.44, zt: 0.49, p: 2 },
    { x: a - 0.3, w: 0.06, zb: 0.55, zt: 0.6, p: 2 },
    { x: a - 1.0, w: 0.065, zb: 0.61, zt: 0.655, p: 2 },
  ], 10), mats.stripe));
  // The cockpit opening, dark, and the headrest round the driver.
  add(new THREE.Mesh(loft([
    { x: 0.62, w: 0.24, zb: 0.6, zt: 0.645, p: 4 },
    { x: 0.1, w: 0.27, zb: 0.6, zt: 0.65, p: 4 },
    { x: -0.12, w: 0.25, zb: 0.6, zt: 0.65, p: 4 },
  ], 16), mats.dark));
  add(new THREE.Mesh(loft([
    { x: -0.02, w: 0.32, zb: 0.58, zt: 0.72, p: 3 },
    { x: -0.25, w: 0.3, zb: 0.56, zt: 0.78, p: 3 },
  ], 16), mats.carbon));

  // Engine cover, from the airbox above the driver's head to the gearbox, with a fin.
  add(new THREE.Mesh(loft([
    { x: -0.18, w: 0.2, zb: 0.5, zt: 0.99, p: 2.6 },
    { x: -0.5, w: 0.27, zb: 0.4, zt: 0.93, p: 2.8 },
    { x: -1.1, w: 0.3, zb: 0.25, zt: 0.74, p: 3 },
    { x: -1.7, w: 0.2, zb: 0.2, zt: 0.56, p: 3 },
    { x: -2.25, w: 0.1, zb: 0.2, zt: 0.42, p: 3 },
  ]), mats.body));
  add(new THREE.Mesh(loft([
    { x: -0.25, w: 0.035, zb: 0.95, zt: 1.0, p: 2 },
    { x: -0.9, w: 0.04, zb: 0.8, zt: 0.84, p: 2 },
    { x: -1.6, w: 0.03, zb: 0.59, zt: 0.63, p: 2 },
  ], 8), mats.stripe));
  // The airbox mouth and the onboard camera pod above it.
  const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.1, 20), mats.dark);
  mouth.scale.set(1, 0.75, 1);
  mouth.position.set(-0.165, 0.9, 0);
  mouth.rotation.y = Math.PI / 2;
  add(mouth);
  add(box(mats.carbon, [-0.36, -0.2], [-0.05, 0.05], [0.99, 1.05]));

  // Sidepods, narrowing toward the back.
  for (const side of [-1, 1]) {
    add(new THREE.Mesh(loft([
      { x: 0.55, y: side * 0.6, w: 0.2, zb: 0.12, zt: 0.55, p: 3.4 },
      { x: 0.2, y: side * 0.62, w: 0.24, zb: 0.1, zt: 0.6, p: 3.4 },
      { x: -0.5, y: side * 0.58, w: 0.22, zb: 0.1, zt: 0.55, p: 3.2 },
      { x: -1.2, y: side * 0.45, w: 0.14, zb: 0.1, zt: 0.42, p: 3 },
      { x: -1.7, y: side * 0.32, w: 0.08, zb: 0.12, zt: 0.3, p: 3 },
    ]), mats.body));
    const inlet = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), mats.dark);
    inlet.position.set(0.556, 0.36, -side * 0.6);
    inlet.rotation.y = Math.PI / 2;
    add(inlet);
    // An amber flash along each pod.
    add(new THREE.Mesh(loft([
      { x: 0.35, y: side * 0.835, w: 0.012, zb: 0.3, zt: 0.38, p: 2 },
      { x: -0.4, y: side * 0.79, w: 0.012, zb: 0.28, zt: 0.34, p: 2 },
      { x: -1.0, y: side * 0.6, w: 0.012, zb: 0.24, zt: 0.28, p: 2 },
    ], 8), mats.accent));
    // Mirrors on stalks.
    add(box(mats.body, [0.42, 0.56], [side * 0.62 - 0.08, side * 0.62 + 0.08], [0.7, 0.76]));
    add(rod(mats.carbon, [0.5, side * 0.38, 0.62], [0.5, side * 0.6, 0.72], 0.012));
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.055), new THREE.MeshPhongMaterial({ color: 0x8090a8, specular: 0xffffff, shininess: 120 }));
    glass.position.set(0.415, 0.73, -side * 0.62);
    glass.rotation.y = -Math.PI / 2;
    add(glass);
  }

  // Floor, diffuser and the plank.
  add(box(mats.carbon, [-1.9, a - 0.55], [-0.82, 0.82], [0.03, 0.055]));
  add(box(mats.carbon, [-2.45, -1.9], [-0.55, 0.55], [0.06, 0.09])).rotation.z = -0.25;

  // Front wing: a main plane, two flaps and endplates.
  const fw = a + 0.95;
  add(box(mats.carbon, [fw - 0.12, fw + 0.18], [-1.0, 1.0], [0.07, 0.1]));
  add(box(mats.body, [fw - 0.22, fw - 0.02], [-0.98, -0.22], [0.12, 0.15])).rotation.z = -0.25;
  add(box(mats.body, [fw - 0.22, fw - 0.02], [0.22, 0.98], [0.12, 0.15])).rotation.z = -0.25;
  add(box(mats.stripe, [fw - 0.32, fw - 0.14], [-0.97, -0.3], [0.17, 0.2])).rotation.z = -0.4;
  add(box(mats.stripe, [fw - 0.32, fw - 0.14], [0.3, 0.97], [0.17, 0.2])).rotation.z = -0.4;
  for (const side of [-1, 1]) {
    add(box(mats.accent, [fw - 0.36, fw + 0.2], [side * 1.0 - 0.012, side * 1.0 + 0.012], [0.05, 0.27]));
    add(rod(mats.carbon, [fw + 0.02, side * 0.08, 0.1], [fw + 0.05, side * 0.05, 0.2], 0.02));
  }

  // Rear wing: main plane, flap, endplates, beam wing and the pylon.
  const rw = -b - 0.85;
  add(box(mats.carbon, [rw - 0.22, rw + 0.08], [-0.52, 0.52], [0.79, 0.83])).rotation.z = -0.12;
  add(box(mats.body, [rw - 0.27, rw - 0.07], [-0.52, 0.52], [0.86, 0.9])).rotation.z = -0.45;
  for (const side of [-1, 1]) {
    add(box(mats.accent, [rw - 0.35, rw + 0.12], [side * 0.53 - 0.012, side * 0.53 + 0.012], [0.32, 0.95]));
  }
  add(box(mats.carbon, [rw - 0.12, rw + 0.12], [-0.42, 0.42], [0.42, 0.45]));
  add(box(mats.carbon, [rw - 0.05, rw + 0.25], [-0.02, 0.02], [0.3, 0.82]));
  add(box(mats.accent, [rw - 0.33, rw + 0.12], [-0.51, 0.51], [0.945, 0.955]));
  // A rain light.
  add(box(new THREE.MeshBasicMaterial({ color: 0x400608 }), [-b - 0.72, -b - 0.66], [-0.05, 0.05], [0.37, 0.43]));

  // The halo: a centre pillar from the front of the cockpit and a hoop round the driver's head.
  add(tube(mats.halo, [[0.84, 0, 0.62], [0.74, 0, 0.84], [0.6, 0, 0.955]], 0.024));
  add(tube(mats.halo, [[-0.06, 0.31, 0.66], [-0.02, 0.32, 0.88], [0.26, 0.28, 0.96], [0.52, 0.07, 0.97], [0.6, 0, 0.965], [0.52, -0.07, 0.97], [0.26, -0.28, 0.96], [-0.02, -0.32, 0.88], [-0.06, -0.31, 0.66]], 0.02));

  // The driver's helmet.
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.135, 20, 14), mats.helmet);
  helmet.position.set(0.06, 0.79, 0);
  helmet.scale.set(1.12, 1, 1);
  add(helmet);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.137, 20, 6, Math.PI - 0.9, 1.8, 1.15, 0.45), mats.visor); // phi = pi faces forward
  visor.position.copy(helmet.position);
  visor.scale.copy(helmet.scale);
  visor.rotation.y = 0;
  add(visor);
  const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.137, 0.012, 6, 30, Math.PI), mats.accent);
  stripe.position.copy(helmet.position);
  stripe.rotation.y = Math.PI / 2;
  add(stripe);

  // The steering wheel, with a small screen; it turns with the front wheels.
  const wheel = new THREE.Group();
  wheel.position.set(0.52, 0.645, 0); // its top half shows above the cockpit rim
  wheel.rotation.order = "ZYX"; // turn about the column, then rake it
  wheel.rotation.z = -0.35; // the face tilts up toward the driver
  const rimMat = new THREE.MeshPhongMaterial({ color: 0x24262b, specular: 0x55585f, shininess: 40 });
  const gripMat = new THREE.MeshLambertMaterial({ color: 0x3b3f47 });
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.13, 0.27), rimMat);
  wheel.add(plate);
  for (const side of [-1, 1]) {
    const grip = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.09, 4, 8), gripMat);
    grip.position.set(-0.005, -0.005, side * 0.14);
    wheel.add(grip);
  }
  // Rotary switches and buttons on the face.
  [[0xc9921a, -0.07, -0.035], [0x3a54c8, 0.07, -0.035], [0xb8b8b8, -0.085, 0.022], [0xc83030, 0.085, 0.022], [0x2fae6a, -0.03, -0.05], [0xb8b8b8, 0.03, -0.05]].forEach(([c, z, y]) => {
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0075, 0.01, 10), new THREE.MeshLambertMaterial({ color: c }));
    knob.rotation.z = Math.PI / 2;
    knob.position.set(-0.019, y, z);
    wheel.add(knob);
  });
  const screenCanvas = document.createElement("canvas");
  screenCanvas.width = 128; screenCanvas.height = 64;
  const screenTex = new THREE.CanvasTexture(screenCanvas);
  screenTex.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.055), new THREE.MeshBasicMaterial({ map: screenTex }));
  screen.position.set(-0.017, 0.015, 0);
  screen.rotation.y = -Math.PI / 2;
  wheel.add(screen);
  const leds = [];
  for (let k = 0; k < 10; k++) {
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.008, 0.012), new THREE.MeshBasicMaterial({ color: 0x111111 }));
    led.position.set(-0.017, 0.058, -0.072 + k * 0.016);
    wheel.add(led);
    leds.push(led);
  }
  add(wheel);

  // Wheels, with wishbones out to each hub.
  const wheels = [], spins = [];
  const rim = rimTexture();
  const spots = [[a, CAR.trackFront / 2], [a, -CAR.trackFront / 2], [-b, CAR.trackRear / 2], [-b, -CAR.trackRear / 2]];
  spots.forEach(([x, y], i) => {
    const front = i < 2, side = Math.sign(y);
    const w = makeWheel(front, mats, rim);
    w.steer.position.set(x, CAR.wheelRadius, -y);
    car.add(w.steer);
    wheels.push(w.steer); spins.push(w.spin);
    const inner = front ? 0.2 : 0.3, hub = y - side * (front ? 0.12 : 0.15);
    for (const [dx0, dx1, z] of [[-0.25, 0.2, 0.24], [-0.15, 0.25, 0.46]]) {
      add(rod(mats.suspension, [x + dx0, side * inner, z], [x, hub, z + 0.02 * Math.sign(z - 0.3)]));
      add(rod(mats.suspension, [x + dx1, side * inner, z], [x, hub, z + 0.02 * Math.sign(z - 0.3)]));
    }
    add(rod(mats.suspension, [x, hub, 0.36], [x - 0.1, side * inner, front ? 0.55 : 0.4], 0.014));
  });

  // The number, on the nose and on both rear wing endplates.
  const num = numberTexture(LIVERY.number);
  const nose = decal(num, 0.2, 0.2), slope = 0.25; // lying on the nose, readable from in front of the car
  nose.matrixAutoUpdate = false;
  nose.matrix.makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(-Math.cos(slope), Math.sin(slope), 0), new THREE.Vector3(Math.sin(slope), Math.cos(slope), 0));
  nose.matrix.setPosition(a + 0.55, 0.412, 0);
  add(nose);
  for (const side of [-1, 1]) {
    const n = decal(numberTexture(LIVERY.number, { fg: "#1a1450" }), 0.3, 0.3);
    n.position.set(rw - 0.11, 0.66, -side * (0.53 + 0.014));
    n.rotation.y = side > 0 ? Math.PI : 0; // facing out on each side
    add(n);
    const c = decal(num, 0.28, 0.28);
    c.position.set(-1.0, 0.52, -side * 0.302);
    c.rotation.y = side > 0 ? Math.PI : 0;
    add(c);
  }

  let lastScreen = 0, rot = [0, 0, 0, 0];
  const g = screenCanvas.getContext("2d");
  // Places the model from the engine's state; dt is the frame time for spinning the wheels.
  function update(s, dt, now) {
    car.position.set(s.x, 0, -s.y);
    car.rotation.y = s.heading;
    for (let i = 0; i < 4; i++) {
      rot[i] = (rot[i] - s.omega[i] * dt) % (Math.PI * 2);
      spins[i].rotation.z = rot[i];
      if (i < 2) wheels[i].rotation.y = s.steer;
    }
    wheel.rotation.x = -(s.steer / CAR.maxSteer) * 1.4;
    const shiftAt = [11500, 12000, 12500, 13000, 13300, 13600, 13800, 14000, 14100, 14200];
    leds.forEach((l, k) => l.material.color.setHex(s.rpm > shiftAt[k] ? (k < 4 ? 0x20ff40 : k < 8 ? 0xff2020 : 0x4060ff) : 0x111111));
    if (now - lastScreen > 120) {
      lastScreen = now;
      g.fillStyle = "#05070a"; g.fillRect(0, 0, 128, 64);
      g.fillStyle = "#e8ecff"; g.font = "bold 44px system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(s.gear === 0 ? "N" : String(s.gear), 64, 30);
      g.font = "12px system-ui, sans-serif"; g.fillStyle = "#7f8aa8";
      g.fillText(`${Math.round(Math.hypot(s.vx, s.vy) * 3.6)}`, 22, 52); g.fillText(`${Math.round(s.rpm / 100) / 10}k`, 106, 52);
      screenTex.needsUpdate = true;
    }
  }
  return { group: car, update, helmet, visor, stripe, wheelGroup: wheel };
}
