import { describe, expect, it } from 'vitest';
import { displayLabels } from './display-labels.ts';
import { createTranslator } from './messages.ts';

describe('display labels', () => {
  it('finds every word the shared display pieces need in the message file', () => {
    const labels = displayLabels(createTranslator('en'));
    const words: string[] = [];
    const walk = (v: unknown) => {
      if (typeof v === 'string') words.push(v);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    walk(labels);
    expect(words.length).toBeGreaterThan(20);
    expect(words.every((w) => w.trim().length > 0)).toBe(true);
    expect(labels.game.live).toBe('Live');
  });
});
