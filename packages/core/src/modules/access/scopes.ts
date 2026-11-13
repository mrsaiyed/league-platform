// Where a role applies (T3 §5): the whole league, one program, a club or a team
// (P4 §4: "volleyball scheduler"). The league roles may be limited to a program; a
// club admin is for a club; a coach or captain is for a team.
import { z } from 'zod';
import type { Role } from './roles.ts';

export const scopeTypes = ['league', 'program', 'club', 'team'] as const;
export type ScopeType = (typeof scopeTypes)[number];

export type Scope =
  | { readonly type: 'league' }
  | { readonly type: 'program' | 'club' | 'team'; readonly id: string };

export const leagueScope: Scope = { type: 'league' };

/** The scopes each role may have (the same rule as role_grants_role_fits_scope, 0004). */
export const roleScopeTypes: Readonly<Record<Role, readonly ScopeType[]>> = {
  admin: ['league', 'program'],
  registrar: ['league', 'program'],
  scheduler: ['league', 'program'],
  editor: ['league', 'program'],
  scorekeeper: ['league', 'program'],
  club_admin: ['club'],
  coach: ['team'],
  captain: ['team'],
};

/**
 * The scopes a grant can point at today. Clubs and teams have no tables yet, so the
 * database refuses those scopes (0004, *_scope_available) until they do.
 */
export const availableScopeTypes: readonly ScopeType[] = ['league', 'program'];

/** A scope as a command's input, its id in lower case as the database reads it. */
export const scopeInput = z
  .discriminatedUnion('type', [
    z.object({ type: z.literal('league') }),
    z.object({ type: z.enum(['program', 'club', 'team']), id: z.uuid() }),
  ])
  .transform((s): Scope => (s.type === 'league' ? leagueScope : { ...s, id: s.id.toLowerCase() }));

/**
 * Whether a grant at `granted` reaches `wanted`. A league grant reaches everything
 * in the league; any other grant reaches only its own program, club or team. (A
 * program grant will reach that program's clubs and teams once they exist.)
 */
export function covers(granted: Scope, wanted: Scope): boolean {
  if (granted.type === 'league') return true;
  if (wanted.type === 'league') return false;
  return granted.type === wanted.type && granted.id === wanted.id;
}

/** A scope as two plain fields, for the activity log's details. */
export function scopeDetails(scope: Scope): { scopeType: ScopeType; scopeId: string | null } {
  return { scopeType: scope.type, scopeId: scope.type === 'league' ? null : scope.id };
}

export function sameScope(a: Scope, b: Scope): boolean {
  if (a.type === 'league' || b.type === 'league') return a.type === b.type;
  return a.type === b.type && a.id === b.id;
}
