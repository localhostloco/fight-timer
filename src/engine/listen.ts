// Hands-free control through the Web Speech recognition API (Chrome and Edge
// only, needs microphone permission). Optional: the timer never depends on it.

export type Command = 'pause' | 'resume' | 'skip' | 'stop';

/** Match a transcript against localized command words; longest phrase wins. */
export function matchCommand(transcript: string, words: Record<Command, string[]>): Command | null {
  const text = transcript.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  let best: { cmd: Command; len: number } | null = null;
  for (const cmd of Object.keys(words) as Command[]) {
    for (const w of words[cmd]) {
      const needle = w.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (needle && new RegExp(`(^|\\s)${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`).test(text) && (!best || needle.length > best.len)) best = { cmd, len: needle.length };
    }
  }
  return best?.cmd ?? null;
}

type RecognitionCtor = new () => SpeechRecognitionLike;
interface SpeechRecognitionLike {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>>; resultIndex: number }) => void) | null;
  onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null;
  start(): void; stop(): void; abort(): void;
}

function ctor(): RecognitionCtor | null {
  const w = globalThis as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export class Listener {
  private rec: SpeechRecognitionLike | null = null;
  private wanted = false;
  error: string | null = null;

  get supported(): boolean { return ctor() !== null; }
  get active(): boolean { return this.wanted && this.rec !== null; }

  start(lang: string, words: Record<Command, string[]>, onCommand: (c: Command, heard: string) => void): void {
    const C = ctor();
    if (!C) return;
    this.stop();
    this.wanted = true;
    this.error = null;
    const rec = new C();
    rec.lang = lang; rec.continuous = true; rec.interimResults = false;
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const heard = e.results[i]?.[0]?.transcript ?? '';
        const cmd = matchCommand(heard, words);
        if (cmd) onCommand(cmd, heard);
      }
    };
    rec.onerror = (e) => { this.error = e.error; if (e.error === 'not-allowed' || e.error === 'service-not-allowed') this.wanted = false; };
    rec.onend = () => { if (this.wanted) { try { rec.start(); } catch { /* restarts next tick */ } } };
    this.rec = rec;
    try { rec.start(); } catch (err) { this.error = String(err); }
  }

  stop(): void {
    this.wanted = false;
    const r = this.rec; this.rec = null;
    if (r) { r.onend = null; try { r.abort(); } catch { /* ignore */ } }
  }
}
