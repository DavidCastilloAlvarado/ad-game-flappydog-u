# Bean Dash — TODO

Review + release checklist, assuming deployment to a **static web service**
(no build step, no server code). Updated: 2026-08-16.

## Release fixes — done

- [x] **Not self-contained by default (intentional)**: import map loads pinned r160 from the unpkg CDN so the static host never has to serve the 655 KB library; r160 min vendored into `lib/three.module.js` as a manual offline/air-gapped fallback (switch instructions in README)
- [x] **No touch controls** (unplayable on phones) → tap = jump/start/resume, swipe left/right = lane, swipe up = jump, swipe down = slide/fast-fall; overlay hints updated
- [x] **Stale HUD during countdown** (score/speed from the previous run) → `updateHud()` now called in `resetGame()`
- [x] **`state.time` double-incremented in menu** (2× arm-swing speed, phase jump) → removed the duplicate increment in the menu branch of `stepGame()`
- [x] **NaN best score** on corrupted localStorage value → `parseInt(...) || 0`
- [x] **Camera lookAt snapped menu → play** → shared `camTarget` vector, lerped in both modes
- [x] **Debug hook shipped to production** → `window.__beandash` now gated behind `?debug`
- [x] **No WebGL fallback** (blank page on failure) → friendly "WebGL required" screen
- [x] **Portrait phones**: fixed 58° FOV made the road too narrow → `fitCamera()` uses 72° when aspect < 0.8
- [x] **Hardcoded texture anisotropy (8)** → clamped to `renderer.capabilities.getMaxAnisotropy()`
- [x] **Redundant geometry**: slide wall was 3 overlapping 9.4-wide walls → one 12-wide wall + 2 posts
- [x] **Unreachable code**: coin-spawn branch for `overhead` in the open lane (never spawned)
- [x] **Dead CSS**: unused `.final-score .unit`
- [x] **Mobile/meta polish**: SVG favicon (no more 404), `theme-color`, `description`, `touch-action: none`, `overscroll-behavior: none`, user-select off, `maximum-scale=1`
- [x] **README.md** with local-run + static-deploy instructions

## Checked, intentionally left as-is

- Obstacle gap formula `speed * (0.75–1.15) + 14` — time-to-next-obstacle is
  `gap/speed ≈ 0.75–1.15s + 14/speed`, i.e. ~1.7s at start speed shrinking to
  ~1.1s at max speed. That's a proper difficulty ramp; the *spatial* density
  dropping at high speed is a consequence, not a bug.
- Hitbox math verified: every pattern is solvable (slide walls/overheads can't
  be jumped, jump walls/cones easily can, blocks are jumpable (and lane-dodgeable)) and the
  open-lane guarantee holds. No lane-threading exploit (adjacent AABB coverage
  is continuous: 1.35 + 0.5 > 1.5 lane half-spacing).

## Backlog (not release-blocking)

- [ ] Mute / sound-toggle button (SFX are always on)
- [ ] Power-ups: coin magnet, shield, 2× score
- [ ] New obstacle types (sliding gates, moving blocks, ramps)
- [ ] Background music loop (procedural or generated)
- [ ] PWA manifest + install-to-home-screen for mobile
- [ ] "Last run" stats persistence (top speed, coins, cause of death)
- [ ] Real smoke-test script (headless Chrome + `?debug`) as a CI check
