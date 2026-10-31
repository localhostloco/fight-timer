# Contributing

## Adding a language

One JSON file is all it takes.

1. Copy `src/locales/en.json` to `src/locales/<code>.json`, using the BCP 47 tag (`fr`, `de`, `pt-PT`, …).
2. Translate every value. Keep the `{placeholders}` exactly as they are; they are filled in at runtime.
   - `cmd.*` are the voice-control words, comma-separated. Give several natural variants.
   - `voice.*` are spoken aloud; write them the way a coach would say them.
   - `preset.*` are the built-in preset names.
3. Register it in `src/i18n/index.ts`: import the file and add an entry to `LOCALES` with the language's own name, and teach `detectLocale` the prefix.
4. Run `npm test`. `src/i18n/i18n.test.ts` fails if a key is missing, extra, empty, or has different placeholders than English. CI runs the same test, so a pull request cannot merge with a gap.

Spoken cues use the browser's own voices; nothing else needs recording.

## Adding or replacing a sound

Drop `bell.mp3`, `gong.mp3`, … (or `.ogg`/`.wav`) into `public/sounds/`. Any file present replaces the synthesized sound of the same id; missing ones keep the synth. Use CC0 or your own recordings only, keep each under 300 KB, and add the source to `public/sounds/LICENSES.md`.

Users can also upload their own files per sound from Settings, stored only on their device.

## Checks before a pull request

```sh
npm run check     # typecheck, unit tests, build
npm run test:e2e  # the journey, against a GitHub-Pages-like static server
```
