# Peruf Arcade

A small arcade of free browser games. Plain HTML, CSS and JavaScript — mostly
generated with a local AI model on consumer hardware. No frameworks, no build
step, no server: the whole site is one static Docker image.

Served at **peruf.me**. Every game is responsive and touch-enabled, so it
plays on phones as well as desktops.

## The games

Every game lives in `games/` as its own self-contained subdirectory.

| Game | Path | What it is |
| --- | --- | --- |
| 🐶 Flappy Dog | `games/flappy-dog/` | One-button arcade action: pipes, cats, 5 lives, day/night cycle, scaling difficulty |
| 🚀 Star Striker | `games/star-striker/` | Retro 1986-style shooter, arcade-cabinet chrome with scanlines |
| 🪐 Solar System Simulator | `games/solar-system-sim/` | Real-time Keplerian orbital simulation, Halley's Comet at true position |
| 🫘 Bean Dash | `games/fallguys-mod/` | Fall Guys-style 3-lane obstacle runner (Three.js) |

## Structure

```
index.html          arcade hub (game cards + links)
about.html          about the arcade
guide.html          Flappy Dog strategy guide
blog/               game stories & dev log
games/              one subfolder per game
styles.css          shared hub / page styles (gaming-coder palette)
nav.js              mobile nav toggle
nginx.conf          nginx site config
Dockerfile          nginx:alpine image
```

## Play

Open `index.html` in any browser, or serve the folder:

```bash
python3 -m http.server 8080
```

## Deploy

### Local Docker

```bash
sudo docker compose up --build
```

Visit http://localhost:8080

### Google Cloud Run

CI/CD is already set up: pushing to `main` builds and pushes the Docker
image (Artifact Registry) and deploys it to Cloud Run via GitHub Actions with
Workload Identity Federation — no long-lived credentials in the repo.

After every successful deploy the pipeline also creates a git tag and a
GitHub Release, auto-incrementing the minor version: `v1.0.0`, `v1.1.0`,
`v1.2.0`, … (one release per deploy to `main`).

The setup script for Workload Identity Federation lives in `scripts/`:

```bash
./scripts/create-github-wif.sh --help
```

See `scripts/README.md` for the full setup details, and
`.github/workflows/deploy.yml` for the pipeline.

## Monetization

Includes Google AdSense integration (publisher ID in each page's `<head>`).
Replace it with your own if the site is yours.
