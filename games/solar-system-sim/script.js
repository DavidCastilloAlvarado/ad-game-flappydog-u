/* ============================================================
   Solar System Simulator
   - Keplerian orbital mechanics (solves Kepler's equation)
   - Halley's Comet at its true position (elements from J2000,
     perihelion 1986-02-09, next perihelion ~2061)
   - Distances compressed with r^0.55 so Halley's 35 AU aphelion
     fits on screen; orbital periods & relative motion are real.
   ============================================================ */
"use strict";

/* ---------------- helpers ---------------- */
const TAU = Math.PI * 2;
const rad = (d) => (d * Math.PI) / 180;
const norm360 = (d) => ((d % 360) + 360) % 360;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const $ = (id) => document.getElementById(id);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/* ---------------- time ---------------- */
const J2000 = Date.UTC(2000, 0, 1, 12); // epoch of the orbital elements
const TODAY = Date.now();
const daysSinceJ2000 = (ms) => (ms - J2000) / 86400000;

let simDays = daysSinceJ2000(TODAY); // simulation clock (days since J2000)
let playing = true;
let speedDaysPerSec = 30;

/* ---------------- view / camera ---------------- */
const canvas = $("scene");
const ctx = canvas.getContext("2d");
let W = 0, H = 0, DPR = 1;

const view = {
  zoom: 1,
  panX: 0,
  panY: 0,
  follow: null, // body id being followed
};

/* ---------------- distance compression ----------------
   r_display = K * r_AU^0.55  (K chosen so Earth ~120 px)     */
const K_SCALE = 120;
const scaleR = (rAU) => K_SCALE * Math.pow(rAU, 0.55);
const AU_PER_MKM = 1 / 149.6;

/* ---------------- bodies ----------------
   Elements (J2000): a [AU], e, i [deg], L0 [deg], varpi [deg], T [years]
   L0 = mean longitude, varpi = longitude of perihelion.
   (line of nodes is not modelled — orbits are tilted about the
   x-axis; display only, periods & shapes are accurate)          */
const BODIES = [
  {
    id: "sun", name: "Sun", type: "G2V star",
    color: "#ffcf5c", glow: "rgba(255,170,60,0.55)", rPx: 15,
    info: {
      "Mass": "1.989 × 10³⁰ kg", "Radius": "696,340 km",
      "Surface temp": "5,772 K", "Rotation": "~27 days (equator)",
    },
    note: "Contains 99.86 % of the mass of the solar system.",
  },
  {
    id: "mercury", name: "Mercury", type: "Terrestrial planet",
    a: 0.38710, e: 0.20563, i: 7.005, L0: 252.251, varpi: 77.457, T: 0.240846,
    color: "#b8a898", rPx: 3.4,
    info: {
      "Semi-major axis": "0.387 AU", "Eccentricity": "0.2056",
      "Inclination": "7.0°", "Orbital period": "87.97 d",
      "Radius": "2,439.7 km", "Moons": "0",
    },
    note: "The smallest planet and the closest to the Sun.",
  },
  {
    id: "venus", name: "Venus", type: "Terrestrial planet",
    a: 0.72333, e: 0.00677, i: 3.395, L0: 181.980, varpi: 131.533, T: 0.615198,
    color: "#e8c46b", rPx: 5.4,
    info: {
      "Semi-major axis": "0.723 AU", "Eccentricity": "0.0068",
      "Inclination": "3.4°", "Orbital period": "224.70 d",
      "Radius": "6,051.8 km", "Moons": "0",
    },
    note: "Rotates backwards, once every 243 Earth days.",
  },
  {
    id: "earth", name: "Earth", type: "Terrestrial planet",
    a: 1.00000, e: 0.01671, i: 0.0, L0: 100.464, varpi: 102.937, T: 1.000017,
    color: "#5b8dd9", rPx: 5.7,
    info: {
      "Semi-major axis": "1.000 AU", "Eccentricity": "0.0167",
      "Inclination": "0.0°", "Orbital period": "365.26 d",
      "Radius": "6,371 km", "Moons": "1",
    },
    note: "The only known world with life.",
  },
  {
    id: "mars", name: "Mars", type: "Terrestrial planet",
    a: 1.52368, e: 0.09340, i: 1.850, L0: 355.447, varpi: 336.042, T: 1.880848,
    color: "#d1683c", rPx: 4.4,
    info: {
      "Semi-major axis": "1.524 AU", "Eccentricity": "0.0934",
      "Inclination": "1.9°", "Orbital period": "686.98 d",
      "Radius": "3,389.5 km", "Moons": "2",
    },
    note: "Home to Olympus Mons, the largest volcano in the solar system.",
  },
  {
    id: "jupiter", name: "Jupiter", type: "Gas giant",
    a: 5.20440, e: 0.04849, i: 1.303, L0: 34.396, varpi: 14.728, T: 11.862615,
    color: "#d8a56c", rPx: 13,
    info: {
      "Semi-major axis": "5.204 AU", "Eccentricity": "0.0485",
      "Inclination": "1.3°", "Orbital period": "11.86 yr",
      "Radius": "69,911 km", "Moons": "95",
    },
    note: "More massive than all other planets combined.",
  },
  {
    id: "saturn", name: "Saturn", type: "Gas giant",
    a: 9.58260, e: 0.05551, i: 2.485, L0: 49.954, varpi: 92.599, T: 29.457122,
    color: "#e3c98a", rPx: 11, ring: true,
    info: {
      "Semi-major axis": "9.583 AU", "Eccentricity": "0.0555",
      "Inclination": "2.5°", "Orbital period": "29.46 yr",
      "Radius": "58,232 km", "Moons": "146",
    },
    note: "Its rings span ~280,000 km but are only ~10 m thick.",
  },
  {
    id: "uranus", name: "Uranus", type: "Ice giant",
    a: 19.2184, e: 0.04630, i: 0.773, L0: 313.238, varpi: 170.954, T: 84.021076,
    color: "#9fd8dd", rPx: 8.4,
    info: {
      "Semi-major axis": "19.218 AU", "Eccentricity": "0.0463",
      "Inclination": "0.8°", "Orbital period": "84.02 yr",
      "Radius": "25,362 km", "Moons": "28",
    },
    note: "Rolls around the Sun on its side (98° axial tilt).",
  },
  {
    id: "neptune", name: "Neptune", type: "Ice giant",
    a: 30.1104, e: 0.00946, i: 1.770, L0: 304.880, varpi: 44.965, T: 164.79132,
    color: "#4f74e3", rPx: 8.1,
    info: {
      "Semi-major axis": "30.110 AU", "Eccentricity": "0.0095",
      "Inclination": "1.8°", "Orbital period": "164.79 yr",
      "Radius": "24,622 km", "Moons": "16",
    },
    note: "Winds reach 2,100 km/h — the fastest in the solar system.",
  },
  {
    /* Halley's Comet — real orbital elements (J2000).
       Last perihelion: 1986-02-09. Next: ~2061-07.
       i > 90° → retrograde orbit, tilted 18° to the ecliptic. */
    id: "halley", name: "Halley's Comet", type: "Periodic comet (1P/Halley)",
    a: 17.834, e: 0.96714, i: 162.262, L0: 177.730, varpi: 111.331, T: 75.32,
    color: "#7dffd4", rPx: 4.6, comet: true,
    info: {
      "Semi-major axis": "17.83 AU", "Eccentricity": "0.9671",
      "Inclination": "162.3° (retrograde)", "Orbital period": "75.3 yr",
      "Perihelion": "0.586 AU", "Aphelion": "35.08 AU",
    },
    note: "Last perihelion 9 Feb 1986 · next perihelion ~July 2061. Its position here is computed from real orbital elements, so it is where the comet actually is right now — far out near aphelion, beyond Neptune.",
  },
];

const byId = Object.fromEntries(BODIES.map((b) => [b.id, b]));

/* ---------------- orbital mechanics ---------------- */
function keplerSolve(M, e) {
  // Newton–Raphson; converges fast even for e = 0.967
  let E = e < 0.8 ? M : Math.PI;
  for (let k = 0; k < 20; k++) {
    const f = E - e * Math.sin(E) - M;
    const dE = f / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-10) break;
  }
  return E;
}

/** Heliocentric position [AU] at simDays (days since J2000). */
function helioPos(body, days) {
  const tYears = days / 365.25;
  const M = norm360(body.L0 + (360 * tYears) / body.T - body.varpi);
  const E = keplerSolve(rad(M), body.e);
  const xv = body.a * (Math.cos(E) - body.e);
  const yv = body.a * Math.sqrt(1 - body.e * body.e) * Math.sin(E);
  const w = rad(body.varpi);
  const x1 = xv * Math.cos(w) - yv * Math.sin(w);
  const y1 = xv * Math.sin(w) + yv * Math.cos(w);
  const i = rad(body.i);
  return {
    x: x1,
    y: y1 * Math.cos(i),
    z: y1 * Math.sin(i),
    r: Math.hypot(x1, y1 * Math.cos(i), y1 * Math.sin(i)),
  };
}

/** Screen-space position (px) of a body. */
function screenPos(body, pos) {
  const s = scaleR(pos.r) * view.zoom;
  const ang = Math.atan2(pos.y, pos.x);
  return {
    x: W / 2 + view.panX + s * Math.cos(ang),
    y: H / 2 + view.panY + s * Math.sin(ang),
    depth: pos.z,
  };
}

/* ---------------- precomputed orbit paths (screen units @ zoom 1) ---------------- */
function buildOrbitPath(body, n = 360) {
  const pts = [];
  for (let k = 0; k <= n; k++) {
    const E = (k / n) * TAU;
    const xv = body.a * (Math.cos(E) - body.e);
    const yv = body.a * Math.sqrt(1 - body.e * body.e) * Math.sin(E);
    const w = rad(body.varpi);
    const x1 = xv * Math.cos(w) - yv * Math.sin(w);
    const y1 = xv * Math.sin(w) + yv * Math.cos(w);
    const i = rad(body.i);
    const r = Math.hypot(x1, y1 * Math.cos(i));
    const s = scaleR(r);
    pts.push([s * Math.cos(Math.atan2(y1 * Math.cos(i), x1)), s * Math.sin(Math.atan2(y1 * Math.cos(i), x1))]);
  }
  return pts;
}
BODIES.forEach((b) => { if (b.a) b.path = buildOrbitPath(b); });

/* ---------------- stars ---------------- */
let stars = [];
function makeStars() {
  stars = [];
  const n = Math.floor((W * H) / 3800);
  for (let k = 0; k < n; k++) {
    const big = Math.random() < 0.06;
    stars.push({
      x: Math.random() * W,
      y: Math.random() * H,
      r: big ? 1.1 + Math.random() * 0.9 : 0.3 + Math.random() * 0.7,
      a: 0.25 + Math.random() * 0.65,
      tw: Math.random() * TAU,
      sp: 0.4 + Math.random() * 1.4,
      hue: Math.random() < 0.12 ? (Math.random() < 0.5 ? "180,210,255" : "255,220,190") : "255,255,255",
    });
  }
}

/* ---------------- trails ---------------- */
const TRAIL_LEN = 900; // frames
const TRAIL_STEP = 2;   // record every N frames
let frameCount = 0;
const trails = {}; // id -> [{x,y} in world px @ zoom 1]

function trailPoint(body) {
  const pos = helioPos(body, simDays);
  const s = scaleR(pos.r);
  const ang = Math.atan2(pos.y, pos.x);
  return [s * Math.cos(ang), s * Math.sin(ang)];
}

function recordTrails() {
  if (frameCount % TRAIL_STEP !== 0) return;
  for (const b of BODIES) {
    if (!b.a) continue;
    if (!trails[b.id]) trails[b.id] = [];
    const t = trails[b.id];
    t.push(trailPoint(b));
    if (t.length > TRAIL_LEN) t.shift();
  }
}

/* ---------------- camera ---------------- */
function followBody() {
  if (!view.follow) return;
  const b = byId[view.follow];
  const pos = b.a ? helioPos(b, simDays) : { x: 0, y: 0, z: 0, r: 0 };
  const s = scaleR(pos.r) * view.zoom;
  const ang = Math.atan2(pos.y, pos.x);
  view.panX = -s * Math.cos(ang);
  view.panY = -s * Math.sin(ang);
}

function resetView() {
  view.follow = null;
  view.zoom = 1;
  view.panX = 0;
  view.panY = 0;
  for (const id in trails) trails[id] = [];
  syncZoomSlider();
  refreshListActive();
}

/* ---------------- rendering ---------------- */
function drawStars(t) {
  ctx.save();
  for (const s of stars) {
    const a = s.a * (0.75 + 0.25 * Math.sin(t * 0.001 * s.sp + s.tw));
    ctx.globalAlpha = a;
    ctx.fillStyle = `rgb(${s.hue})`;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function drawOrbit(body) {
  const pts = body.path;
  ctx.beginPath();
  for (let k = 0; k < pts.length; k++) {
    const x = W / 2 + view.panX + pts[k][0] * view.zoom;
    const y = H / 2 + view.panY + pts[k][1] * view.zoom;
    k === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.strokeStyle = body.comet
    ? "rgba(125,255,212,0.4)"
    : "rgba(140,170,255,0.16)";
  ctx.lineWidth = body.comet ? 1.4 : 1;
  if (body.comet) {
    ctx.setLineDash([6, 5]);
    ctx.shadowColor = "rgba(125,255,212,0.5)";
    ctx.shadowBlur = 6;
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.shadowBlur = 0;
}

function drawTrail(body) {
  const t = trails[body.id];
  if (!t || t.length < 2) return;
  ctx.beginPath();
  for (let k = 0; k < t.length; k++) {
    const x = W / 2 + view.panX + t[k][0] * view.zoom;
    const y = H / 2 + view.panY + t[k][1] * view.zoom;
    k === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.strokeStyle = body.comet ? "rgba(125,255,212,0.5)" : "rgba(255,255,255,0.14)";
  ctx.lineWidth = body.comet ? 1.6 : 1;
  ctx.stroke();
}

function drawSun(p, t) {
  const pulse = 1 + 0.05 * Math.sin(t * 0.002);
  const R = byId.sun.rPx * view.zoom * pulse;
  const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, R * 5);
  g.addColorStop(0, "rgba(255,200,90,0.5)");
  g.addColorStop(0.35, "rgba(255,150,50,0.16)");
  g.addColorStop(1, "rgba(255,120,30,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(p.x, p.y, R * 5, 0, TAU);
  ctx.fill();

  const core = ctx.createRadialGradient(p.x - R * 0.25, p.y - R * 0.25, R * 0.1, p.x, p.y, R);
  core.addColorStop(0, "#fff8e0");
  core.addColorStop(0.55, "#ffd257");
  core.addColorStop(1, "#ff8a1e");
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(p.x, p.y, R, 0, TAU);
  ctx.fill();
}

function drawPlanet(body, p, t) {
  const R = Math.max(2, body.rPx * Math.pow(view.zoom, 0.85));

  if (body.comet) {
    // glowing head + tail pointing away from the Sun
    const sunAng = Math.atan2(H / 2 + view.panY - p.y, W / 2 + view.panX - p.x);
    const tailLen = R * (5 + 2 * Math.sin(t * 0.0012));
    const tx = p.x + Math.cos(sunAng) * tailLen;
    const ty = p.y + Math.sin(sunAng) * tailLen;
    const grad = ctx.createLinearGradient(p.x, p.y, tx, ty);
    grad.addColorStop(0, "rgba(125,255,212,0.55)");
    grad.addColorStop(1, "rgba(125,255,212,0)");
    ctx.strokeStyle = grad;
    ctx.lineWidth = R * 1.1;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    // faint secondary tail (dust)
    const perp = sunAng + 0.35;
    const tx2 = p.x + Math.cos(perp) * tailLen * 0.7;
    const ty2 = p.y + Math.sin(perp) * tailLen * 0.7;
    const grad2 = ctx.createLinearGradient(p.x, p.y, tx2, ty2);
    grad2.addColorStop(0, "rgba(255,240,200,0.3)");
    grad2.addColorStop(1, "rgba(255,240,200,0)");
    ctx.strokeStyle = grad2;
    ctx.lineWidth = R * 0.6;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(tx2, ty2);
    ctx.stroke();

    const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, R * 3.2);
    glow.addColorStop(0, "rgba(190,255,235,0.9)");
    glow.addColorStop(0.4, "rgba(125,255,212,0.35)");
    glow.addColorStop(1, "rgba(125,255,212,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(p.x, p.y, R * 3.2, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#eafff7";
    ctx.beginPath();
    ctx.arc(p.x, p.y, R * 0.75, 0, TAU);
    ctx.fill();
    return;
  }

  if (body.ring) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(-0.45);
    ctx.scale(1, 0.32);
    ctx.strokeStyle = "rgba(222,200,150,0.55)";
    ctx.lineWidth = R * 0.55;
    ctx.beginPath();
    ctx.arc(0, 0, R * 1.9, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = "rgba(180,160,120,0.3)";
    ctx.lineWidth = R * 0.2;
    ctx.beginPath();
    ctx.arc(0, 0, R * 2.35, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  const g = ctx.createRadialGradient(p.x - R * 0.35, p.y - R * 0.35, R * 0.15, p.x, p.y, R);
  g.addColorStop(0, lighten(body.color, 0.45));
  g.addColorStop(0.7, body.color);
  g.addColorStop(1, darken(body.color, 0.55));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(p.x, p.y, R, 0, TAU);
  ctx.fill();
}

function lighten(hex, f) { return mix(hex, "#ffffff", f); }
function darken(hex, f) { return mix(hex, "#000000", f); }
function mix(h1, h2, f) {
  const a = parseInt(h1.slice(1), 16), b = parseInt(h2.slice(1), 16);
  const c = (sh) => Math.round(((a >> sh) & 255) * (1 - f) + ((b >> sh) & 255) * f);
  return `rgb(${c(16)},${c(8)},${c(0)})`;
}

function drawLabel(body, p) {
  const R = body.id === "sun" ? 15 * view.zoom : Math.max(2, body.rPx * Math.pow(view.zoom, 0.85));
  ctx.font = "11px 'Segoe UI', system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = body.comet ? "rgba(125,255,212,0.95)" : "rgba(223,231,255,0.85)";
  ctx.fillText(body.name, p.x, p.y - R - 8);
}

/* ---------------- main draw ---------------- */
function draw(t) {
  ctx.clearRect(0, 0, W, H);

  // deep-space background
  const bg = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.75);
  bg.addColorStop(0, "#0a0f22");
  bg.addColorStop(1, "#04060f");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  if (ui.stars) drawStars(t);

  // orbits + trails
  for (const b of BODIES) {
    if (!b.a) continue;
    if (ui.orbits) drawOrbit(b);
    if (ui.trails) drawTrail(b);
  }

  // bodies sorted by depth (z) so the tilted comet orbit overlaps correctly
  const placed = BODIES.map((b) => {
    const pos = b.a ? helioPos(b, simDays) : { x: 0, y: 0, z: 0, r: 0 };
    return { b, pos, p: screenPos(b, pos) };
  }).sort((m, n) => m.pos.z - n.pos.z);

  for (const { b, p } of placed) {
    if (b.id === "sun") drawSun(p, t);
    else drawPlanet(b, p, t);
    if (ui.labels) drawLabel(b, p);
  }

  // focus reticle
  if (view.follow) {
    const b = byId[view.follow];
    const pos = b.a ? helioPos(b, simDays) : { x: 0, y: 0, z: 0, r: 0 };
    const p = screenPos(b, pos);
    ctx.strokeStyle = "rgba(110,168,255,0.5)";
    ctx.lineWidth = 1;
    const rr = Math.max(14, b.rPx * view.zoom + 8);
    ctx.beginPath();
    ctx.arc(p.x, p.y, rr, 0, TAU);
    ctx.stroke();
  }
}

/* ---------------- UI state ---------------- */
const ui = { orbits: true, labels: true, trails: true, stars: true };

/* ---------------- clock display ---------------- */
function fmtDate(days) {
  const d = new Date(J2000 + days * 86400000);
  return `${String(d.getUTCDate()).padStart(2, "0")} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
function yearsSinceJ2000(days) {
  return (days / 365.25).toFixed(2);
}

function updateClock() {
  $("simDate").textContent = fmtDate(simDays);
  const yr = yearsSinceJ2000(simDays);
  $("simDateSub").textContent =
    (simDays >= 0 ? "+" : "") + yr + " yr from J2000 · " +
    (playing ? "▶" : "⏸") + " " + fmtSpeed();
}

function fmtSpeed() {
  const s = speedDaysPerSec;
  if (s === 0) return "paused";
  if (s < 30) return s.toFixed(1) + " days/s";
  if (s < 365) return Math.round(s) + " days/s";
  return (s / 365.25).toFixed(1) + " yr/s";
}

/* ---------------- body list ---------------- */
function buildList() {
  const list = $("bodyList");
  list.innerHTML = "";
  for (const b of BODIES) {
    const el = document.createElement("div");
    el.className = "body-item" + (b.comet ? " comet" : "");
    el.dataset.id = b.id;
    el.innerHTML =
      `<span class="swatch" style="background:${b.color};color:${b.color}"></span>` +
      `<span class="b-name">${b.name}</span>` +
      `<span class="b-dist" data-dist>—</span>`;
    el.addEventListener("click", () => focusBody(b.id));
    list.appendChild(el);
  }
}

function refreshListActive() {
  document.querySelectorAll(".body-item").forEach((el) => {
    el.classList.toggle("active", el.dataset.id === view.follow);
  });
}

function updateDistances() {
  document.querySelectorAll(".body-item").forEach((el) => {
    const b = byId[el.dataset.id];
    const distEl = el.querySelector("[data-dist]");
    if (!b.a) { distEl.textContent = "—"; return; }
    const r = helioPos(b, simDays).r;
    distEl.textContent = r.toFixed(2) + " AU";
  });
}

/* ---------------- info card ---------------- */
function showInfo(id) {
  const b = byId[id];
  $("infoName").textContent = b.name;
  $("infoType").textContent = b.type;
  const sw = $("infoSwatch");
  sw.style.background = b.color;
  sw.style.color = b.color;

  const grid = $("infoGrid");
  grid.innerHTML = "";
  const rows = Object.entries(b.info);
  if (b.a) {
    const r = helioPos(b, simDays).r;
    rows.unshift(["Distance from Sun", r.toFixed(3) + " AU"]);
  }
  for (const [k, v] of rows) {
    const dt = document.createElement("dt");
    dt.textContent = k;
    const dd = document.createElement("dd");
    dd.textContent = v;
    grid.appendChild(dt);
    grid.appendChild(dd);
  }
  $("infoNote").textContent = b.note || "";
  $("infoCard").classList.remove("hidden");
}
function hideInfo() { $("infoCard").classList.add("hidden"); }

/* ---------------- focus / picking ---------------- */
function focusBody(id) {
  view.follow = id;
  view.zoom = clamp(id === "sun" ? 1.4 : 2.2, 0.2, 8);
  syncZoomSlider();
  showInfo(id);
  refreshListActive();
}

function pickBody(mx, my) {
  let best = null, bestD = 1e9;
  for (const b of BODIES) {
    const pos = b.a ? helioPos(b, simDays) : { x: 0, y: 0, z: 0, r: 0 };
    const p = screenPos(b, pos);
    const R = b.id === "sun" ? 15 * view.zoom : Math.max(4, b.rPx * Math.pow(view.zoom, 0.85));
    const d = Math.hypot(mx - p.x, my - p.y);
    if (d < Math.max(R + 6, 12) && d < bestD) { best = b; bestD = d; }
  }
  return best;
}

/* ---------------- input ---------------- */
let dragging = false, dragMoved = false, lastX = 0, lastY = 0;

canvas.addEventListener("pointerdown", (e) => {
  dragging = true;
  dragMoved = false;
  lastX = e.clientX; lastY = e.clientY;
  canvas.classList.add("dragging");
  try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* synthetic events */ }
});
canvas.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastX, dy = e.clientY - lastY;
  if (Math.abs(dx) + Math.abs(dy) > 3) dragMoved = true;
  view.panX += dx;
  view.panY += dy;
  lastX = e.clientX; lastY = e.clientY;
  if (dragMoved) view.follow = null; // manual pan breaks follow
  refreshListActive();
});
canvas.addEventListener("pointerup", (e) => {
  dragging = false;
  canvas.classList.remove("dragging");
  if (!dragMoved) {
    const b = pickBody(e.clientX, e.clientY);
    if (b) focusBody(b.id);
  }
});
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  const factor = Math.exp(-e.deltaY * 0.0012);
  const nz = clamp(view.zoom * factor, 0.2, 8);
  // zoom toward cursor
  const mx = e.clientX - W / 2 - view.panX;
  const my = e.clientY - H / 2 - view.panY;
  view.panX += mx * (1 - nz / view.zoom);
  view.panY += my * (1 - nz / view.zoom);
  view.zoom = nz;
  view.follow = null;
  syncZoomSlider();
  refreshListActive();
}, { passive: false });

window.addEventListener("keydown", (e) => {
  if (e.code === "Space") { e.preventDefault(); togglePlay(); }
  if (e.key === "t" || e.key === "T") gotoToday();
  if (e.key === "r" || e.key === "R") resetView();
  if (e.key === "Escape") { view.follow = null; hideInfo(); refreshListActive(); }
});

/* ---------------- controls wiring ---------------- */
function togglePlay() {
  playing = !playing;
  $("btnPlay").textContent = playing ? "⏸ Pause" : "▶ Play";
  updateClock();
}
function gotoToday() {
  simDays = daysSinceJ2000(TODAY);
  for (const id in trails) trails[id] = [];
  updateClock();
}
function syncZoomSlider() {
  $("zoom").value = Math.round(((Math.log(view.zoom) - Math.log(0.2)) / (Math.log(8) - Math.log(0.2))) * 1000);
  $("zoomVal").textContent = view.zoom.toFixed(2) + "×";
}

$("btnPlay").addEventListener("click", togglePlay);
$("btnToday").addEventListener("click", gotoToday);
$("btnReset").addEventListener("click", resetView);
$("infoClose").addEventListener("click", () => { view.follow = null; hideInfo(); refreshListActive(); });

$("speed").addEventListener("input", (e) => {
  const v = +e.target.value;
  speedDaysPerSec = Math.pow(10, v / 1000 * 3 - 1); // 0.1 → 1000 days/s (log)
  $("speedVal").textContent = fmtSpeed();
  updateClock();
});
document.querySelectorAll("[data-speed]").forEach((btn) => {
  btn.addEventListener("click", () => {
    speedDaysPerSec = +btn.dataset.speed;
    const v = Math.round((Math.log10(speedDaysPerSec) + 1) / 3 * 1000);
    $("speed").value = clamp(v, 0, 1000);
    $("speedVal").textContent = fmtSpeed();
    updateClock();
  });
});
$("zoom").addEventListener("input", (e) => {
  const t = +e.target.value / 1000;
  view.zoom = 0.2 * Math.pow(8 / 0.2, t);
  view.follow = null;
  $("zoomVal").textContent = view.zoom.toFixed(2) + "×";
  refreshListActive();
});
$("tglOrbits").addEventListener("change", (e) => { ui.orbits = e.target.checked; });
$("tglLabels").addEventListener("change", (e) => { ui.labels = e.target.checked; });
$("tglTrails").addEventListener("change", (e) => {
  ui.trails = e.target.checked;
  if (!ui.trails) for (const id in trails) trails[id] = [];
});
$("tglStars").addEventListener("change", (e) => { ui.stars = e.target.checked; });

/* ---------------- resize ---------------- */
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  canvas.style.width = W + "px";
  canvas.style.height = H + "px";
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  makeStars();
}
window.addEventListener("resize", resize);

/* ---------------- main loop ---------------- */
let lastT = performance.now();
function loop(t) {
  const dt = Math.min((t - lastT) / 1000, 0.1);
  lastT = t;

  if (playing) {
    simDays += speedDaysPerSec * dt;
    frameCount++;
    recordTrails();
  }
  followBody();
  draw(t);
  updateClock();
  updateDistances();

  requestAnimationFrame(loop);
}

/* ---------------- init ---------------- */
resize();
buildList();
syncZoomSlider();
// start with Halley's Comet highlighted so its real position is visible
showInfo("halley");
requestAnimationFrame(loop);

/* ---------------- control panel toggle (mobile) ---------------- */
(function () {
  const btn = document.getElementById("panelToggle");
  const panel = document.getElementById("panel");
  if (!btn || !panel) return;
  btn.addEventListener("click", () => {
    panel.classList.toggle("collapsed");
    btn.textContent = panel.classList.contains("collapsed") ? "☰" : "✕";
    btn.setAttribute("aria-label", panel.classList.contains("collapsed") ? "Show controls" : "Hide controls");
  });
})();
