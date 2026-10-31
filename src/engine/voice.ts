// Spoken cues through the browser's speech engine. Voice choice: a voice
// matching the locale, else any voice in the same language, else silence
// (the beep still plays). Speech is best-effort and never blocks a bell.

export interface VoiceOptions { lang: string; name?: string; rate: number; volume: number }

export class Voice {
  get supported(): boolean { return typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined'; }

  voicesFor(lang: string): SpeechSynthesisVoice[] {
    if (!this.supported) return [];
    const all = speechSynthesis.getVoices();
    const exact = all.filter((v) => v.lang.toLowerCase() === lang.toLowerCase());
    const base = lang.split('-')[0]!.toLowerCase();
    const same = all.filter((v) => v.lang.toLowerCase().startsWith(base) && !exact.includes(v));
    return [...exact, ...same];
  }

  pick(opts: VoiceOptions): SpeechSynthesisVoice | null {
    const list = this.voicesFor(opts.lang);
    return (opts.name && list.find((v) => v.name === opts.name)) || list[0] || null;
  }

  speak(text: string, opts: VoiceOptions): void {
    if (!this.supported || !text) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      const v = this.pick(opts);
      if (v) u.voice = v;
      u.lang = opts.lang;
      u.rate = opts.rate;
      u.volume = opts.volume;
      speechSynthesis.cancel(); // a late cue must not queue behind an old one
      speechSynthesis.speak(u);
    } catch { /* speech is optional */ }
  }

  cancel(): void { if (this.supported) speechSynthesis.cancel(); }

  /** Ask the engine to load voices on browsers that populate them lazily. */
  warm(): void {
    if (!this.supported) return;
    speechSynthesis.getVoices();
    speechSynthesis.addEventListener?.('voiceschanged', () => speechSynthesis.getVoices(), { once: true });
  }
}
