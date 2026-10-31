import { signal } from '@preact/signals';
import { newId, simplePlan, type SessionPlan, type Sport } from '../engine/plan';
import { safeStorage } from './settings';

export const PRESETS_KEY = 'ft.presets';

/** Built-in presets. `name` is an i18n key; user presets carry literal names. */
export function builtInPresets(): SessionPlan[] {
  const mk = (id: string, sport: Sport, rounds: number, work: number, rest: number, prep: number): SessionPlan => ({
    ...simplePlan({ rounds, work, rest, prep, name: `preset.${id}`, sport }), id: `builtin.${id}`, builtIn: true,
  });
  const emom = mk('emom', 'hiit', 10, 60, 0, 5);
  emom.cues = [{ at: 0, sound: 'beep', repeatEvery: 0 }];
  emom.sounds = { start: 'beep', end: 'bell', restEnd: 'beep', countdown: 'none' };
  const tabata = mk('tabata', 'hiit', 8, 20, 10, 10);
  tabata.cues = [{ at: 5, sound: 'beep' }];
  return [
    mk('boxing_pro', 'boxing', 12, 180, 60, 10),
    mk('boxing_amateur', 'boxing', 3, 180, 60, 10),
    mk('mma', 'mma', 3, 300, 60, 10),
    mk('mma_title', 'mma', 5, 300, 60, 10),
    mk('muaythai', 'muaythai', 5, 180, 120, 10),
    mk('kickboxing', 'kickboxing', 3, 180, 60, 10),
    mk('bjj', 'bjj', 6, 300, 60, 5),
    mk('wrestling', 'wrestling', 3, 120, 30, 5),
    tabata,
    emom,
  ];
}

export function loadUserPresets(storage: Storage | null = safeStorage()): SessionPlan[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(PRESETS_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr) ? arr.filter(isPlan) : [];
  } catch { return []; }
}

function isPlan(x: unknown): x is SessionPlan {
  if (!x || typeof x !== 'object') return false;
  const p = x as Partial<SessionPlan>;
  return p.version === 1 && typeof p.id === 'string' && Array.isArray(p.blocks) && p.blocks.length > 0 && typeof p.prep === 'number';
}

export const builtIns = builtInPresets();
export const userPresets = signal<SessionPlan[]>(loadUserPresets());

function persist(): void {
  const st = safeStorage();
  if (st) st.setItem(PRESETS_KEY, JSON.stringify(userPresets.value));
}

export function savePreset(plan: SessionPlan): SessionPlan {
  const saved: SessionPlan = { ...plan, builtIn: false, id: plan.builtIn || !plan.id ? newId() : plan.id };
  const list = userPresets.value.filter((p) => p.id !== saved.id);
  userPresets.value = [...list, saved];
  persist();
  return saved;
}

export function deletePreset(id: string): void {
  userPresets.value = userPresets.value.filter((p) => p.id !== id);
  persist();
}

export function findPreset(id: string): SessionPlan | undefined {
  return builtIns.find((p) => p.id === id) ?? userPresets.value.find((p) => p.id === id);
}
