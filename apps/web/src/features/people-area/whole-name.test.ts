// A whole name typed into the first-name box is asked about before saving (step 2.146).
import { describe, expect, it } from 'vitest';
import { wholeNameInFirst } from './whole-name.ts';

describe('wholeNameInFirst', () => {
  it('asks when the first name ends with the last name, or the last name is empty', () => {
    expect(wholeNameInFirst('Sam Rivera', 'Rivera')).toBe(true);
    expect(wholeNameInFirst(' sam  rivera ', 'RIVERA')).toBe(true);
    expect(wholeNameInFirst('Sam Rivera', '')).toBe(true);
  });

  it('lets a first name of two words and a one-word first name through', () => {
    expect(wholeNameInFirst('Mary Ann', 'Smith')).toBe(false);
    expect(wholeNameInFirst('Sam', 'Rivera')).toBe(false);
    expect(wholeNameInFirst('Sam', '')).toBe(false);
  });
});
