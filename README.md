# Fight Timer

Free, offline, multilanguage round timer for fight coaches — boxing, MMA, Muay Thai, BJJ, HIIT. A static PWA hosted on GitHub Pages.

Status: **MVP** (simple mode, bells and 10-second clapper on the Web Audio clock, wake lock, offline PWA, pt-BR / en / es, built-in and saved presets). See [`docs/BLUEPRINT.md`](docs/BLUEPRINT.md) for research, features, UI, architecture, data model and the roadmap with its acceptance criteria. `CLAUDE.md` holds the working rules for coding sessions.

Live: https://localhostloco.github.io/fight-timer/

## Develop

```sh
npm ci
npm run dev        # Vite dev server
npm test           # Vitest: scheduler, plan compiler, locales, presets
npm run build      # dist/ with service worker and manifest, base /fight-timer/
npm run test:e2e   # Playwright against a GitHub-Pages-like static server (scripts/serve-pages.mjs)
npm run check      # typecheck + test + build
npm run sounds     # render every sound to test-results/sounds/*.wav
```

## Deploy

Every push to `main` runs `.github/workflows/deploy.yml`: typecheck, unit tests, build, end-to-end tests against the built `dist/` served exactly as GitHub Pages serves a project site, then `actions/deploy-pages`. The workflow enables Pages with the GitHub Actions source on first run; no repository setting has to be flipped by hand.

Hosting on a project path means three things must agree, and they all derive from one value, `BASE_PATH` (default `/fight-timer/`) in `vite.config.ts`: asset URLs, the manifest's `scope`/`start_url`, and the service-worker precache. Routing is hash-based because Pages has no SPA fallback. To move to a custom domain, build with `BASE_PATH=/`.
