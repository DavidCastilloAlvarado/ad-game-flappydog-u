# Bean Dash 🫘

A Fall Guys–style 3-lane endless runner built with Three.js. No build step — it's a
fully static site. Three.js is loaded from a CDN (unpkg, pinned to r160); a local
copy is kept in `lib/` as an offline fallback.

Jump the hurdles, slide under the overheads, dodge the blocks, grab the coins,
outlast the accelerating chaos.

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Switch lane | `A` / `D` or `←` / `→` | swipe left / right |
| Jump | `W` / `↑` / `Space` | tap or swipe up |
| Slide (fast-fall when airborne) | `S` / `↓` | swipe down |
| Pause / resume | `Esc` | tap |

## Run locally

ES modules don't load from `file://`, so serve the folder over HTTP:

```bash
python3 -m http.server 8080    # or: npx serve
```

Then open http://localhost:8080

## Deploy (static web service)

Upload the folder contents as-is to any static host — no build command, no
server-side code, no environment variables:

- **GitHub Pages / GitLab Pages** — point at the repo root
- **Netlify / Vercel / Cloudflare Pages** — drag the folder in, build command empty
- **S3 + CloudFront, nginx, Apache** — copy files to the web root

Everything is loaded via relative paths, so it also works from a sub-path
(e.g. `yoursite.com/bean-dash/`).

## Debug / smoke test

Append `?debug` to the URL to expose `window.__beandash`, a hook for automated
smoke tests:

```js
window.__beandash.state            // live game state
window.__beandash.startCountdown() // start a run
window.__beandash.step(dt)         // advance the simulation
window.__beandash.press("KeyD")    // synthesize a keydown
window.__beandash.obstacles()      // active obstacles
window.__beandash.coins() / .nearCoins()
window.__beandash.spawnLlama(x, z) // decorate the scene
```

## Three.js source

By default the import map in `index.html` loads Three.js r160 from the unpkg CDN:

```html
{ "imports": { "three": "https://unpkg.com/three@0.160.0/build/three.module.js" } }
```

A vendored copy (`lib/three.module.js`, same r160, minified, MIT) is committed for
offline use. To use it instead, point the import map at the local file:

```html
{ "imports": { "three": "./lib/three.module.js" } }
```

## Files

```
index.html          page shell, HUD, overlays, import map
style.css           HUD / overlay styling
game.js             all game logic (scene, player, obstacles, loop)
lib/three.module.js vendored three.js r160 (minified, MIT) — offline fallback
TODO.md             review findings + backlog
```
