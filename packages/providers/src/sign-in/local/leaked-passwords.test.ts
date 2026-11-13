import { describe, expect, it } from 'vitest';
import { newPassword } from '@srleagues/contracts';
import { sampleLeakedPasswords } from './leaked-passwords.ts';

describe('the sample of leaked passwords', () => {
  it('holds only entries a new password could otherwise be, in lower case, once each', () => {
    for (const entry of sampleLeakedPasswords) {
      expect(newPassword.safeParse(entry).success).toBe(true);
      expect(entry).toBe(entry.toLowerCase());
    }
    expect(new Set(sampleLeakedPasswords).size).toBe(sampleLeakedPasswords.length);
  });
});
