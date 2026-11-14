// How a session is read back, for the session methods. Runs no SQL of its own.
import type { Selectable } from 'kysely';
import type { SignInSessionsTable } from '../db/schema-types.ts';
import type { StoredSession } from './sign-in-store-types.ts';

export function sessionFromRow(row: Selectable<SignInSessionsTable>): StoredSession {
  return {
    sessionId: row.session_id,
    accountId: row.user_id,
    deviceLabel: row.device_label,
    signedInAt: row.signed_in_at,
    lastActiveAt: row.last_active_at,
    lastSignInAt: row.last_sign_in_at,
    passwordEnteredAt: row.password_entered_at,
    accessTokenHash: row.access_token_hash,
    accessExpiresAt: row.access_expires_at,
    ended: row.ended,
  };
}
