import { describe, expect, it } from 'vitest';
import { parseRoute } from './router';

describe('parseRoute', () => {
  it('parses hash routes', () => {
    expect(parseRoute('')).toEqual({ name: 'home' });
    expect(parseRoute('#/')).toEqual({ name: 'home' });
    expect(parseRoute('#/edit')).toEqual({ name: 'edit', id: undefined });
    expect(parseRoute('#/edit/builtin.mma')).toEqual({ name: 'edit', id: 'builtin.mma' });
    expect(parseRoute('#/run')).toEqual({ name: 'run' });
    expect(parseRoute('#/settings')).toEqual({ name: 'settings' });
    expect(parseRoute('#/nope')).toEqual({ name: 'home' });
  });
});
