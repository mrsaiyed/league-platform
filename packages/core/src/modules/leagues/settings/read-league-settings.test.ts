import { describe, expect, it } from 'vitest';
import type { Grant } from '../../access/index.ts';
import { memoryLeagues, ownerId, staffId } from '../memory-leagues.test-helper.ts';
import { readLeagueSettings } from './read-league-settings.ts';

const adminId = '01900000-0000-7000-8000-0000000000d1';
const programAdminId = '01900000-0000-7000-8000-0000000000d2';
const schedulerId = '01900000-0000-7000-8000-0000000000d3';
const grantOf = (n: number, accountId: string, role: Grant['role'], scope: Grant['scope']) =>
  ({
    id: `01900000-0000-7000-8000-0000000000f${n}`,
    accountId,
    role,
    scope,
    grantedByAccountId: ownerId,
    revokedAt: null,
  }) as Grant;
const grants = [
  grantOf(1, adminId, 'admin', { type: 'league' }),
  grantOf(2, programAdminId, 'admin', { type: 'program', id: 'program-default' }),
  grantOf(3, schedulerId, 'scheduler', { type: 'league' }),
];

describe('readLeagueSettings (step 2.227, T-474)', () => {
  it('gives the owner and a league-wide admin every setting, who plays and whether a child is recorded', async () => {
    for (const who of [ownerId, adminId]) {
      const { deps, as } = memoryLeagues({ grants, audience: 'youth', recordedChild: true });
      const result = await readLeagueSettings(as(who), {}, deps);
      expect(result).toMatchObject({
        ok: true,
        value: {
          facts: { audience: 'youth', hasRecordedChild: true },
          league: { status: 'draft' },
          profile: { audience: 'youth' },
        },
      });
      expect(result.ok && result.value.rows.length).toBeGreaterThan(0);
      expect(result.ok && result.value.checks.length).toBeGreaterThan(0);
    }
  });

  it('refuses an admin limited to one program, a scheduler, staff and nobody signed in', async () => {
    const { deps, as } = memoryLeagues({ grants });
    for (const who of [programAdminId, schedulerId, staffId, null]) {
      expect(await readLeagueSettings(as(who), {}, deps)).toMatchObject({
        error: { code: 'not-allowed' },
      });
    }
  });

  it('is read in an archived league too, as the page is', async () => {
    const { deps, as } = memoryLeagues({
      grants,
      league: {
        id: '01900000-0000-7000-8000-000000000001',
        name: 'Old name',
        slug: 'old-name',
        status: 'archived',
        ownerAccountId: ownerId,
        version: 3,
      },
    });
    expect(await readLeagueSettings(as(adminId), {}, deps)).toMatchObject({ ok: true });
  });
});
