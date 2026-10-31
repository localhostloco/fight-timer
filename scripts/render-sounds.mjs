// Renders every built-in sound to test-results/sounds/<name>.wav so the
// library can be auditioned without opening the app. Usage: npm run sounds
import { mkdirSync, writeFileSync } from 'node:fs';
import { build } from 'vite';

// Bundle the TS generator module once so plain Node can import it.
await build({ configFile: false, logLevel: 'silent', build: { lib: { entry: 'src/engine/sounds.ts', formats: ['es'], fileName: 'sounds' }, outDir: 'test-results/.tmp', emptyOutDir: true, minify: false } });
const { generate } = await import('../test-results/.tmp/sounds.js');
const SOUNDS = ['bell', 'bell3', 'gong', 'horn', 'buzzer', 'whistle', 'clack', 'chime', 'drum', 'beep'];
const sr = 44100;
mkdirSync('test-results/sounds', { recursive: true });
for (const s of SOUNDS) {
  const data = generate(s, sr);
  const pcm = Buffer.alloc(data.length * 2);
  for (let i = 0; i < data.length; i++) pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, data[i])) * 32767), i * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(sr, 24);
  h.writeUInt32LE(sr * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  writeFileSync(`test-results/sounds/${s}.wav`, Buffer.concat([h, pcm]));
}
console.log(`wrote ${SOUNDS.length} wav files to test-results/sounds/`);
