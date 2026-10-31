import { beforeEach, describe, expect, it } from 'vitest';
import { HISTORY_MAX, clearHistory, history, loadHistory, recordSession } from './history';

const mem = (): Storage => { const m = new Map<string, string>(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) } as Storage; };

describe('history', () => {
  beforeEach(() => { history.value = []; });
  it('records newest first and caps at 50', () => {
    const st = mem();
    for (let i = 0; i < HISTORY_MAX + 5; i++) recordSession({ name: `s${i}`, builtIn: false, rounds: 1, work: 1, rest: 0, total: 1, completed: true }, st);
    expect(history.value.length).toBe(HISTORY_MAX);
    expect(history.value[0]!.name).toBe(`s${HISTORY_MAX + 4}`);
    expect(loadHistory(st).length).toBe(HISTORY_MAX);
    clearHistory(st);
    expect(loadHistory(st)).toEqual([]);
  });
  it('ignores corrupt entries', () => {
    const st = mem(); st.setItem('ft.history', '[1,{"at":"x","total":3},{"nope":1}]');
    expect(loadHistory(st).length).toBe(1);
  });
});
