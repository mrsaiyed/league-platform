// How role_grants and invitations rows become the access module's shapes (T-29),
// field by field, and the columns the queries read for them. Runs no SQL itself.
import { roles, type Grant, type Invitation, type InvitationStatus, type Role, type Scope } from '@srleagues/core';
import { sql } from 'kysely';

export const grantColumns = [
  'id',
  'account_id',
  'role',
  'scope_type',
  'scope_id',
  'granted_by_account_id',
  'revoked_at',
] as const;

export const invitationColumns = [
  'id',
  'email',
  'role',
  'scope_type',
  'scope_id',
  'invited_by_account_id',
  'expires_at',
] as const;

/** An invitation's state by the database's own clock, so no caller's clock decides expiry. */
export const invitationStatus = () =>
  sql<string>`case
    when accepted_at is not null then 'accepted'
    when cancelled_at is not null then 'cancelled'
    when expires_at <= now() then 'expired'
    else 'pending' end`.as('status');

function roleOf(value: string): Role {
  const role = roles.find((r) => r === value);
  if (role === undefined) throw new Error('A grant has a role the access module does not know.');
  return role;
}

function scopeOf(type: string, id: string | null): Scope {
  if (type === 'league' && id === null) return { type: 'league' };
  if ((type === 'program' || type === 'club' || type === 'team') && id !== null) {
    return { type, id };
  }
  throw new Error('A grant or invitation has a scope the access module does not know.');
}

function statusOf(value: string): InvitationStatus {
  if (value === 'pending' || value === 'expired' || value === 'accepted' || value === 'cancelled') {
    return value;
  }
  throw new Error('An invitation has a state the access module does not know.');
}

type GrantRow = {
  id: string;
  account_id: string;
  role: string;
  scope_type: string;
  scope_id: string | null;
  granted_by_account_id: string | null;
  revoked_at: Date | null;
};

export function grantFromRow(row: GrantRow): Grant {
  return {
    id: row.id,
    accountId: row.account_id,
    role: roleOf(row.role),
    scope: scopeOf(row.scope_type, row.scope_id),
    grantedByAccountId: row.granted_by_account_id,
    revokedAt: row.revoked_at === null ? null : row.revoked_at.toISOString(),
  };
}

type InvitationRow = {
  id: string;
  email: string;
  role: string;
  scope_type: string;
  scope_id: string | null;
  invited_by_account_id: string | null;
  expires_at: Date;
  status: string;
};

export function invitationFromRow(row: InvitationRow): Invitation {
  return {
    id: row.id,
    email: row.email,
    role: roleOf(row.role),
    scope: scopeOf(row.scope_type, row.scope_id),
    status: statusOf(row.status),
    invitedByAccountId: row.invited_by_account_id,
    expiresAt: row.expires_at.toISOString(),
  };
}

/** A scope as the two columns (scope_type, scope_id). */
export function scopeColumns(scope: Scope): { scope_type: string; scope_id: string | null } {
  return scope.type === 'league'
    ? { scope_type: 'league', scope_id: null }
    : { scope_type: scope.type, scope_id: scope.id };
}
