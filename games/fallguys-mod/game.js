import * as THREE from "three";

/* ============================== config ============================== */
const LANES = [-3, 0, 3];
const PLAYER_Z = 0;
const START_SPEED = 20;
const MAX_SPEED = 58;
const ACCEL = 0.55;
const JUMP_VEL = 12.5;
const GRAVITY = 32;
const SLIDE_TIME = 0.55;
const SPAWN_AHEAD = 230;
const KILL_Z = 14;
const FIRST_OBSTACLE_DIST = 60; // closest obstacle at start (~3s at START_SPEED)
const RUNWAY_GAP = 30; // spacing between pre-filled runway patterns

const BEAN_COLORS = [0xff5e5b, 0xffd166, 0x06d6a0, 0x118ab2, 0xef476f, 0x8338ec, 0xff9f1c];

/* ============================== dom ============================== */
const scoreEl = document.getElementById("score");
const coinsEl = document.getElementById("coins");
const coinBoxEl = document.getElementById("coin-box");
const bestEl = document.getElementById("best");
const speedEl = document.getElementById("speed");
const countEl = document.getElementById("count");
const overlayEl = document.getElementById("overlay");
const gameoverEl = document.getElementById("gameover");
const pauseEl = document.getElementById("pause");
const finalScoreEl = document.getElementById("final-score");
const finalBestEl = document.getElementById("final-best");
const startBtn = document.getElementById("start-btn");
const restartBtn = document.getElementById("restart-btn");

let best = parseInt(localStorage.getItem("beandash_best") || "0", 10) || 0;
bestEl.textContent = best;

/* ============================== audio ============================== */
let audioCtx = null;

function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
}

function beep(freq, dur, type = "square", vol = 0.12, slideTo = null) {
  if (!audioCtx) return;
  const t0 = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(t0);
  osc.stop(t0 + dur);
}

const sfx = {
  jump: () => beep(420, 0.18, "square", 0.1, 760),
  slide: () => beep(300, 0.15, "sawtooth", 0.08, 140),
  lane: () => beep(500, 0.06, "triangle", 0.08),
  coin: () => {
    beep(1500, 0.09, "sine", 0.14);
    beep(2100, 0.14, "sine", 0.1);
  },
  tick: () => beep(880, 0.08, "square", 0.08),
  go: () => beep(1320, 0.3, "square", 0.1),
  crash: () => {
    beep(160, 0.4, "sawtooth", 0.2, 40);
    beep(90, 0.5, "square", 0.15, 30);
  },
};

/* ============================== scene ============================== */
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
} catch (err) {
  document.body.innerHTML =
    '<div style="height:100%;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px;font-family:system-ui,sans-serif;color:#fff;background:#0e1116">' +
    '<div><h1 style="font-size:28px;margin-bottom:12px">WebGL required</h1>' +
    '<p>Bean Dash needs a browser with WebGL enabled.<br>Try a recent Chrome, Firefox, Safari or Edge.</p></div></div>';
  throw new Error("WebGL is not available: " + err.message);
}
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87c8f0);
scene.fog = new THREE.Fog(0x87c8f0, 60, 240);

const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 400);
camera.position.set(0, 4.4, 8.5);
const camTarget = new THREE.Vector3(0, 1.4, -6); // lerped look-at target (no snap between modes)
camera.lookAt(camTarget);

function fitCamera() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.fov = camera.aspect < 0.8 ? 72 : 58; // wider FOV on portrait phones
  camera.updateProjectionMatrix();
}
fitCamera();

const hemi = new THREE.HemisphereLight(0xcfeaff, 0x59a045, 1.0);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff2d0, 1.6);
sun.position.set(-14, 24, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -12;
sun.shadow.camera.right = 12;
sun.shadow.camera.top = 18;
sun.shadow.camera.bottom = -18;
sun.shadow.camera.near = 2;
sun.shadow.camera.far = 60;
scene.add(sun);
scene.add(sun.target);
sun.target.position.set(0, 0, -4);

/* ============================== terrain ============================== */
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(400, 500),
  new THREE.MeshLambertMaterial({ color: 0x74c24e })
);
ground.rotation.x = -Math.PI / 2;
ground.position.set(0, -0.02, -120);
ground.receiveShadow = true;
scene.add(ground);

const segLen = 6;
const roadCanvas = document.createElement("canvas");
roadCanvas.width = 256;
roadCanvas.height = 256;
{
  const c = roadCanvas.getContext("2d");
  c.fillStyle = "#3b4048";
  c.fillRect(0, 0, 256, 256);
  const xToU = (x) => ((x + 5.5) / 11) * 256;
  c.fillStyle = "#f4f4f4";
  c.fillRect(xToU(-5.35), 0, 6, 256);
  c.fillRect(xToU(5.35) - 6, 0, 6, 256);
  for (const x of [-1.65, 1.65, -4.65, 4.65 - 0]) {
    for (let y = 0; y < 256; y += 64) c.fillRect(xToU(x) - 3, y, 6, 34);
  }
}
const roadTex = new THREE.CanvasTexture(roadCanvas);
roadTex.wrapS = roadTex.wrapT = THREE.RepeatWrapping;
roadTex.repeat.set(1, 260 / segLen);
roadTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

const road = new THREE.Mesh(
  new THREE.PlaneGeometry(11, 260),
  new THREE.MeshLambertMaterial({ map: roadTex })
);
road.rotation.x = -Math.PI / 2;
road.position.set(0, 0, -110);
road.receiveShadow = true;
scene.add(road);

/* side decorations */
const decoGroup = new THREE.Group();
scene.add(decoGroup);

const trunkGeo = new THREE.CylinderGeometry(0.25, 0.35, 1.6, 8);
const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a4a21 });
const leafGeoA = new THREE.ConeGeometry(1.5, 3.4, 10);
const leafGeoB = new THREE.SphereGeometry(1.6, 12, 10);
const leafMats = [0x2f9e44, 0x37b24d, 0x74c24e].map((c) => new THREE.MeshLambertMaterial({ color: c }));
const rockGeo = new THREE.DodecahedronGeometry(0.9, 0);
const rockMat = new THREE.MeshLambertMaterial({ color: 0x9aa1a8 });

/* llamas (decor, stand next to trees) */
const LLAMA_COLORS = [0xf3ead8, 0xcbb086, 0x8a6b4a, 0xd8d4cc];
const llamaGeo = {
  body: new THREE.CapsuleGeometry(0.4, 0.75, 4, 10),
  leg: new THREE.CylinderGeometry(0.07, 0.06, 0.62, 8),
  neck: new THREE.CylinderGeometry(0.13, 0.18, 0.9, 8),
  head: new THREE.SphereGeometry(0.23, 12, 10),
  bump: new THREE.SphereGeometry(1, 10, 8),
  ear: new THREE.ConeGeometry(0.06, 0.2, 6),
  eye: new THREE.SphereGeometry(0.045, 8, 6),
};
const llamaFurMat = new THREE.MeshLambertMaterial({ color: 0xf3ead8 });
const llamaEyeMat = new THREE.MeshBasicMaterial({ color: 0x14181f });

function makeLlama(color) {
  const g = new THREE.Group();
  const coat = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(llamaGeo.body, coat);
  body.rotation.z = Math.PI / 2;
  body.position.y = 0.95;
  body.castShadow = true;
  g.add(body);
  for (const [x, y, s] of [[-0.38, 1.12, 0.3], [0.05, 1.2, 0.28], [0.42, 1.05, 0.32]]) {
    const bump = new THREE.Mesh(llamaGeo.bump, llamaFurMat);
    bump.scale.setScalar(s);
    bump.position.set(x, y, 0);
    g.add(bump);
  }
  for (const [x, z] of [[-0.42, -0.2], [-0.42, 0.2], [0.42, -0.2], [0.42, 0.2]]) {
    const leg = new THREE.Mesh(llamaGeo.leg, coat);
    leg.position.set(x, 0.31, z);
    g.add(leg);
  }
  const neck = new THREE.Mesh(llamaGeo.neck, coat);
  neck.position.set(0.55, 1.4, 0);
  neck.rotation.z = -0.22;
  neck.castShadow = true;
  g.add(neck);
  const head = new THREE.Mesh(llamaGeo.head, coat);
  head.scale.set(1.05, 1.15, 0.95);
  head.position.set(0.72, 1.88, 0);
  head.castShadow = true;
  g.add(head);
  const tuft = new THREE.Mesh(llamaGeo.bump, llamaFurMat);
  tuft.scale.setScalar(0.14);
  tuft.position.set(0.64, 2.06, 0);
  g.add(tuft);
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(llamaGeo.ear, coat);
    ear.position.set(0.66, 2.14, sx * 0.13);
    ear.rotation.x = sx * 0.35;
    g.add(ear);
    const eye = new THREE.Mesh(llamaGeo.eye, llamaEyeMat);
    eye.position.set(0.86, 1.93, sx * 0.09);
    g.add(eye);
  }
  return g;
}

const decos = [];
for (let i = 0; i < 26; i++) {
  const isRock = Math.random() < 0.25;
  const g = new THREE.Group();
  if (isRock) {
    const r = new THREE.Mesh(rockGeo, rockMat);
    r.scale.setScalar(0.6 + Math.random() * 1.2);
    r.rotation.y = Math.random() * Math.PI;
    r.castShadow = true;
    g.add(r);
  } else {
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 0.8;
    trunk.castShadow = true;
    const leaf = new THREE.Mesh(Math.random() < 0.5 ? leafGeoA : leafGeoB, leafMats[(Math.random() * 3) | 0]);
    leaf.position.y = isRock ? 0 : 2.6 + (Math.random() < 0.5 ? 0.4 : 0);
    leaf.scale.y = 1 + Math.random() * 0.5;
    leaf.castShadow = true;
    g.add(trunk, leaf);
    if (Math.random() < 0.55) {
      const llama = makeLlama(LLAMA_COLORS[(Math.random() * LLAMA_COLORS.length) | 0]);
      llama.position.set((Math.random() - 0.5) * 3.4, 0, (Math.random() - 0.5) * 1.8);
      llama.rotation.y = Math.random() * Math.PI * 2;
      llama.scale.setScalar(0.8 + Math.random() * 0.45);
      g.add(llama);
    }
  }
  const side = Math.random() < 0.5 ? -1 : 1;
  g.position.set(side * (9.5 + Math.random() * 12), 0, -i * (SPAWN_AHEAD / 26) + 5);
  decoGroup.add(g);
  decos.push(g);
}

/* clouds */
const cloudGeo = new THREE.SphereGeometry(1, 10, 8);
const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
const clouds = [];
for (let i = 0; i < 9; i++) {
  const g = new THREE.Group();
  const n = 3 + ((Math.random() * 3) | 0);
  for (let j = 0; j < n; j++) {
    const m = new THREE.Mesh(cloudGeo, cloudMat);
    m.position.set(j * 2.2 - n, Math.random() * 0.6, Math.random() * 1.2);
    m.scale.set(1.8 + Math.random(), 1 + Math.random() * 0.5, 1.2);
    g.add(m);
  }
  g.position.set((Math.random() < 0.5 ? -1 : 1) * (25 + Math.random() * 45), 26 + Math.random() * 14, -30 - Math.random() * 180);
  scene.add(g);
  clouds.push(g);
}

/* ============================== player (the bean) ============================== */
const player = new THREE.Group();
player.position.set(0, 0, PLAYER_Z);
scene.add(player);

const bean = new THREE.Group();
player.add(bean);

const bodyMat = new THREE.MeshLambertMaterial({ color: BEAN_COLORS[(Math.random() * BEAN_COLORS.length) | 0] });
const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.62, 0.85, 6, 16), bodyMat);
body.position.y = 1.05;
body.castShadow = true;
bean.add(body);

const eyeMat = new THREE.MeshBasicMaterial({ color: 0x14181f });
const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
for (const sx of [-1, 1]) {
  const white = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), whiteMat);
  white.position.set(sx * 0.26, 1.32, -0.48);
  white.scale.z = 0.6;
  const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), eyeMat);
  pupil.position.set(sx * 0.26, 1.32, -0.6);
  bean.add(white, pupil);
}
const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), eyeMat);
mouth.position.set(0, 1.05, -0.55);
mouth.scale.set(1.6, 1.1, 0.5);
bean.add(mouth);

const armGeo = new THREE.CapsuleGeometry(0.14, 0.45, 4, 8);
const armL = new THREE.Mesh(armGeo, bodyMat);
const armR = new THREE.Mesh(armGeo, bodyMat);
armL.position.set(-0.72, 1.2, 0);
armR.position.set(0.72, 1.2, 0);
armL.castShadow = armR.castShadow = true;
bean.add(armL, armR);

/* chullo hat (Andean knitted beanie with ear-flaps + braided cords) */
const chulloCanvas = document.createElement("canvas");
chulloCanvas.width = 256;
chulloCanvas.height = 256;
{
  const c = chulloCanvas.getContext("2d");
  const BROWN = "#8b6f47", CREAM = "#ece4d2", TAN = "#b3894e", DARK = "#5a4630";
  c.fillStyle = BROWN;
  c.fillRect(0, 0, 256, 256);
  c.strokeStyle = "rgba(0,0,0,0.08)";
  c.lineWidth = 2;
  for (let x = 4; x < 256; x += 10) {
    c.beginPath();
    c.moveTo(x, 0);
    c.lineTo(x, 256);
    c.stroke();
  }
  const row = (y, h, fill) => {
    c.fillStyle = fill;
    c.fillRect(0, y, 256, h);
  };
  const zig = (y, amp, color, w) => {
    c.strokeStyle = color;
    c.lineWidth = w;
    c.lineJoin = "round";
    c.beginPath();
    let up = true;
    for (let x = -12; x <= 268; x += 24, up = !up) c.lineTo(x, up ? y : y + amp);
    c.stroke();
  };
  const ticks = (y, h, color, gap, w) => {
    c.fillStyle = color;
    for (let x = 6; x < 256; x += gap) c.fillRect(x, y, w, h);
  };
  row(46, 26, CREAM);
  ticks(53, 12, DARK, 22, 7);
  row(72, 40, TAN);
  zig(80, 16, DARK, 9);
  row(112, 38, CREAM);
  zig(120, 17, "#7a4a21", 10);
  row(150, 46, BROWN);
  row(196, 28, "#6b543a");
  ticks(204, 12, CREAM, 20, 8);
  row(224, 32, DARK);
}
const chulloTex = new THREE.CanvasTexture(chulloCanvas);
chulloTex.wrapS = THREE.RepeatWrapping;
chulloTex.repeat.x = 2;
chulloTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
const chulloMat = new THREE.MeshLambertMaterial({ map: chulloTex });

const flapCanvas = document.createElement("canvas");
flapCanvas.width = 128;
flapCanvas.height = 128;
{
  const c = flapCanvas.getContext("2d");
  c.fillStyle = "#8b6f47";
  c.fillRect(0, 0, 128, 128);
  c.strokeStyle = "rgba(0,0,0,0.08)";
  c.lineWidth = 2;
  for (let x = 3; x < 128; x += 10) {
    c.beginPath();
    c.moveTo(x, 0);
    c.lineTo(x, 128);
    c.stroke();
  }
  c.fillStyle = "#5a4630";
  c.fillRect(0, 96, 128, 32);
  c.fillStyle = "#ece4d2";
  for (let x = 6; x < 128; x += 20) c.fillRect(x, 102, 7, 12);
}
const flapTex = new THREE.CanvasTexture(flapCanvas);
const flapMat = new THREE.MeshLambertMaterial({ map: flapTex, side: THREE.DoubleSide });

const hat = new THREE.Group();
const dome = new THREE.Mesh(new THREE.SphereGeometry(0.7, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.58), chulloMat);
dome.position.y = 1.55;
dome.scale.y = 0.92;
dome.castShadow = true;
hat.add(dome);
const rim = new THREE.Mesh(new THREE.TorusGeometry(0.685, 0.055, 10, 30), new THREE.MeshLambertMaterial({ color: 0x5a4630 }));
rim.rotation.x = Math.PI / 2;
rim.position.y = 1.44;
hat.add(rim);
for (const sx of [-1, 1]) {
  const flap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.7, 0.8, 0.72, 14, 1, true, (sx < 0 ? Math.PI * 1.5 : Math.PI / 2) - 0.55, 1.1),
    flapMat
  );
  flap.position.y = 1.08;
  hat.add(flap);
}

const braidBeadGeo = new THREE.SphereGeometry(0.052, 8, 6);
const braidTasselGeo = new THREE.ConeGeometry(0.085, 0.2, 8);
const braidMatA = new THREE.MeshLambertMaterial({ color: 0xc9a26a });
const braidMatB = new THREE.MeshLambertMaterial({ color: 0x5a4630 });
const braidL = new THREE.Group();
const braidR = new THREE.Group();
for (const [grp, sx] of [[braidL, -1], [braidR, 1]]) {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(sx * 0.68, 0.75, 0.4),
    new THREE.Vector3(sx * 0.8, 0.4, 0.55),
    new THREE.Vector3(sx * 0.84, 0.05, 0.62),
  ]);
  for (let i = 0; i < 12; i++) {
    const bead = new THREE.Mesh(braidBeadGeo, i % 2 ? braidMatB : braidMatA);
    bead.position.copy(curve.getPoint(i / 11));
    bead.scale.setScalar(1 + Math.sin(i * 1.7) * 0.15);
    grp.add(bead);
  }
  const tassel = new THREE.Mesh(braidTasselGeo, braidMatB);
  tassel.position.set(sx * 0.85, -0.08, 0.64);
  grp.add(tassel);
}
hat.add(braidL, braidR);
bean.add(hat);

const blob = new THREE.Mesh(
  new THREE.CircleGeometry(0.65, 20),
  new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28 })
);
blob.rotation.x = -Math.PI / 2;
blob.position.y = 0.02;
player.add(blob);

bean.rotation.order = "YXZ";

/* ============================== obstacles ============================== */
const obstacleGroup = new THREE.Group();
scene.add(obstacleGroup);

const obMatCache = {};
function obMat(color) {
  if (!obMatCache[color]) obMatCache[color] = new THREE.MeshLambertMaterial({ color });
  return obMatCache[color];
}

const geos = {
  hurdle: new THREE.BoxGeometry(2.6, 0.7, 0.35),
  hurdlePost: new THREE.BoxGeometry(0.16, 1.0, 0.16),
  overhead: new THREE.BoxGeometry(2.7, 1.1, 0.5),
  block: new THREE.BoxGeometry(2.7, 2.3, 1.3),
  cone: new THREE.ConeGeometry(0.5, 1.4, 12),
  wall: new THREE.BoxGeometry(12, 0.8, 0.4),
  wallPost: new THREE.BoxGeometry(0.2, 2.3, 0.2),
};
const blockColors = [0xef476f, 0xf78c2a, 0x8338ec, 0x118ab2];

function addMesh(parent, geo, mat, x, y, z) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

const obstacles = []; // { mesh, x, y, z, hx, hy, hz }

function registerObstacle(mesh, x, y, z, hx, hy, hz) {
  obstacleGroup.add(mesh);
  obstacles.push({ mesh, x, y, z, hx, hy, hz });
}

function spawnHurdle(x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const c = blockColors[(Math.random() * blockColors.length) | 0];
  addMesh(g, geos.hurdle, obMat(0xf4f4f4), 0, 1.0, 0);
  addMesh(g, geos.hurdlePost, obMat(c), -1.2, 0.5, 0);
  addMesh(g, geos.hurdlePost, obMat(c), 1.2, 0.5, 0);
  registerObstacle(g, x, 1.0, z, 1.35, 0.45, 0.25);
}

function spawnOverhead(x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const c = blockColors[(Math.random() * blockColors.length) | 0];
  addMesh(g, geos.overhead, obMat(c), 0, 2.15, 0);
  addMesh(g, geos.wallPost, obMat(0x6c757d), -1.25, 1.15, 0);
  addMesh(g, geos.wallPost, obMat(0x6c757d), 1.25, 1.15, 0);
  registerObstacle(g, x, 2.15, z, 1.35, 0.6, 0.35);
}

function spawnBlock(x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const c = blockColors[(Math.random() * blockColors.length) | 0];
  addMesh(g, geos.block, obMat(c), 0, 1.15, 0);
  const stripe = addMesh(g, new THREE.BoxGeometry(2.8, 0.35, 1.32), obMat(0xf4f4f4), 0, 1.75, 0);
  stripe.castShadow = false;
  registerObstacle(g, x, 1.15, z, 1.35, 1.18, 0.68);
}

function spawnCone(x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  addMesh(g, geos.cone, obMat(0xf77f00), 0, 0.7, 0);
  const base = addMesh(g, new THREE.BoxGeometry(0.9, 0.12, 0.9), obMat(0xd9480f), 0, 0.06, 0);
  base.castShadow = false;
  registerObstacle(g, x, 0.65, z, 0.5, 0.68, 0.5);
}

function spawnSlideWall(z) {
  const g = new THREE.Group();
  g.position.set(0, 0, z);
  const c = blockColors[(Math.random() * blockColors.length) | 0];
  addMesh(g, geos.wall, obMat(c), 0, 2.0, 0);
  for (const x of [-5.4, 5.4]) addMesh(g, geos.wallPost, obMat(0x6c757d), x, 1.15, 0);
  registerObstacle(g, 0, 2.0, z, 4.65, 0.45, 0.3);
}

function spawnJumpWall(z) {
  const g = new THREE.Group();
  g.position.set(0, 0, z);
  const c = blockColors[(Math.random() * blockColors.length) | 0];
  addMesh(g, geos.wall, obMat(0xf4f4f4), 0, 1.05, 0);
  for (const x of [-4.5, 0, 4.5]) addMesh(g, geos.wallPost, obMat(c), x, 0.55, 0);
  registerObstacle(g, 0, 1.05, z, 4.65, 0.45, 0.3);
}

/* ============================== coins ============================== */
const coinsGroup = new THREE.Group();
scene.add(coinsGroup);

const coinGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.12, 22);
const coinRimGeo = new THREE.TorusGeometry(0.34, 0.05, 8, 22);
const coinMat = new THREE.MeshLambertMaterial({ color: 0xffd43b, emissive: 0xa06e00, emissiveIntensity: 0.55 });
const coinEdgeMat = new THREE.MeshLambertMaterial({ color: 0xd99a00 });

const coins = []; // { group, x, y, z, spin, collected, popT }

function addCoin(x, y, z) {
  const group = new THREE.Group();
  const disc = new THREE.Mesh(coinGeo, coinMat);
  disc.rotation.x = Math.PI / 2;
  disc.castShadow = true;
  const rim = new THREE.Mesh(coinRimGeo, coinEdgeMat);
  group.add(disc, rim);
  group.position.set(x, y, z);
  coinsGroup.add(group);
  coins.push({ group, x, y, z, spin: Math.random() * Math.PI, collected: false, popT: 0 });
}

function spawnCoinLine(x, z, y, count, gap) {
  const start = z + (count - 1) * gap * 0.5;
  for (let i = 0; i < count; i++) addCoin(x, y, start - i * gap);
}

function spawnCoinArc(x, z, peak) {
  const base = 1.0;
  for (const dz of [-6, -3, 0, 3, 6]) {
    addCoin(x, base + (peak - base) * (1 - (dz / 6) * (dz / 6)), z + dz);
  }
}

function spawnPattern(z = -SPAWN_AHEAD) {
  const roll = Math.random();
  if (roll < 0.14) {
    spawnSlideWall(z);
    spawnCoinLine(0, z - 8, 0.9, 5, 3.5);
    return;
  }
  if (roll < 0.28) {
    spawnJumpWall(z);
    spawnCoinArc(0, z, 2.6);
    return;
  }

  const openLane = (Math.random() * 3) | 0;
  const laneHas = [null, null, null];
  for (let lane = 0; lane < 3; lane++) {
    const x = LANES[lane];
    if (lane === openLane) {
      const r = Math.random();
      if (r < 0.3) { spawnHurdle(x, z); laneHas[lane] = "hurdle"; }
      else if (r < 0.5) { spawnCone(x, z); laneHas[lane] = "cone"; }
      continue;
    }
    const r = Math.random();
    if (r < 0.42) { spawnBlock(x, z); laneHas[lane] = "block"; }
    else if (r < 0.62) { spawnHurdle(x, z); laneHas[lane] = "hurdle"; }
    else if (r < 0.8) { spawnOverhead(x, z); laneHas[lane] = "overhead"; }
    else spawnCone(x, z);
  }

  const x = LANES[openLane];
  if (laneHas[openLane] === "hurdle" || laneHas[openLane] === "cone") spawnCoinArc(x, z, 2.5);
  else if (laneHas[openLane] === null && Math.random() < 0.5) spawnCoinLine(x, z, 1.0, 5, 3.5);

  if (Math.random() < 0.45) {
    const free = [];
    for (let l = 0; l < 3; l++) if (laneHas[l] !== "block") free.push(l);
    const l2 = free[(Math.random() * free.length) | 0];
    if (!laneHas[l2]) spawnCoinLine(LANES[l2], z + 16, 1.0, 4, 3.5);
  }
}

/* ============================== game state ============================== */
const state = {
  mode: "menu", // menu | count | play | dead
  lane: 1,
  px: 0,
  jumpY: 0,
  vy: 0,
  sliding: false,
  slideT: 0,
  speed: START_SPEED,
  distance: 0,
  coinCount: 0,
  nextSpawn: 40,
  spawnDist: 0,
  countT: 0,
  countLabel: "",
  paused: false,
  resumeMode: "play",
  deadT: 0,
  shake: 0,
  time: 0,
};

function resetGame() {
  state.lane = 1;
  state.px = 0;
  state.jumpY = 0;
  state.vy = 0;
  state.sliding = false;
  state.slideT = 0;
  state.speed = START_SPEED;
  state.distance = 0;
  state.coinCount = 0;
  state.spawnDist = 0;
  state.shake = 0;
  state.paused = false;
  state.resumeMode = "play";
  pauseEl.classList.remove("show");
  coinsEl.textContent = "0";

  for (const o of obstacles) obstacleGroup.remove(o.mesh);
  obstacles.length = 0;
  for (const c of coins) coinsGroup.remove(c.group);
  coins.length = 0;
  document.querySelectorAll(".float-score").forEach((el) => el.remove());

  // Pre-fill the runway: nearest obstacle ~3s ahead, rest spaced behind it.
  for (let d = FIRST_OBSTACLE_DIST; d < SPAWN_AHEAD; d += RUNWAY_GAP) spawnPattern(-d);
  spawnPattern(-SPAWN_AHEAD);
  state.nextSpawn = RUNWAY_GAP; // next normal spawn aligns with the fill rhythm

  player.position.set(0, 0, PLAYER_Z);
  bean.rotation.set(0, 0, 0);
  bean.scale.set(1, 1, 1);
  blob.visible = true;
  updateHud(); // don't show the previous run's score/speed during the countdown
}

function startCountdown() {
  ensureAudio();
  resetGame();
  overlayEl.classList.remove("show");
  gameoverEl.classList.remove("show");
  state.mode = "count";
  state.countT = 3.4;
  state.countLabel = "";
}

function die() {
  if (state.mode !== "play") return;
  state.mode = "dead";
  state.deadT = 0;
  state.shake = 1;
  sfx.crash();
  const score = totalScore();
  if (score > best) {
    best = score;
    localStorage.setItem("beandash_best", String(best));
    bestEl.textContent = best;
  }
  finalScoreEl.textContent = score;
  finalBestEl.textContent = best;
}

function showGameOver() {
  state.mode = "menu";
  gameoverEl.classList.add("show");
}

/* ============================== input ============================== */
function handleLane(dir) {
  if (state.mode !== "play") return;
  const next = state.lane + dir;
  if (next < 0 || next > 2) return;
  state.lane = next;
  sfx.lane();
}

function handleJump() {
  if (state.mode !== "play") return;
  if (state.jumpY <= 0.001 && state.vy <= 0) {
    state.vy = JUMP_VEL;
    state.sliding = false;
    sfx.jump();
  }
}

function handleSlide() {
  if (state.mode !== "play") return;
  if (state.jumpY > 0.001) { state.vy = Math.min(state.vy, -18); return; } // fast fall
  if (!state.sliding) {
    state.sliding = true;
    state.slideT = SLIDE_TIME;
    sfx.slide();
  }
}

window.addEventListener("keydown", (e) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "Escape"].includes(e.code)) e.preventDefault();
  if (e.repeat) return;

  if (e.code === "Escape") {
    togglePause();
    return;
  }

  if (state.paused) return;

  if (state.mode === "menu") {
    if (e.code === "Space" || e.code === "Enter" || (e.code === "KeyR" && gameoverEl.classList.contains("show"))) {
      startCountdown();
    }
    return;
  }

  switch (e.code) {
    case "KeyA": case "ArrowLeft": handleLane(-1); break;
    case "KeyD": case "ArrowRight": handleLane(1); break;
    case "KeyW": case "ArrowUp": case "Space": handleJump(); break;
    case "KeyS": case "ArrowDown": handleSlide(); break;
  }
});

function togglePause() {
  if (state.paused) {
    state.paused = false;
    state.mode = state.resumeMode;
    pauseEl.classList.remove("show");
    clock.getDelta(); // reset delta so the first resumed frame is smooth
    beep(900, 0.08, "triangle", 0.08);
  } else if (state.mode === "play" || state.mode === "count") {
    state.paused = true;
    state.resumeMode = state.mode;
    pauseEl.classList.add("show");
    beep(600, 0.08, "triangle", 0.08);
  }
}

startBtn.addEventListener("click", startCountdown);
restartBtn.addEventListener("click", startCountdown);

/* ---- touch controls: tap = jump / start / resume, swipe = lane / jump / slide ---- */
let touchStart = null;

window.addEventListener("touchstart", (e) => {
  ensureAudio();
  const t = e.changedTouches[0];
  touchStart = { x: t.clientX, y: t.clientY };
}, { passive: true });

window.addEventListener("touchend", (e) => {
  if (!touchStart) return;
  const s = touchStart;
  touchStart = null;
  if (e.target.closest("button")) return; // buttons handle their own taps
  const t = e.changedTouches[0];
  const dx = t.clientX - s.x;
  const dy = t.clientY - s.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) {
    if (state.paused) togglePause();
    else if (state.mode === "menu") startCountdown();
    else if (state.mode === "play") handleJump();
    return;
  }
  if (state.mode !== "play" || state.paused) return;
  if (Math.abs(dx) > Math.abs(dy)) handleLane(dx > 0 ? 1 : -1);
  else if (dy < 0) handleJump();
  else handleSlide();
}, { passive: true });

/* ============================== collision ============================== */
function checkCollisions() {
  const feet = state.jumpY;
  const top = state.jumpY + (state.sliding ? 0.95 : 1.8);
  for (const o of obstacles) {
    if (o.z + o.hz < -0.55 || o.z - o.hz > 0.55) continue;
    if (Math.abs(o.x - state.px) >= o.hx + 0.5) continue;
    if (top <= o.y - o.hy || feet >= o.y + o.hy) continue;
    return true;
  }
  return false;
}

/* ============================== update ============================== */
function moveWorld(dt) {
  const dz = state.speed * dt;

  for (let i = obstacles.length - 1; i >= 0; i--) {
    const o = obstacles[i];
    o.z += dz;
    o.mesh.position.z = o.z;
    if (o.z > KILL_Z) {
      obstacleGroup.remove(o.mesh);
      obstacles.splice(i, 1);
    }
  }

  for (const d of decos) {
    d.position.z += dz;
    if (d.position.z > 15) {
      d.position.z -= SPAWN_AHEAD + 10;
      const side = Math.random() < 0.5 ? -1 : 1;
      d.position.x = side * (9.5 + Math.random() * 12);
      d.scale.setScalar(0.8 + Math.random() * 0.7);
    }
  }

  for (const c of clouds) {
    c.position.z += dz * 0.25;
    if (c.position.z > 20) c.position.z -= 220;
  }

  for (let i = coins.length - 1; i >= 0; i--) {
    const c = coins[i];
    if (c.collected) continue; // pop animation owns collected coins
    c.z += dz;
    c.group.position.z = c.z;
    if (c.z > KILL_Z + 6) {
      coinsGroup.remove(c.group);
      coins.splice(i, 1);
    }
  }

  roadTex.offset.y += (state.speed * dt) / segLen;
  state.spawnDist += dz;
}

function updateCoins(dt) {
  const feet = state.jumpY;
  const top = state.jumpY + (state.sliding ? 0.95 : 1.8);

  for (let i = coins.length - 1; i >= 0; i--) {
    const c = coins[i];
    if (c.collected) {
      c.popT += dt;
      const t = Math.min(1, c.popT / 0.3);
      c.group.position.y = c.popY + t * 2.1;
      c.group.rotation.y += dt * 14;
      c.group.scale.setScalar(1 - t * 0.75);
      if (c.popT > 0.32) {
        coinsGroup.remove(c.group);
        coins.splice(i, 1);
      }
      continue;
    }

    c.spin += dt * 5;
    c.group.rotation.y = c.spin;

    if (state.mode !== "play") continue;
    if (Math.abs(c.x - state.px) > 0.95 || Math.abs(c.z) > 0.95) continue;
    if (c.y + 0.5 < feet - 0.3 || c.y - 0.5 > top + 0.3) continue;

    c.collected = true;
    c.popT = 0;
    c.popY = c.y;
    c.group.position.x = state.px;
    c.group.position.z = 0;
    state.coinCount++;
    coinsEl.textContent = state.coinCount;
    coinBoxEl.classList.remove("pulse");
    void coinBoxEl.offsetWidth;
    coinBoxEl.classList.add("pulse");
    sfx.coin();
    floatScore("+25", state.px, c.y + 0.4);
  }
}

function floatScore(text, x, y) {
  const el = document.createElement("div");
  el.className = "float-score";
  el.textContent = text;
  const v = new THREE.Vector3(x, y, 0).project(camera);
  const sx = (v.x * 0.5 + 0.5) * window.innerWidth;
  const sy = (-v.y * 0.5 + 0.5) * window.innerHeight;
  el.style.left = sx + "px";
  el.style.top = sy + "px";
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 700);
}

function spawnIfNeeded() {
  if (state.spawnDist >= state.nextSpawn) {
    spawnPattern();
    state.nextSpawn += state.speed * (0.75 + Math.random() * 0.4) + 14;
  }
}

function updatePlayer(dt) {
  state.time += dt;

  const targetX = LANES[state.lane];
  const prevPx = state.px;
  state.px += (targetX - state.px) * Math.min(1, dt * 11);
  player.position.x = state.px;

  if (state.vy !== 0 || state.jumpY > 0) {
    state.vy -= GRAVITY * dt;
    state.jumpY += state.vy * dt;
    if (state.jumpY <= 0) {
      state.jumpY = 0;
      state.vy = 0;
    }
  }
  player.position.y = state.jumpY;

  if (state.sliding) {
    state.slideT -= dt;
    if (state.slideT <= 0) state.sliding = false;
  }

  /* body animation */
  const grounded = state.jumpY <= 0.001;
  const runFreq = 11 + state.speed * 0.12;
  const t = state.time * runFreq;

  if (state.mode === "play" || state.mode === "count") {
    if (grounded && !state.sliding) {
      bean.position.y = Math.abs(Math.sin(t)) * 0.12;
      armL.rotation.x = Math.sin(t) * 1.1;
      armR.rotation.x = -Math.sin(t) * 1.1;
      bean.rotation.x = 0.12;
    } else {
      bean.position.y = 0;
      armL.rotation.x = -2.4;
      armR.rotation.x = -2.4;
      bean.rotation.x = state.jumpY > 0.001 ? -0.25 : 0.12;
    }
    braidL.rotation.x = Math.sin(t) * 0.14;
    braidR.rotation.x = Math.sin(t + 1.6) * 0.14;
    const lean = THREE.MathUtils.clamp((state.px - prevPx) * 8, -0.45, 0.45);
    bean.rotation.z = lean;
    if (state.sliding) {
      bean.rotation.x = -1.15;
      bean.scale.set(1.05, 0.55, 1.15);
    } else {
      bean.scale.set(1, 1, 1);
    }
    blob.scale.setScalar(state.jumpY > 0.001 ? Math.max(0.4, 1 - state.jumpY * 0.22) : 1);
    blob.visible = state.jumpY < 3.5;
  }

  if (state.mode === "dead") {
    state.deadT += dt;
    bean.rotation.x = Math.min(1.5, state.deadT * 7);
    bean.rotation.z = Math.sin(state.deadT * 9) * 0.4;
    bean.position.y = Math.max(0, Math.sin(state.deadT * 6) * 0.3);
  }
}

function updateCamera(dt) {
  const cx = state.px * 0.55;
  const shakeX = state.shake > 0 ? (Math.random() - 0.5) * state.shake * 0.7 : 0;
  const shakeY = state.shake > 0 ? (Math.random() - 0.5) * state.shake * 0.5 : 0;
  state.shake = Math.max(0, state.shake - dt * 2.2);

  const targetY = 4.4 - Math.min(1.2, state.jumpY * 0.35);
  const k = Math.min(1, dt * 9);
  camera.position.x += (cx + shakeX - camera.position.x) * k;
  camera.position.y += (targetY + shakeY - camera.position.y) * k;
  camera.position.z = 8.5;
  camTarget.x += (state.px * 0.6 - camTarget.x) * k;
  camTarget.y += (1.4 + state.jumpY * 0.2 - camTarget.y) * k;
  camTarget.z += (-6 - camTarget.z) * k;
  camera.lookAt(camTarget);
}

function updateCountdown(dt) {
  state.countT -= dt;
  let label = "";
  if (state.countT > 0.4) {
    label = String(Math.ceil(state.countT - 0.4));
  } else if (state.countT > 0) {
    label = "GO!";
  }
  if (label !== state.countLabel) {
    state.countLabel = label;
    countEl.textContent = label;
    countEl.classList.remove("pop");
    void countEl.offsetWidth;
    countEl.classList.add("pop");
    if (label === "GO!") sfx.go();
    else if (label !== "") sfx.tick();
  }
  if (state.countT <= 0) {
    state.mode = "play";
    state.countLabel = "";
    countEl.textContent = "";
  }
}

const COIN_VALUE = 25;

function totalScore() {
  return Math.floor(state.distance) + state.coinCount * COIN_VALUE;
}

function updateHud() {
  scoreEl.textContent = totalScore();
  speedEl.textContent = Math.round(state.speed * 3.6);
}

/* ============================== loop ============================== */
const clock = new THREE.Clock();

function stepGame(dt) {
  if (state.paused) return;

  if (state.mode === "count") {
    updateCountdown(dt);
    updatePlayer(dt);
    updateCamera(dt);
  } else if (state.mode === "play") {
    state.speed = Math.min(MAX_SPEED, state.speed + ACCEL * dt);
    state.distance += state.speed * dt;
    moveWorld(dt);
    spawnIfNeeded();
    updateCoins(dt);
    updatePlayer(dt);
    updateCamera(dt);
    updateHud();
    if (checkCollisions()) die();
  } else if (state.mode === "dead") {
    moveWorld(0);
    updateCoins(dt);
    updatePlayer(dt);
    updateCamera(dt);
    if (state.deadT > 0.9) showGameOver();
  } else {
    /* idle menu: gentle camera orbit */
    camera.position.x = Math.sin(state.time * 0.4) * 1.5;
    const k = Math.min(1, dt * 2);
    camTarget.x += (0 - camTarget.x) * k;
    camTarget.y += (1.2 - camTarget.y) * k;
    camTarget.z += (0 - camTarget.z) * k;
    camera.lookAt(camTarget);
    updatePlayer(dt); // updatePlayer already advances state.time once
  }
}

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  stepGame(dt);
  renderer.render(scene, camera);
}

/* debug / autorun hook (used by the automated smoke test) — enable by adding ?debug to the URL */
const __beandash = {
  state,
  startCountdown,
  scene,
  player,
  spawnLlama: (x, z, rotY = 0, scale = 1) => {
    const l = makeLlama(LLAMA_COLORS[(Math.random() * LLAMA_COLORS.length) | 0]);
    l.position.set(x, 0, z);
    l.rotation.y = rotY;
    l.scale.setScalar(scale);
    scene.add(l);
    return l;
  },
  decos: () => decos.map((d) => ({ x: +d.position.x.toFixed(1), z: +d.position.z.toFixed(1), kids: d.children.length })),
  hat: () => {
    let hatGroup = null;
    for (const child of player.children[0].children) if (child.isGroup && child.children.length === 6) hatGroup = child;
    let meshes = 0;
    if (hatGroup) hatGroup.traverse((o) => { if (o.isMesh) meshes++; });
    return hatGroup ? { found: true, meshes } : { found: false };
  },
  step: (dt = 1 / 60) => stepGame(dt),
  press: (code) => window.dispatchEvent(new KeyboardEvent("keydown", { code })),
  obstacles: () => obstacles.slice(),
  coins: () => coins.slice(),
  nearCoins: () => coins.filter((c) => !c.collected && c.z > -4 && c.z < 4).map((c) => ({ x: c.x, y: c.y, z: +c.z.toFixed(2) })),
};

if (new URLSearchParams(window.location.search).has("debug")) window.__beandash = __beandash;

window.addEventListener("resize", () => {
  fitCamera();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

resetGame();
tick();
