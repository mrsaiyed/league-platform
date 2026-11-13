import { describe, expect, it } from 'vitest';
import { roles } from './roles.ts';
import { availableScopeTypes, roleScopeTypes, scopeInput } from './scopes.ts';

describe('scopes', () => {
  it('match the database: league roles at league or program, club and team roles there', () => {
    expect(Object.keys(roleScopeTypes).sort()).toEqual([...roles].sort());
    expect(roleScopeTypes.club_admin).toEqual(['club']);
    expect(roleScopeTypes.coach).toEqual(['team']);
    expect(roleScopeTypes.captain).toEqual(['team']);
    expect(availableScopeTypes).toEqual(['league', 'program']);
  });

  it('read an id in lower case, and need one for anything but the league', () => {
    const id = '01900000-0000-7000-8000-0000000000AB';
    expect(scopeInput.parse({ type: 'program', id })).toEqual({
      type: 'program',
      id: id.toLowerCase(),
    });
    expect(scopeInput.parse({ type: 'league' })).toEqual({ type: 'league' });
    expect(scopeInput.safeParse({ type: 'team' }).success).toBe(false);
  });
});
