// Wires the scheduler, audio engine and wake lock to the UI. The scheduler
// owns time; this module pumps it from requestAnimationFrame while visible
// and from a Web Worker heartbeat while hidden (workers are not throttled
// like page timers), so cues always get queued ahead of their audio time.

import { signal } from '@preact/signals';
import { AudioEngine } from '../engine/audio';
import { Scheduler, type Snapshot } from '../engine/scheduler';
import { WakeLock } from '../engine/wakelock';
import type { SessionPlan } from '../engine/plan';
import { settings } from './settings';

export const scheduler = new Scheduler({ now: () => performance.now() });
export const audio = new AudioEngine();
export const wake = new WakeLock();

export const snap = signal<Snapshot>(scheduler.snapshot());
export const soundReady = signal(false);
export const wasLate = signal(false);
export const activePlan = signal<SessionPlan | null>(null);

let raf = 0;
let worker: Worker | null = null;

function heartbeat(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  try {
    const src = 'setInterval(() => postMessage(0), 250)';
    return new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
  } catch { return null; }
}

function pump(): void {
  const now = performance.now();
  const late = scheduler.tick(now);
  for (const { cue } of late) audio.schedule(cue.sound, now, now);
  for (const { cue, at } of scheduler.dueCues(now)) {
    audio.schedule(cue.sound, at, now);
    if (settings.value.vibrate && cue.kind !== 'countdown' && 'vibrate' in navigator) {
      const delay = Math.max(0, at - now);
      setTimeout(() => { try { navigator.vibrate(cue.kind === 'start' || cue.kind === 'final' ? [200, 100, 200] : 120); } catch { /* ignore */ } }, delay);
    }
  }
  snap.value = scheduler.snapshot(now);
}

function frame(): void {
  pump();
  if (scheduler.currentStatus === 'running') raf = requestAnimationFrame(frame);
}

scheduler.on((e) => {
  if (e.type === 'late') wasLate.value = true;
  if (e.type === 'status') {
    if (e.status === 'running') { cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); }
    if (e.status === 'finished' || e.status === 'idle') void wake.disable();
  }
  snap.value = scheduler.snapshot();
});

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { void audio.unlock(); pump(); }
  });
}

export async function enableSound(): Promise<boolean> {
  soundReady.value = await audio.unlock();
  audio.setVolume(settings.value.volume);
  return soundReady.value;
}

export function startSession(plan: SessionPlan): void {
  activePlan.value = plan;
  wasLate.value = false;
  void enableSound();
  scheduler.load(plan);
  scheduler.start();
  if (settings.value.keepAwake) void wake.enable();
  if (!worker) { worker = heartbeat(); if (worker) worker.onmessage = () => { if (scheduler.currentStatus === 'running') pump(); }; }
  pump();
}

export function pauseSession(): void { audio.cancelAll(); scheduler.pause(); snap.value = scheduler.snapshot(); }
export function resumeSession(): void { void enableSound(); scheduler.resume(); pump(); }
export function toggleSession(): void { scheduler.currentStatus === 'running' ? pauseSession() : resumeSession(); }
export function skipPhase(): void { audio.cancelAll(); scheduler.skip(); pump(); }
export function restartPhase(): void { audio.cancelAll(); scheduler.restartPhase(); pump(); }
export function stopSession(): void { audio.cancelAll(); scheduler.stop(); cancelAnimationFrame(raf); snap.value = scheduler.snapshot(); }
