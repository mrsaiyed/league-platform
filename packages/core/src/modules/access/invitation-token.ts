// An invitation link's secret (T-226): 32 random bytes, written as 43 URL-safe
// characters. Only its SHA-256 is stored (invitations.token_hash, 0004); the token
// itself goes only into the job that emails the link. Web Crypto, which Node and
// browsers both have, so core needs no library for it.
import { z } from 'zod';

export const invitationTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** SHA-256 of the token, as 64 lower-case hex characters. */
export async function hashInvitationToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** A fresh token and its hash. */
export async function newInvitationToken(): Promise<{ token: string; tokenHash: string }> {
  const token = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  return { token, tokenHash: await hashInvitationToken(token) };
}
