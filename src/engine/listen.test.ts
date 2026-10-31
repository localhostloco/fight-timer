import { describe, expect, it } from 'vitest';
import { matchCommand } from './listen';

const words = { pause: ['pause', 'pausa', 'tempo'], resume: ['go', 'vai', 'continua'], skip: ['skip', 'pula', 'próximo'], stop: ['stop session', 'parar sessão'] };

describe('matchCommand', () => {
  it('matches whole words in any language, ignoring accents and case', () => {
    expect(matchCommand('Pause', words)).toBe('pause');
    expect(matchCommand('ok vai', words)).toBe('resume');
    expect(matchCommand('proximo', words)).toBe('skip');
    expect(matchCommand('PARAR SESSAO agora', words)).toBe('stop');
  });
  it('prefers the longest phrase and ignores partial words', () => {
    expect(matchCommand('stop session', { ...words, pause: ['stop'] })).toBe('stop');
    expect(matchCommand('goal', words)).toBeNull();
    expect(matchCommand('', words)).toBeNull();
  });
});
