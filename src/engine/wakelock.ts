// Screen Wake Lock: acquired on start, re-acquired when the page becomes
// visible again, released on stop. `supported` lets the UI show a fallback
// banner where the API is missing (older iOS).

export class WakeLock {
  private sentinel: WakeLockSentinel | null = null;
  private wanted = false;
  private onVisible = () => { if (this.wanted && document.visibilityState === 'visible') void this.acquire(); };

  get supported(): boolean { return typeof navigator !== 'undefined' && 'wakeLock' in navigator; }
  get active(): boolean { return this.sentinel !== null && !this.sentinel.released; }

  async enable(): Promise<void> {
    this.wanted = true;
    document.addEventListener('visibilitychange', this.onVisible);
    await this.acquire();
  }

  async disable(): Promise<void> {
    this.wanted = false;
    document.removeEventListener('visibilitychange', this.onVisible);
    const s = this.sentinel; this.sentinel = null;
    if (s) { try { await s.release(); } catch { /* ignore */ } }
  }

  private async acquire(): Promise<void> {
    if (!this.supported || this.active) return;
    try {
      this.sentinel = await navigator.wakeLock.request('screen');
      this.sentinel.addEventListener('release', () => { if (this.sentinel?.released) this.sentinel = null; });
    } catch { this.sentinel = null; }
  }
}
