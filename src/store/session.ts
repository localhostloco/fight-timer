// Wires the scheduler, audio engine and wake lock to the UI. The scheduler
// owns time; this module pumps it from requestAnimationFrame while visible
// and from a Web Worker heartbeat while hidden (workers are not throttled
// like page timers), so cues always get queued ahead of their audio time.

import { signal } from '@preact/signals';
import { AudioEngine } from '../engine/audio';
import { Scheduler, type Snapshot } from '../engine/scheduler';
import { WakeLock } from '../engine/wakelock';
import { Voice } from '../engine/voice';
import { groupPlan, totals } from '../engine/plan';
import { Listener, type Command } from '../engine/listen';
import { t, locale, type Key } from '../i18n';
import { entryFromTotals, recordSession } from './history';
import type { SessionPlan } from '../engine/plan';
import { settings } from './settings';

export const scheduler = new Scheduler({ now: () => performance.now() });
export const audio = new AudioEngine();
export const wake = new WakeLock();
export const voice = new Voice();
export const listener = new Listener();
export const listening = signal(false);
export const heard = signal<string | null>(null);

export const snap = signal<Snapshot>(scheduler.snapshot());
export const soundReady = signal(false);
export const wasLate = signal(false);
export const activePlan = signal<SessionPlan | null>(null);

// Staggered groups: group 0 is `scheduler`; the rest run in lock-step on the same clock.
const extra: Scheduler[] = [];
export const groupSnaps = signal<Snapshot[]>([]);
const allSchedulers = () => [scheduler, ...extra];

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
  for (const g of extra) {
    for (const { cue } of g.tick(now)) audio.schedule(cue.sound, now, now);
    for (const { cue, at } of g.dueCues(now)) audio.schedule(cue.sound, at, now);
  }
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
  if (extra.length) groupSnaps.value = allSchedulers().map((g) => g.snapshot(now));
}

export function sendCommand(c: Command): void {
  if (c === 'pause') pauseSession();
  else if (c === 'resume') resumeSession();
  else if (c === 'skip') skipPhase();
  else if (c === 'stop') stopSession();
}

const COMMAND_KEYS = { pause: 'cmd.pause', resume: 'cmd.resume', skip: 'cmd.skip', stop: 'cmd.stop' } as const;

export function startListening(): void {
  if (!listener.supported) return;
  const words = Object.fromEntries(Object.entries(COMMAND_KEYS).map(([c, k]) => [c, t(k as Key).split(',').map((w) => w.trim())])) as Record<Command, string[]>;
  listener.start(locale.value, words, (c, text) => { heard.value = text; sendCommand(c); });
  listening.value = true;
}

export function stopListening(): void { listener.stop(); listening.value = false; heard.value = null; }

function frame(): void {
  pump();
  if (allSchedulers().some((g) => g.currentStatus === 'running')) raf = requestAnimationFrame(frame);
}

scheduler.on((e) => {
  if (e.type === 'late') wasLate.value = true;
  if (e.type === 'status') {
    if (e.status === 'running') { cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); }
    if (e.status === 'finished') { record(true); if (listening.value) stopListening(); if (!extra.some((g) => g.currentStatus === 'running')) void wake.disable(); }
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
  const seed = (Date.now() % 100000) + 1;
  extra.length = 0;
  for (let k = 1; k < (plan.groups?.count ?? 1); k++) {
    const g = new Scheduler({ now: () => performance.now() });
    g.load(groupPlan(plan, k), seed + k);
    extra.push(g);
  }
  scheduler.load(plan, seed);
  scheduler.start();
  for (const g of extra) g.start();
  groupSnaps.value = extra.length ? allSchedulers().map((g) => g.snapshot()) : [];
  if (settings.value.voiceControl && !listening.value) startListening();
  if (settings.value.fightNight && !settings.value.tvMode) settings.value = { ...settings.value, tvMode: true };
  if (settings.value.keepAwake) void wake.enable();
  if (!worker) { worker = heartbeat(); if (worker) worker.onmessage = () => { if (scheduler.currentStatus === 'running') pump(); }; }
  pump();
}

export function pauseSession(): void { audio.cancelAll(); cancelSpeech(); for (const g of allSchedulers()) g.pause(); pump(); }
export function resumeSession(): void { void enableSound(); for (const g of allSchedulers()) g.resume(); pump(); }
export function toggleSession(): void { scheduler.currentStatus === 'running' ? pauseSession() : resumeSession(); }
export function skipPhase(): void { audio.cancelAll(); cancelSpeech(); for (const g of allSchedulers()) g.skip(); pump(); }
export function restartPhase(): void { audio.cancelAll(); cancelSpeech(); for (const g of allSchedulers()) g.restartPhase(); pump(); }
export function stopSession(): void {
  audio.cancelAll(); cancelSpeech();
  if (scheduler.currentStatus === 'running' || scheduler.currentStatus === 'paused') record(false);
  for (const g of allSchedulers()) g.stop();
  extra.length = 0; groupSnaps.value = [];
  cancelAnimationFrame(raf); snap.value = scheduler.snapshot();
  if (listening.value) stopListening();
}
