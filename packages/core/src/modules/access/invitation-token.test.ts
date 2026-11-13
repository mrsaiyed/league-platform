import { describe, expect, it } from 'vitest';
import { hashInvitationToken, invitationTokenSchema, newInvitationToken } from './invitation-token.ts';

describe('invitation tokens', () => {
  it('are 43 URL-safe characters, different every time, hashed as the table expects', async () => {
    const a = await newInvitationToken();
    const b = await newInvitationToken();
    expect(a.token).not.toBe(b.token);
    expect(invitationTokenSchema.safeParse(a.token).success).toBe(true);
    expect(a.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashInvitationToken(a.token)).toBe(a.tokenHash);
  });

  it('hash as SHA-256', async () => {
    expect(await hashInvitationToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
