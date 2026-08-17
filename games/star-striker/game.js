/* ============================================================
   STAR STRIKER — a classic 80s arcade space shooter
   HTML + CSS + Canvas JS, no dependencies.
   ============================================================ */

"use strict";

/* ---------------- canvas ---------------- */

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const W = canvas.width;   // 480
const H = canvas.height;  // 640

/* ---------------- sprites (pixel art) ---------------- */
/* each sprite = array of strings; each char is a color key, "." = empty */

const SPRITES = {
  player: {
    rows: [
      "....C....",
      "....C....",
      "..CCWCC..",
      ".CWWWWWC.",
      "CWWCWWCWC",
      "CWWCWWCWC",
      ".CC.CC.CC",
    ],
    colors: { C: "#35f0ff", W: "#ffffff" },
  },
  bug: {
    rows: [
      ".RRR.",
      "RWRWR",
      "RRRRR",
      "R.R.R",
    ],
    colors: { R: "#ff4d4d", W: "#ffffff" },
  },
  saucer: {
    rows: [
      "..GGG..",
      ".GGGGG.",
      "GGWGGWG",
      ".G.G.G.",
    ],
    colors: { G: "#4dff6e", W: "#ffffff" },
  },
  fighter: {
    rows: [
      "M.M.M.M",
      ".MMMMM.",
      "MMWMMWM",
      ".MMMMM.",
      "..M.M..",
    ],
    colors: { M: "#ff3df0", W: "#ffffff" },
  },
  boss: {
    rows: [
      "....YYYYY....",
      "..YYYYYYYYY..",
      ".YYWYYYYYWYY.",
      "YYYYYYYYYYYYY",
      "YY.YYYYYYY.YY",
      "..YY.YYY.YY..",
      "....Y.Y.Y....",
    ],
    colors: { Y: "#ffe23d", W: "#ffffff" },
  },
};

/* pre-render each sprite to an offscreen canvas for speed */
const SPRITE_SCALE = 3;
const spriteCache = {};

for (const name in SPRITES) {
  const s = SPRITES[name];
  const h = s.rows.length;
  const w = s.rows[0].length;
  const c = document.createElement("canvas");
  c.width = w * SPRITE_SCALE;
  c.height = h * SPRITE_SCALE;
  const g = c.getContext("2d");
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = s.rows[y][x];
      if (ch === ".") continue;
      g.fillStyle = s.colors[ch];
      g.fillRect(x * SPRITE_SCALE, y * SPRITE_SCALE, SPRITE_SCALE, SPRITE_SCALE);
    }
  }
  spriteCache[name] = { img: c, w: w * SPRITE_SCALE, h: h * SPRITE_SCALE };
}

function drawSprite(name, cx, cy, scale = 1, alpha = 1) {
  const s = spriteCache[name];
  const dw = s.w * scale;
  const dh = s.h * scale;
  ctx.globalAlpha = alpha;
  ctx.drawImage(s.img, cx - dw / 2, cy - dh / 2, dw, dh);
  ctx.globalAlpha = 1;
}

/* ---------------- audio (tiny chiptune synth) ---------------- */

let audioCtx = null;

function initAudio() {
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      audioCtx = null;
    }
  }
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
}

function beep({ type = "square", freq = 440, end = freq, dur = 0.1, vol = 0.15, delay = 0 }) {
  if (!audioCtx) return;
  const t0 = audioCtx.currentTime + delay;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, end), t0 + dur);
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noiseBurst({ dur = 0.3, vol = 0.25, delay = 0 }) {
  if (!audioCtx) return;
  const t0 = audioCtx.currentTime + delay;
  const len = Math.floor(audioCtx.sampleRate * dur);
  const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  const filter = audioCtx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(1200, t0);
  src.connect(filter).connect(gain).connect(audioCtx.destination);
  src.start(t0);
}

const sfx = {
  shoot: () => beep({ type: "square", freq: 880, end: 220, dur: 0.09, vol: 0.08 }),
  enemyShoot: () => beep({ type: "sawtooth", freq: 300, end: 120, dur: 0.12, vol: 0.05 }),
  explosion: () => {
    noiseBurst({ dur: 0.35, vol: 0.3 });
    beep({ type: "triangle", freq: 160, end: 40, dur: 0.3, vol: 0.2 });
  },
  bigExplosion: () => {
    noiseBurst({ dur: 0.7, vol: 0.4 });
    beep({ type: "triangle", freq: 120, end: 30, dur: 0.6, vol: 0.3 });
  },
  hit: () => {
    noiseBurst({ dur: 0.5, vol: 0.4 });
    beep({ type: "sawtooth", freq: 200, end: 30, dur: 0.5, vol: 0.3 });
  },
  powerup: () => {
    beep({ type: "square", freq: 520, dur: 0.07, vol: 0.12 });
    beep({ type: "square", freq: 780, dur: 0.07, vol: 0.12, delay: 0.08 });
    beep({ type: "square", freq: 1040, dur: 0.1, vol: 0.12, delay: 0.16 });
  },
  wave: () => {
    beep({ type: "square", freq: 392, dur: 0.1, vol: 0.12 });
    beep({ type: "square", freq: 523, dur: 0.1, vol: 0.12, delay: 0.12 });
    beep({ type: "square", freq: 659, dur: 0.16, vol: 0.12, delay: 0.24 });
  },
  gameover: () => {
    [440, 349, 293, 220].forEach((f, i) =>
      beep({ type: "triangle", freq: f, dur: 0.25, vol: 0.18, delay: i * 0.22 })
    );
  },
};

/* ---------------- input ---------------- */

const keys = {};

window.addEventListener("keydown", (e) => {
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(e.code)) {
    e.preventDefault();
  }
  keys[e.code] = true;
  initAudio();
  if (e.code === "KeyP" && (state === "playing" || state === "paused")) togglePause();
  if ((e.code === "Space" || e.code === "Enter") && (state === "menu" || state === "gameover")) {
    startGame();
  }
});

window.addEventListener("keyup", (e) => {
  keys[e.code] = false;
});

/* ---------------- helpers ---------------- */

const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[randInt(0, arr.length - 1)];

function circlesOverlap(ax, ay, ar, bx, by, br) {
  const dx = ax - bx;
  const dy = ay - by;
  const rr = ar + br;
  return dx * dx + dy * dy < rr * rr;
}

/* ---------------- starfield ---------------- */

const stars = [];
function initStars() {
  stars.length = 0;
  for (let i = 0; i < 90; i++) {
    const layer = randInt(0, 2);
    stars.push({
      x: rand(0, W),
      y: rand(0, H),
      speed: [18, 45, 90][layer],
      size: [1, 1, 2][layer],
      color: ["#3a4a7a", "#8a97c9", "#ffffff"][layer],
    });
  }
}

function updateStars(dt) {
  for (const s of stars) {
    s.y += s.speed * dt;
    if (s.y > H) {
      s.y = -2;
      s.x = rand(0, W);
    }
  }
}

function drawStars() {
  for (const s of stars) {
    ctx.fillStyle = s.color;
    ctx.fillRect(s.x | 0, s.y | 0, s.size, s.size);
  }
}

/* ---------------- game state ---------------- */

let state = "menu"; // menu | playing | paused | dying | gameover
let score = 0;
let highScore = Number(localStorage.getItem("starstriker.high") || 0);
let lives = 3;
let wave = 0;
let stateTimer = 0;

const player = {
  x: W / 2,
  y: H - 70,
  r: 10, // hitbox radius
  speed: 300,
  fireCooldown: 0,
  invuln: 0,
  rapid: 0, // rapid-fire timer
  double: false,
  shield: 0,
  alive: true,
};

let bullets = [];        // player bullets
let enemyBullets = [];   // enemy bullets
let enemies = [];        // enemy ships
let particles = [];
let powerups = [];
let floatTexts = [];

/* formation bookkeeping */
let formation = null; // { x, y, dir, stepTimer, stepInterval, drop, cols, spacingX, spacingY, fireTimer }

const ENEMY_POINTS = { bug: 50, saucer: 100, fighter: 150, boss: 500 };
const ENEMY_RADIUS = { bug: 12, saucer: 14, fighter: 14, boss: 26 };

/* ---------------- waves ---------------- */

function waveLayout(w) {
  /* returns array of rows; each row = array of type names */
  const layouts = [
    // wave 1: easy bugs
    [
      ["bug", "bug", "bug", "bug", "bug"],
      ["bug", "bug", "bug", "bug", "bug"],
      ["bug", "bug", "bug", "bug", "bug"],
    ],
    // wave 2: bugs + saucers
    [
      ["saucer", "bug", "bug", "bug", "saucer"],
      ["bug", "bug", "saucer", "bug", "bug"],
      ["bug", "saucer", "bug", "saucer", "bug"],
      ["bug", "bug", "bug", "bug", "bug"],
    ],
    // wave 3: fighters join
    [
      ["fighter", "bug", "bug", "bug", "fighter"],
      ["bug", "saucer", "bug", "saucer", "bug"],
      ["bug", "bug", "fighter", "bug", "bug"],
      ["saucer", "bug", "bug", "bug", "saucer"],
    ],
    // wave 4: mixed
    [
      ["fighter", "fighter", "bug", "fighter", "fighter"],
      ["bug", "saucer", "saucer", "saucer", "bug"],
      ["saucer", "bug", "fighter", "bug", "saucer"],
      ["bug", "bug", "saucer", "bug", "bug"],
    ],
  ];
  if (w <= layouts.length) return layouts[w - 1];
  // beyond: scale up difficulty procedurally
  const rows = [];
  const rowCount = Math.min(4 + Math.floor((w - layouts.length) / 2), 6);
  for (let r = 0; r < rowCount; r++) {
    const row = [];
    for (let c = 0; c < 5; c++) {
      const roll = Math.random();
      row.push(roll < 0.4 ? "bug" : roll < 0.7 ? "saucer" : "fighter");
    }
    rows.push(row);
  }
  return rows;
}

function spawnWave(n) {
  const layout = waveLayout(n);
  const cols = layout[0].length;
  const spacingX = 62;
  const spacingY = 46;
  const totalW = (cols - 1) * spacingX;
  const startX = W / 2 - totalW / 2;

  enemies = [];
  for (let r = 0; r < layout.length; r++) {
    for (let c = 0; c < layout[r].length; c++) {
      enemies.push({
        type: layout[r][c],
        col: c,
        row: r,
        x: startX + c * spacingX,
        y: 70 + r * spacingY,
        state: "formation", // formation | dive
        diveT: 0,
        diveBaseX: 0,
        diveSpeed: 0,
        flash: 0,
      });
    }
  }

  formation = {
    x: startX,
    y: 70,
    dir: 1,
    stepTimer: 0,
    stepInterval: Math.max(0.18, 0.55 - (n - 1) * 0.04),
    drop: 12,
    cols,
    spacingX,
    spacingY,
    fireTimer: rand(1, 2.5),
  };

  // boss every 5th wave, added on top of the grid
  if (n % 5 === 0) {
    enemies.push({
      type: "boss",
      col: -1,
      row: -1,
      x: W / 2,
      y: 40,
      state: "dive", // boss flies its own path
      diveT: 0,
      diveBaseX: W / 2,
      diveSpeed: 0,
      flash: 0,
      boss: true,
      hp: 20 + wave * 2,
    });
  }
}

/* ---------------- shooting ---------------- */

function playerShoot() {
  const cd = player.rapid > 0 ? 0.11 : 0.28;
  if (player.fireCooldown > 0) return;
  player.fireCooldown = cd;
  sfx.shoot();

  const bx = player.x;
  const by = player.y - 18;
  bullets.push({ x: bx, y: by, vy: -560, r: 3 });
  if (player.double) {
    bullets.push({ x: bx - 12, y: by + 6, vy: -560, r: 3 });
    bullets.push({ x: bx + 12, y: by + 6, vy: -560, r: 3 });
  }
  if (bullets.length > 12) bullets.splice(0, bullets.length - 12);
}

function enemyShoot(e) {
  const speed = 190 + wave * 12;
  enemyBullets.push({ x: e.x, y: e.y + 12, vy: speed, r: 3 });
  sfx.enemyShoot();
}

/* ---------------- particles & text ---------------- */

function explode(x, y, color, count = 18, power = 1) {
  for (let i = 0; i < count; i++) {
    const a = rand(0, Math.PI * 2);
    const sp = rand(40, 220) * power;
    particles.push({
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: rand(0.3, 0.7),
      maxLife: 0.7,
      color: Math.random() < 0.3 ? "#ffffff" : color,
      size: rand(2, 4),
    });
  }
}

function addFloatText(x, y, text, color) {
  floatTexts.push({ x, y, text, color, life: 0.9 });
}

/* ---------------- powerups ---------------- */

function maybeDropPowerup(x, y) {
  if (Math.random() > 0.09) return;
  const kind = pick(["rapid", "double", "shield"]);
  powerups.push({ x, y, vy: 90, kind, t: 0 });
}

function applyPowerup(kind) {
  sfx.powerup();
  if (kind === "rapid") {
    player.rapid = 5;
    addFloatText(player.x, player.y - 30, "RAPID FIRE", "#ffe23d");
  } else if (kind === "double") {
    player.double = true;
    addFloatText(player.x, player.y - 30, "DOUBLE SHOT", "#35f0ff");
  } else {
    player.shield = 3;
    addFloatText(player.x, player.y - 30, "SHIELD", "#4dff6e");
  }
}

/* ---------------- damage ---------------- */

function killEnemy(e, idx) {
  const pts = ENEMY_POINTS[e.type];
  score += pts;
  if (score > highScore) {
    highScore = score;
    localStorage.setItem("starstriker.high", String(highScore));
  }
  const color = SPRITES[e.type].colors[Object.keys(SPRITES[e.type].colors)[0]];
  explode(e.x, e.y, color, e.type === "boss" ? 40 : 18, e.type === "boss" ? 1.6 : 1);
  if (e.type === "boss") sfx.bigExplosion();
  else sfx.explosion();
  addFloatText(e.x, e.y, String(pts), "#ffe23d");
  maybeDropPowerup(e.x, e.y);
  enemies.splice(idx, 1);
}

function playerHit() {
  if (player.invuln > 0 || !player.alive) return;
  if (player.shield > 0) {
    player.shield = 0;
    player.invuln = 1.2;
    explode(player.x, player.y, "#4dff6e", 24, 1.2);
    sfx.explosion();
    return;
  }
  player.alive = false;
  player.double = false;
  lives--;
  explode(player.x, player.y, "#35f0ff", 40, 1.8);
  explode(player.x, player.y, "#ffffff", 20, 1.2);
  sfx.hit();
  state = "dying";
  stateTimer = 1.6;
}

/* ---------------- update ---------------- */

function updatePlayer(dt) {
  if (!player.alive) return;

  let dx = 0;
  let dy = 0;
  if (keys["ArrowLeft"] || keys["KeyA"]) dx -= 1;
  if (keys["ArrowRight"] || keys["KeyD"]) dx += 1;
  if (keys["ArrowUp"] || keys["KeyW"]) dy -= 1;
  if (keys["ArrowDown"] || keys["KeyS"]) dy += 1;
  if (dx && dy) {
    dx *= 0.7071;
    dy *= 0.7071;
  }
  player.x += dx * player.speed * dt;
  player.y += dy * player.speed * dt;
  player.x = Math.max(18, Math.min(W - 18, player.x));
  player.y = Math.max(H * 0.45, Math.min(H - 30, player.y));

  if (keys["Space"]) playerShoot();
  player.fireCooldown -= dt;
  player.invuln -= dt;
  player.rapid -= dt;
  player.shield -= dt;
}

function updateFormation(dt) {
  if (!formation) return;
  const alive = enemies.filter((e) => e.state === "formation").length;
  if (alive === 0) {
    formation = null;
    return;
  }

  formation.stepTimer += dt;
  const interval = formation.stepInterval * Math.max(0.35, alive / 15);
  if (formation.stepTimer >= interval) {
    formation.stepTimer = 0;
    const margin = 40;
    const minX = formation.x + margin;
    const maxX = formation.x + (formation.cols - 1) * formation.spacingX - margin;
    if (formation.dir > 0 && maxX >= W - margin) {
      formation.dir = -1;
      formation.y += formation.drop;
    } else if (formation.dir < 0 && minX <= margin) {
      formation.dir = 1;
      formation.y += formation.drop;
    } else {
      formation.x += formation.dir * 14;
    }
  }

  // reposition formation members
  for (const e of enemies) {
    if (e.state !== "formation") continue;
    e.x = formation.x + e.col * formation.spacingX;
    e.y = formation.y + e.row * formation.spacingY;
  }

  // formation fires
  formation.fireTimer -= dt;
  if (formation.fireTimer <= 0) {
    formation.fireTimer = rand(0.5, 1.6) * Math.max(0.4, 1 - wave * 0.05);
    const shooters = enemies.filter((e) => e.state === "formation");
    if (shooters.length) {
      const s = pick(shooters);
      enemyShoot(s);
    }
  }

  // random dive-bombers
  if (Math.random() < dt * (0.15 + wave * 0.03)) {
    const candidates = enemies.filter((e) => e.state === "formation" && !e.boss);
    if (candidates.length) {
      const d = pick(candidates);
      d.state = "dive";
      d.diveT = 0;
      d.diveBaseX = d.x;
      d.diveSpeed = rand(140, 200) + wave * 10;
    }
  }
}

function updateEnemies(dt) {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    e.flash -= dt;
    if (e.state === "dive") {
      e.diveT += dt;
      if (e.boss) {
        // boss: slow, narrow sweep near the top (easy to track), then hold
        e.x = W / 2 + Math.sin(e.diveT * 0.5) * (W / 2 - 130);
        e.y = Math.min(150, e.y + 30 * dt);
      } else {
        e.x = e.diveBaseX + Math.sin(e.diveT * 4) * 50;
        e.y += e.diveSpeed * dt;
        if (Math.random() < dt * 2) enemyShoot(e);
        if (e.y > H + 30) enemies.splice(i, 1);
      }
    }
  }
}

function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.y += b.vy * dt;
    if (b.y < -10) bullets.splice(i, 1);
  }
  for (let i = enemyBullets.length - 1; i >= 0; i--) {
    const b = enemyBullets[i];
    b.y += b.vy * dt;
    if (b.y > H + 10) enemyBullets.splice(i, 1);
  }
}

function updatePowerups(dt) {
  for (let i = powerups.length - 1; i >= 0; i--) {
    const p = powerups[i];
    p.t += dt;
    p.y += p.vy * dt;
    p.x += Math.sin(p.t * 3) * 30 * dt;
    if (p.y > H + 20) {
      powerups.splice(i, 1);
      continue;
    }
    if (player.alive && circlesOverlap(p.x, p.y, 14, player.x, player.y, 16)) {
      applyPowerup(p.kind);
      powerups.splice(i, 1);
    }
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      particles.splice(i, 1);
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.98;
    p.vy *= 0.98;
  }
  for (let i = floatTexts.length - 1; i >= 0; i--) {
    const t = floatTexts[i];
    t.life -= dt;
    t.y -= 30 * dt;
    if (t.life <= 0) floatTexts.splice(i, 1);
  }
}

function checkCollisions() {
  // player bullets vs enemies
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    for (let j = enemies.length - 1; j >= 0; j--) {
      const e = enemies[j];
      const r = ENEMY_RADIUS[e.type];
      if (circlesOverlap(b.x, b.y, b.r, e.x, e.y, r)) {
        bullets.splice(i, 1);
        if (e.type === "boss") {
          e.hp -= 1;
          e.flash = 0.1;
          score += 50;
          addFloatText(e.x, e.y, "50", "#ffe23d");
          explode(b.x, b.y, "#ffe23d", 6, 0.6);
          if (e.hp <= 0) killEnemy(e, j);
        } else {
          killEnemy(e, j);
        }
        break;
      }
    }
  }

  if (!player.alive) return;

  // enemy bullets vs player
  for (let i = enemyBullets.length - 1; i >= 0; i--) {
    const b = enemyBullets[i];
    if (circlesOverlap(b.x, b.y, b.r, player.x, player.y, player.r)) {
      enemyBullets.splice(i, 1);
      playerHit();
      return;
    }
  }

  // enemies vs player (ramming)
  for (let j = enemies.length - 1; j >= 0; j--) {
    const e = enemies[j];
    if (circlesOverlap(e.x, e.y, ENEMY_RADIUS[e.type], player.x, player.y, player.r)) {
      if (e.type === "boss") {
        playerHit();
      } else {
        killEnemy(e, j);
        playerHit();
      }
      return;
    }
  }
}

/* ---------------- drawing ---------------- */

function drawBullets() {
  for (const b of bullets) {
    ctx.fillStyle = "#aef7ff";
    ctx.fillRect(b.x - 1.5, b.y - 6, 3, 10);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(b.x - 1, b.y - 5, 2, 4);
  }
  for (const b of enemyBullets) {
    ctx.fillStyle = "#ff6b6b";
    ctx.fillRect(b.x - 1.5, b.y - 5, 3, 9);
    ctx.fillStyle = "#ffd9d9";
    ctx.fillRect(b.x - 1, b.y - 3, 2, 3);
  }
}

function drawEnemies() {
  for (const e of enemies) {
    const blink = e.flash > 0 && Math.floor(e.flash * 40) % 2 === 0;
    drawSprite(e.type, e.x, e.y, 1, blink ? 0.3 : 1);
  }
}

function drawPlayer() {
  if (!player.alive) return;
  const blink = player.invuln > 0 && Math.floor(player.invuln * 20) % 2 === 0;
  if (!blink) drawSprite("player", player.x, player.y, 1);

  // engine flame
  if (Math.random() < 0.8) {
    const f = rand(4, 10);
    ctx.fillStyle = "#ff9d3d";
    ctx.fillRect(player.x - 3, player.y + 14, 2, f);
    ctx.fillRect(player.x + 1, player.y + 14, 2, f);
    ctx.fillStyle = "#ffe23d";
    ctx.fillRect(player.x - 2, player.y + 14, 1, f * 0.5);
    ctx.fillRect(player.x + 2, player.y + 14, 1, f * 0.5);
  }

  // shield ring
  if (player.shield > 0) {
    ctx.strokeStyle = `rgba(77, 255, 110, ${0.4 + 0.3 * Math.sin(Date.now() / 100)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(player.x, player.y, 22, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawPowerups() {
  for (const p of powerups) {
    const pulse = 1 + 0.12 * Math.sin(p.t * 8);
    const colors = { rapid: "#ffe23d", double: "#35f0ff", shield: "#4dff6e" };
    const letters = { rapid: "R", double: "D", shield: "S" };
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = "#0a0c1a";
    ctx.strokeStyle = colors[p.kind];
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(-10, -10, 20, 20);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = colors[p.kind];
    ctx.font = "bold 12px 'Courier New', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(letters[p.kind], 0, 1);
    ctx.restore();
  }
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
  for (const t of floatTexts) {
    ctx.globalAlpha = Math.min(1, t.life * 2);
    ctx.fillStyle = t.color;
    ctx.font = "bold 12px 'Courier New', monospace";
    ctx.textAlign = "center";
    ctx.fillText(t.text, t.x, t.y);
  }
  ctx.globalAlpha = 1;
}

function drawHUD() {
  ctx.font = "bold 14px 'Courier New', monospace";
  ctx.textBaseline = "top";

  ctx.textAlign = "left";
  ctx.fillStyle = "#8a97c9";
  ctx.fillText("SCORE", 14, 10);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(String(score).padStart(6, "0"), 14, 26);

  ctx.textAlign = "center";
  ctx.fillStyle = "#8a97c9";
  ctx.fillText("WAVE " + wave, W / 2, 10);

  ctx.textAlign = "right";
  ctx.fillStyle = "#8a97c9";
  ctx.fillText("HI " + String(highScore).padStart(6, "0"), W - 14, 10);

  // lives as mini ships
  for (let i = 0; i < lives; i++) {
    drawSprite("player", 22 + i * 22, H - 18, 0.55);
  }

  // boss health bar
  const boss = enemies.find((e) => e.boss);
  if (boss) {
    const bw = 200;
    const bx = W / 2 - bw / 2;
    const maxHp = 20 + wave * 2;
    ctx.fillStyle = "#8a97c9";
    ctx.font = "10px 'Courier New', monospace";
    ctx.textAlign = "center";
    ctx.fillText("MOTHER SHIP", W / 2, 44);
    ctx.fillStyle = "#2a2f4a";
    ctx.fillRect(bx, 56, bw, 6);
    ctx.fillStyle = "#ff4d4d";
    ctx.fillRect(bx, 56, bw * Math.max(0, boss.hp / maxHp), 6);
  }

  // active powerup timers
  let py = H - 40;
  if (player.rapid > 0) {
    ctx.textAlign = "left";
    ctx.fillStyle = "#ffe23d";
    ctx.fillText("RAPID " + player.rapid.toFixed(1) + "s", 14, py);
    py -= 16;
  }
  if (player.shield > 0) {
    ctx.textAlign = "left";
    ctx.fillStyle = "#4dff6e";
    ctx.fillText("SHIELD " + player.shield.toFixed(1) + "s", 14, py);
  }
  if (player.double) {
    ctx.textAlign = "left";
    ctx.fillStyle = "#35f0ff";
    ctx.fillText("DOUBLE SHOT", 14, py - 16);
  }
}

function drawCenterText(lines) {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let y = H / 2 - (lines.length * 28) / 2;
  for (const line of lines) {
    ctx.font = line.font || "bold 24px 'Courier New', monospace";
    ctx.fillStyle = line.color || "#ffffff";
    if (line.glow) {
      ctx.shadowColor = line.glow;
      ctx.shadowBlur = 16;
    }
    ctx.fillText(line.text, W / 2, y);
    ctx.shadowBlur = 0;
    y += 28;
  }
}

function drawMenu() {
  const t = Date.now() / 1000;
  drawCenterText([
    { text: "STAR STRIKER", font: "bold 40px 'Courier New', monospace", color: "#35f0ff", glow: "#35f0ff" },
    { text: "— 1 9 8 6 —", font: "16px 'Courier New', monospace", color: "#ff3df0", glow: "#ff3df0" },
  ]);

  // parade of enemy ships
  drawSprite("bug", W / 2 - 120, H / 2 + 60 + Math.sin(t * 2) * 6, 1);
  drawSprite("saucer", W / 2, H / 2 + 60 + Math.sin(t * 2 + 1) * 6, 1);
  drawSprite("fighter", W / 2 + 120, H / 2 + 60 + Math.sin(t * 2 + 2) * 6, 1);

  if (Math.floor(t * 2) % 2 === 0) {
    drawCenterText([
      { text: "PRESS SPACE TO START", font: "bold 16px 'Courier New', monospace", color: "#ffe23d", glow: "#ffe23d" },
    ]);
  }
  ctx.font = "12px 'Courier New', monospace";
  ctx.fillStyle = "#5a6285";
  ctx.textAlign = "center";
  ctx.fillText("HI-SCORE  " + String(highScore).padStart(6, "0"), W / 2, H / 2 + 120);
}

function drawGameOver() {
  drawCenterText([
    { text: "GAME OVER", font: "bold 36px 'Courier New', monospace", color: "#ff4d4d", glow: "#ff4d4d" },
    { text: "SCORE  " + String(score).padStart(6, "0"), font: "bold 18px 'Courier New', monospace", color: "#ffffff" },
    { text: "HI     " + String(highScore).padStart(6, "0"), font: "bold 18px 'Courier New', monospace", color: "#ffe23d" },
  ]);
  const t = Date.now() / 1000;
  if (Math.floor(t * 2) % 2 === 0) {
    drawCenterText([
      { text: "PRESS SPACE TO RESTART", font: "bold 14px 'Courier New', monospace", color: "#35f0ff", glow: "#35f0ff" },
    ]);
  }
}

function drawWaveBanner() {
  if (stateTimer < 1.6) {
    const a = stateTimer < 0.3 ? stateTimer / 0.3 : Math.min(1, (1.6 - stateTimer) / 0.3);
    ctx.globalAlpha = a;
    drawCenterText([
      { text: "WAVE " + wave, font: "bold 28px 'Courier New', monospace", color: "#ffe23d", glow: "#ffe23d" },
      { text: wave % 5 === 0 ? "WARNING: MOTHER SHIP DETECTED" : "GET READY", font: "14px 'Courier New', monospace", color: "#ff4d4d" },
    ]);
    ctx.globalAlpha = 1;
  }
}

/* ---------------- main loop ---------------- */

function resetGame() {
  score = 0;
  lives = 3;
  wave = 0;
  bullets = [];
  enemyBullets = [];
  enemies = [];
  particles = [];
  powerups = [];
  floatTexts = [];
  formation = null;
  player.x = W / 2;
  player.y = H - 70;
  player.alive = true;
  player.invuln = 2;
  player.rapid = 0;
  player.double = false;
  player.shield = 0;
  player.fireCooldown = 0;
}

function startGame() {
  resetGame();
  nextWave();
  state = "playing";
  sfx.wave();
}

function nextWave() {
  wave++;
  spawnWave(wave);
  state = "playing";
  stateTimer = 1.6;
}

function togglePause() {
  state = state === "paused" ? "playing" : "paused";
}

function update(dt) {
  updateStars(dt);
  updateParticles(dt);

  if (state === "playing") {
    stateTimer -= dt;
    updatePlayer(dt);
    updateFormation(dt);
    updateEnemies(dt);
    updateBullets(dt);
    updatePowerups(dt);
    checkCollisions();

    // wave cleared?
    if (enemies.length === 0 && formation === null) {
      score += 500;
      addFloatText(W / 2, H / 2 - 40, "WAVE CLEAR +500", "#4dff6e");
      nextWave();
    }
  } else if (state === "dying") {
    stateTimer -= dt;
    updateBullets(dt);
    updateEnemies(dt);
    if (stateTimer <= 0) {
      if (lives <= 0) {
        state = "gameover";
        sfx.gameover();
      } else {
        player.alive = true;
        player.x = W / 2;
        player.y = H - 70;
        player.invuln = 2.5;
        player.double = false;
        state = "playing";
      }
    }
  }
}

function draw() {
  ctx.fillStyle = "#05060f";
  ctx.fillRect(0, 0, W, H);

  drawStars();

  if (state === "menu") {
    drawMenu();
    return;
  }

  drawBullets();
  drawEnemies();
  drawPlayer();
  drawPowerups();
  drawParticles();
  drawHUD();

  if (state === "playing" && stateTimer > 0 && wave > 0 && enemies.length) {
    drawWaveBanner();
  }
  if (state === "paused") {
    ctx.fillStyle = "rgba(5, 6, 15, 0.6)";
    ctx.fillRect(0, 0, W, H);
    drawCenterText([
      { text: "PAUSED", font: "bold 28px 'Courier New', monospace", color: "#35f0ff", glow: "#35f0ff" },
      { text: "PRESS P TO RESUME", font: "13px 'Courier New', monospace", color: "#8a97c9" },
    ]);
  }
  if (state === "gameover") {
    drawGameOver();
  }
}

let lastTime = performance.now();

function frame(now) {
  const dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;

  if (state !== "paused") update(dt);
  draw();

  requestAnimationFrame(frame);
}

initStars();
requestAnimationFrame(frame);

/* ---------------- mobile: fit cabinet + touch controls ---------------- */

(function () {
  const cabinet = document.querySelector(".cabinet");

  function fitCabinet() {
    const s = Math.min(
      1,
      (window.innerWidth - 12) / cabinet.offsetWidth,
      (window.innerHeight - 12) / cabinet.offsetHeight
    );
    cabinet.style.transform = "scale(" + s + ")";
  }
  window.addEventListener("resize", fitCabinet);
  window.addEventListener("orientationchange", fitCabinet);
  fitCabinet();

  const sendKey = (code, type) =>
    window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));

  document.querySelectorAll(".tc-btn").forEach((btn) => {
    const code = btn.dataset.code;
    const down = (e) => {
      e.preventDefault();
      try { btn.setPointerCapture(e.pointerId); } catch (_) { /* stale/synthetic pointer */ }
      sendKey(code, "keydown");
    };
    const up = (e) => {
      e.preventDefault();
      sendKey(code, "keyup");
    };
    btn.addEventListener("pointerdown", down);
    btn.addEventListener("pointerup", up);
    btn.addEventListener("pointercancel", up);
    btn.addEventListener("contextmenu", (e) => e.preventDefault());
  });

  // tap the screen to start / restart
  const screen = document.getElementById("screen");
  screen.addEventListener("pointerdown", () => {
    if (state === "menu" || state === "gameover") {
      sendKey("Space", "keydown");
      sendKey("Space", "keyup");
    }
  });
})();
