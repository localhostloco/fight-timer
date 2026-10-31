# Fight Timer

A free, offline-capable, multilanguage round timer for fight coaches (boxing, MMA, Muay Thai, BJJ, HIIT), built as a static PWA and hosted on GitHub Pages.

## Start here

Read `docs/BLUEPRINT.md` before writing any code. It is the agreed scope: market research, core and differentiating features, UI/UX rules, architecture, data model, roadmap with acceptance criteria, and known risks. Build in roadmap order (MVP → v1 → v2) and do not start a later phase until the previous gate passes.

## Non-negotiables

- **Timing is timestamp-based, never tick-counted.** Phase ends are absolute `performance.now()` targets; the display derives remaining time per frame. Bells are scheduled on the Web Audio clock (`source.start(ctx.currentTime + delta)`) with a look-ahead scheduler, so background-tab throttling never delays a bell.
- **Screen stays on while running** via the Screen Wake Lock API, re-acquired on `visibilitychange`, with a visible fallback banner where unsupported.
- **Fully offline after first load, zero network calls during a session.** No ads, no accounts, no paywall, no analytics by default.
- **Multilanguage from day one**: every user-facing string (UI, voice callouts, sound names) goes through locale JSON files under `src/locales/` (pt-BR, en, es at launch). No hard-coded or concatenated sentences.
- **Gym-distance UI**: full-viewport phase color (amber prep / green work / red rest), tabular numerals filling the screen, no destructive action one tap away while running, every alert both visible and audible.
- **GitHub Pages constraints**: hash-based routing, Vite `base` set to the repo path, manifest `scope`/`start_url` under that base, deploy `dist/` via GitHub Actions on push to `main`.

## Stack (decided unless the blueprint's open questions are answered otherwise)

Vite + TypeScript + Preact (with signals), `vite-plugin-pwa`, Vitest for the scheduler (fake clock), Playwright for smoke tests. Keep dependencies minimal; the whole app including sounds should stay under 1 MB.

## Conventions

- Source in `src/`, locales in `src/locales/`, sounds in `public/sounds/`, docs in `docs/`.
- The scheduler, audio engine and session store are framework-free TypeScript modules with unit tests; UI components only render store state and dispatch commands.
- Update `docs/BLUEPRINT.md` when a decision changes scope; tick acceptance criteria there as they are met.
