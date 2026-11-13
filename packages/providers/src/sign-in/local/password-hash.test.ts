import { describe, expect, it } from 'vitest';
import { scryptPasswordHasher as hasher } from './password-hash.ts';

describe('the stand-in password hash', () => {
  it('keeps no readable password and matches only the same one', async () => {
    const stored = await hasher.hash('correct horse battery');
    expect(stored.key.toString('utf8')).not.toContain('correct');
    expect(await hasher.matches('correct horse battery', stored)).toBe(true);
    expect(await hasher.matches('correct horse batterY', stored)).toBe(false);
  });

  it('salts each hash, so the same password hashes differently', async () => {
    const a = await hasher.hash('same password');
    const b = await hasher.hash('same password');
    expect(a.salt.equals(b.salt)).toBe(false);
    expect(a.key.equals(b.key)).toBe(false);
  });

  it('refuses with no stored hash, still doing the work of a check', async () => {
    expect(await hasher.matches('anything at all', undefined)).toBe(false);
  });
});
