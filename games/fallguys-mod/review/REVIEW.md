# 🤖 CodeRabbit — Project Review: `fallguys-mod` (Bean Dash)

> **Scope:** full project (single commit `033fc9e "first"` + working tree) · **Date:** 2026-08-16
> **Project type:** static web game · **Runtime deps:** Three.js r160 (only) · **Build step:** none

## 📋 Walkthrough

Bean Dash is a Fall Guys–style 3-lane endless runner. The entire game is one
dependency-free, build-less static site: an HTML shell with HUD/overlays, a
206-line stylesheet, and a single 1,127-line ES module (`game.js`) containing
scene setup, procedural player/obstacle/coin generation (all textures are
canvas-drawn — road, chullo hat, fur — so there is no asset pipeline), WebAudio
SFX, AABB collision, keyboard + touch input, and a fixed-timestep-clamped
`requestAnimationFrame` loop. A `?debug` query flag exposes a
`window.__beandash` hook intended for automated smoke tests. Three.js r160 is
loaded via import map (currently the unpkg CDN, with a vendored minified copy
in `lib/`).

The code is in good shape: clean sectioned architecture, a config block,
shared geometry/material caches, and careful input/edge handling. Two issues
contradict the project's own documented claims (self-containment, verified
hitboxes) and are the main items below.

## 📁 Changes

| File | Change summary |
| --- | --- |
| `index.html` (60 ln) | Page shell, HUD, 3 overlays, SVG favicon, import map → **unpkg CDN** |
| `style.css` (206 ln) | HUD, countdown pop, overlay/panel styling, coin-pulse + float-score animations |
| `game.js` (1,127 ln) | All game logic: config, audio, scene, procedural beans/llamas/obstacles/coins, state machine (`menu`/`count`/`play`/`dead`), input, AABB collision, update loop, `?debug` hook |
| `lib/three.module.js` (6 ln, 655 KB) | Vendored Three.js **r160** minified (verified: `"160"` revision string, syntax valid) — offline fallback |
| `README.md` (79 ln) | Controls, local run, static-deploy matrix, `?debug` API docs |
| `TODO.md` (43 ln) | Prior review findings (all marked done) + backlog |

## ✅ PR Checklist

- [x] **Documentation** — README covers local run, deploy, and the debug API
- [x] **Deployability** — pure static site, relative paths, no build command
- [x] **Mobile support** — touch controls, viewport meta, portrait FOV (72°), `touch-action: none`
- [x] **Graceful degradation** — friendly "WebGL required" screen on renderer failure
- [x] **Syntax valid** — `game.js` and vendored `lib/three.module.js` both pass `node --check`
- [ ] **Self-containment** — ⚠️ contradicted by code (see `index.html` finding 1)
- [ ] **Automated tests / CI** — none; the `?debug` hook is built for it but unused
- [ ] **Lint/format config** — none (single module, consistently formatted by hand)
- [ ] **Accessibility** — partial: keyboard play works; pinch-zoom disabled, HUD overflows small phones

---

## 🚨 Findings

### `index.html`

**1. 🚨 [major] Three.js loads from the unpkg CDN — contradicts the "self-contained" claim in `TODO.md`**

The import map ships to production pointing at the CDN:

```html
{ "imports": { "three": "https://unpkg.com/three@0.160.0/build/three.module.js" } }
```

but `TODO.md` marks as *done*:

> "Not self-contained: three.js was pulled from the jsDelivr CDN → vendored r160
> min into `lib/three.module.js`, **import map now points at `./lib/three.module.js`**"

These cannot both be true. As shipped, the game is **not** offline-capable and
adds a runtime dependency on unpkg that fails behind corporate firewalls / in
air-gapped environments — exactly what the TODO item claims to have fixed.
Note also that import maps cannot use SRI/`integrity`, so the CDN script is
pinned by version only.

**Recommended action:** pick one and make the docs agree. If self-containment
is the goal (as the TODO claims), point the import map at
`./lib/three.module.js` — the 655 KB file is already committed, so the
self-contained build costs nothing extra. If the CDN default is intentional
(smaller repo, CDN caching), rewrite the TODO item to "vendored fallback
available, not wired by default" and keep the README's manual-switch
instructions.

**2. 📝 [nitpick] Pinch-zoom is fully disabled**

```html
<meta name="viewport" content="..., maximum-scale=1.0, user-scalable=no">
```

`user-scalable=no` blocks user pinch-zoom, a known WCAG 1.4.4 concern. Fine for
a full-bleed game, but consider dropping `maximum-scale`/`user-scalable` (the
`touch-action: none` in CSS already prevents the gesture from reaching the
browser) and relying on that alone.

**3. 📝 [nitpick] No `<noscript>` fallback**

With JS disabled the user sees only the HUD (score 0) over a blank page. A one-line `<noscript>` message ("Bean Dash requires JavaScript + WebGL") is a cheap courtesy.

---

### `game.js`

**1. 🚨 [major] Blocks are jumpable — contradicts the documented "verified" hitbox design**

`TODO.md` states the hitbox math was verified and that *"blocks are lane-dodges"*.
The numbers say otherwise:

```js
const JUMP_VEL = 12.5;
const GRAVITY = 32;
// max jump height = v²/(2g) = 12.5²/64 = 2.4414 u
// block AABB (spawnBlock): y = 1.15, hy = 1.18 → top = 2.33 u
```

The bean's feet clear 2.33 u for **~0.17 s** on every full jump, while the
block's z-crossing (player ±0.55 + block 0.68 = 1.23 u) takes only **0.062 s**
at start speed (20 u/s) and **0.021 s** at max speed (58 u/s). A block is
therefore clearable by jumping at *any* speed with good timing — the
intended "dodge or die" pressure on blocks is gone, and the documented
"every pattern is solvable / no exploits" verification is stale.

**Recommended action:** if blocks are meant to be dodge-only, raise the
collision top above the apex, e.g. `registerObstacle(g, x, 1.15, z, 1.35, 1.30, 0.68)`
(top 2.45 u > 2.4414 u apex). If jumping blocks is an *intended* skill escape,
update `TODO.md` to say so.

**2. 💡 [minor] The "must-slide" slide wall has a 0.0086 u unjumpable margin — a tuning landmine**

```js
// spawnSlideWall: y = 2.0, hy = 0.45 → top = 2.45 u
// apex = 2.4414 u  →  margin = 0.0086 u
```

Slide walls are the only obstacle that *cannot* be jumped, and they're
currently unjumpable by 0.0086 units. Any future tweak to `JUMP_VEL`/`GRAVITY`,
or a power-up (the backlog lists "coin magnet, shield, 2× score" — a jump boost
would fit right in), silently converts the slide wall into a jumpable one and
breaks the core slide mechanic with no test to catch it.

**Recommended action:** give "must-not-clear" obstacles a real margin (e.g.
slide-wall `hy = 0.55` → top 2.55 u) and add an automated invariant — cheap
with the existing `?debug` hook: for every registered obstacle tagged
`mustSlide`, assert `JUMP_VEL**2 / (2*GRAVITY) < o.y + o.hy`.

**3. 💡 [minor] No automated smoke test or CI — the hook that exists for this is unused**

The `?debug` API (`state`, `step(dt)`, `press(code)`, `obstacles()`,
`nearCoins()`, `startCountdown()`) is exactly a test harness, and `TODO.md`
lists "real smoke-test script (headless Chrome + `?debug`) as a CI check" as
backlog. Nothing exercises the game end-to-end today.

**Recommended action:** a minimal Playwright/Puppeteer script in CI:
load `?debug` → `startCountdown()` → `step()` through the countdown → assert
`state.mode === "play"` → script a few `press()` sequences → assert a death
transition reaches `mode === "menu"`, no console errors, and the hitbox
invariant from finding 2. ~40 lines, pays for itself on the first physics
regression.

**4. 💡 [minor] Shadows "pop in" on obstacles: shadow camera `far` (60) ≪ spawn distance (230)**

```js
sun.shadow.camera.far = 60;      // shadow frustum ends ~60 u from the target
const SPAWN_AHEAD = 230;         // obstacles appear 230 u ahead
```

Obstacles spawn far outside the shadow frustum, so they render shadowless and
gain a shadow as they drift in — visible shadow "pop" at high speed. Raising
`far` (and the ortho bounds) costs shadow-map resolution; the fog (60–240 u)
masks most of it, so this may be an acceptable trade.

**Recommended action:** either raise `far`/bounds and accept softer shadows, or
document in `TODO.md` "checked, left as-is" (like the gap-formula note) so it
isn't re-discovered later.

**5. 📝 [nitpick] `__beandash.hat()` finds the hat by "group with exactly 6 children"**

```js
for (const child of player.children[0].children) if (child.isGroup && child.children.length === 6) hatGroup = child;
```

The `hat` group is already a top-level `const` — expose it directly
(`hat: () => hat` plus a mesh-count helper) instead of structural sniffing
that silently returns `{ found: false }` after any unrelated refactor.

**6. 📝 [nitpick] Working tree is not committed**

`git status`: `game.js`/`index.html`/`style.css` modified, `README.md`/
`TODO.md`/`lib/` untracked, single commit `033fc9e "first"`. The repo has no
`.gitignore` (none needed at this scale), but the current work exists only in
the working tree.

**Recommended action:** commit the current state (e.g. "add Bean Dash game,
docs, vendored three r160") so the review baseline matches what ships.

---

### `style.css`

**1. 💡 [minor] HUD overflows on phones under ~405 px wide**

```css
.hud-box { min-width: 90px; ... }
#hud { padding: 18px 22px; ... }   /* no flex-wrap */
```

4 boxes × 90 px + 44 px padding ≈ **404 px minimum** row width. On the
360–375 px phones this game targets, the row overflows and the speed box is
clipped off-screen.

**Recommended action:** add a small-screen rule, e.g.
`@media (max-width: 480px) { .hud-box { min-width: 0; font-size: 16px; padding: 6px 10px; } #hud { padding: 12px } }`, or allow `flex-wrap: wrap`.

**2. 📝 [nitpick] `#count` is a fixed 160 px**

`GO!` at 160 px is ~290 px wide — fine at 360 px, tight at 320 px. A
`font-size: min(160px, 20vw)` keeps the pop effect and the text on-screen.

---

### `TODO.md`

**1. 🚨 [major] "Release fixes — done" list contains a stale/incorrect item**

The self-containment checkbox (see `index.html` finding 1) claims the import
map points at `./lib/three.module.js`; it does not. The rest of the list
appears accurate and is nicely written (the "checked, intentionally left as-is"
section with the gap-formula math is exactly the right habit — extend that
habit to the block-jump finding above).

**Recommended action:** reconcile with the actual import map, and re-verify
the "hitbox math verified" claim given finding 1 in `game.js`.

---

## ✅ Positives

- **Zero build, zero runtime deps, 5 authored files** — deploys to any static
  host from a sub-path; the README's deploy matrix matches the code (relative
  paths, no env vars).
- **Performance hygiene:** shared geometry + material caches (`obMat`, `geos`,
  llama geos), `setPixelRatio` capped at 2, anisotropy clamped to
  `getMaxAnisotropy()`, `dt` clamped to 0.05 (tab-switch safe), object arrays
  pruned on recycle, and `clock.getDelta()` reset on unpause so the first
  resumed frame doesn't jump.
- **Input handling done properly:** keyboard + touch + buttons coexist,
  `e.repeat` guarded, `preventDefault` on Space/arrows avoids double-start via
  focused buttons, buttons excluded from the tap handler
  (`e.target.closest("button")`), and tap-vs-swipe disambiguated with a 24 px
  threshold.
- **Fairness by construction:** exactly one open lane per pattern, open lane
  never contains a slide/jump wall, and the gap formula's difficulty ramp is
  explicitly reasoned about in `TODO.md` instead of hand-waved.
- **Procedural everything:** road stripes, chullo hat knit, and llamas are
  canvas textures / primitive meshes — no asset pipeline, no CORS or
  licensing surface.
- **Mobile polish:** SVG data-URI favicon (no 404), `theme-color`,
  portrait FOV bump, `touch-action: none` + `overscroll-behavior: none`.
- **Graceful degradation:** WebGL failure shows a friendly message instead of
  a blank page; corrupted `localStorage` best score falls back to 0.
- **Testable by design:** the `?debug` hook is gated from production by
  default yet one flag away for CI — the right shape for a static game.

## ❓ Questions

1. **CDN vs. vendored Three.js — which is the intended default?** The README,
   TODO, and code currently disagree (see major findings). This decides the
   answer to "does it work offline?"
2. **Is jumping a block intended?** If yes, it should be documented as a
   skill escape; if no, the hitbox needs the 0.1 u fix above.
3. **Is the 655 KB vendored `lib/` worth keeping if the CDN stays the
   default?** It is only a fallback if the import map is manually edited —
   consider automating it (e.g. a `?offline` build, or just shipping the local
   file) or removing it.

## 📊 Stats

| Metric | Value |
| --- | --- |
| Files reviewed | 6 (5 authored + 1 vendored) |
| Authored lines | 1,515 — `game.js` 1,127 · `style.css` 206 · `index.html` 60 · `README.md` 79 · `TODO.md` 43 |
| Vendored | `lib/three.module.js` — Three.js r160 minified, 655 KB, syntax-verified |
| Findings | **2 major** (self-containment contradiction · jumpable blocks) · **4 minor** · **5 nitpick** |
| Syntax check | `game.js` ✅ · `lib/three.module.js` ✅ (`node --check`) |
| Math verified | apex 2.4414 u · block top 2.33 u (clearable) · slide wall 2.45 u (not clearable, 0.0086 u margin) |
| Estimated review time | ~45 min |
