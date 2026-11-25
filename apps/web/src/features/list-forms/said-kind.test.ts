import { describe, expect, it } from 'vitest';
import { saidRole } from './said-kind.ts';

describe('the line beside the thing', () => {
  it('reads a change not made out at once, and a save or a removal as a status', () => {
    expect(saidRole('error')).toBe('alert');
    expect(saidRole('saved')).toBe('status');
    expect(saidRole('removed')).toBe('status');
  });
});
