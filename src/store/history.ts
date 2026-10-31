import { signal } from '@preact/signals';
import { safeStorage } from './settings';
import type { Totals } from '../engine/plan';

export const HISTORY_KEY = 'ft.history';
export const HISTORY_MAX = 50;

export interface HistoryEntry {
  at: string;        // ISO date-time
  planId?: string;
  name: string;      // literal or i18n key for built-ins
  builtIn: boolean;
  rounds: number;
  work: number;
  rest: number;
  total: number;
  completed: boolean; // false when stopped early
}

export function loadHistory(storage: Storage | null = safeStorage()): HistoryEntry[] {
  if (!storage) return [];
  try {
    const arr = JSON.parse(storage.getItem(HISTORY_KEY) ?? '[]') as unknown;
    return Array.isArray(arr) ? arr.filter((e): e is HistoryEntry => !!e && typeof e === 'object' && typeof (e as HistoryEntry).at === 'string' && typeof (e as HistoryEntry).total === 'number') : [];
  } catch { return []; }
}

export const history = signal<HistoryEntry[]>(loadHistory());

export function recordSession(entry: Omit<HistoryEntry, 'at'> & { at?: string }, storage: Storage | null = safeStorage()): HistoryEntry[] {
  const e: HistoryEntry = { at: new Date().toISOString(), ...entry };
  const next = [e, ...history.value].slice(0, HISTORY_MAX);
  history.value = next;
  if (storage) storage.setItem(HISTORY_KEY, JSON.stringify(next));
  return next;
}

export function entryFromTotals(t: Totals, meta: { planId?: string; name: string; builtIn: boolean; completed: boolean }): Omit<HistoryEntry, 'at'> {
  return { ...meta, rounds: t.rounds, work: t.work, rest: t.rest, total: t.total };
}

export function clearHistory(storage: Storage | null = safeStorage()): void {
  history.value = [];
  if (storage) storage.removeItem(HISTORY_KEY);
}
