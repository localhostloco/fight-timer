import { describe, expect, it } from 'vitest';
import { parseDuration } from './Editor';

describe('parseDuration', () => {
  it('accepts m:ss and plain seconds, rejects junk', () => {
    expect(parseDuration('3:00')).toBe(180);
    expect(parseDuration('0:05')).toBe(5);
    expect(parseDuration(' 45 ')).toBe(45);
    expect(parseDuration('12:5')).toBe(725);
    expect(parseDuration('abc')).toBeNull();
    expect(parseDuration('1:2:3')).toBeNull();
  });
});
