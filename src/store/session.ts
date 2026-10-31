// Wires the scheduler, audio engine and wake lock to the UI. The scheduler
// owns time; this module pumps it from requestAnimationFrame while visible
// and from a Web Worker heartbeat while hidden (workers are not throttled
// like page timers), so cues always get queued ahead of their audio time.

import { signal } from '@preact/signals';
import { AudioEngine } from '../engine/audio';
import { Scheduler, type Snapshot } from '../engine/scheduler';
import { WakeLock } from '../engine/wakelock';
import { Voice } from '../engine/voice';
import { totals } from '../engine/plan';
import { t, locale, type Key } from '../i18n';
import { entryFromTotals, recordSession } from './history';
import type { SessionPlan } from '../engine/plan';
import { settings } from './settings';

export const scheduler = new Scheduler({ now: () => performance.now() });
export const audio = new AudioEngine();
export const wake = new WakeLock();
export const voice = new Voice();

export const snap = signal<Snapshot>(scheduler.snapshot());
export const soundReady = signal(false);
export const wasLate = signal(false);
export const activePlan = signal<SessionPlan | null>(null);

let raf = 0;
let worker: Worker | null = null;
const speechTimers = new Set<number>();

export function speak(text: string): void {
  const v = settings.value.voice;
  voice.speak(text, { lang: locale.value, name: v.name, rate: v.rate, volume: settings.value.volume });
}

function cancelSpeech(): void {
  for (const id of speechTimers) clearTimeout(id);
  speechTimers.clear();
  voice.cancel();
}

function record(completed: boolean): void {
  const plan = activePlan.value;
  if (!plan) return;
  const snapNow = scheduler.snapshot();
  const upTo = completed ? snapNow.phases.length : Math.max(0, snapNow.current);
  const tot = totals(snapNow.phases, upTo);
  if (!completed && tot.rounds === 0) return; // nothing happened, nothing to log
  recordSession(entryFromTotals(tot, { planId: plan.id, name: plan.name, builtIn: !!plan.builtIn, completed }));
}

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
    if (cue.voice && settings.value.voice.enabled) {
      const text = cue.voice.startsWith('voice.') ? t(cue.voice as Key) : cue.voice;
      const delay = Math.max(0, at - now - 150); // speech has its own onset latency
      const timer = window.setTimeout(() => speak(text), delay);
      speechTimers.add(timer);
    }
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
    if (e.status === 'finished') { void wake.disable(); record(true); }
    if (e.status === 'idle') void wake.disable();
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
  voice.warm();
  scheduler.load(plan);
  scheduler.start();
  if (settings.value.keepAwake) void wake.enable();
  if (!worker) { worker = heartbeat(); if (worker) worker.onmessage = () => { if (scheduler.currentStatus === 'running') pump(); }; }
  pump();
}

export function pauseSession(): void { audio.cancelAll(); cancelSpeech(); scheduler.pause(); snap.value = scheduler.snapshot(); }
export function resumeSession(): void { void enableSound(); scheduler.resume(); pump(); }
export function toggleSession(): void { scheduler.currentStatus === 'running' ? pauseSession() : resumeSession(); }
export function skipPhase(): void { audio.cancelAll(); cancelSpeech(); scheduler.skip(); pump(); }
export function restartPhase(): void { audio.cancelAll(); cancelSpeech(); scheduler.restartPhase(); pump(); }
export function stopSession(): void {
  audio.cancelAll(); cancelSpeech();
  if (scheduler.currentStatus === 'running' || scheduler.currentStatus === 'paused') record(false);
  scheduler.stop(); cancelAnimationFrame(raf); snap.value = scheduler.snapshot();
}
