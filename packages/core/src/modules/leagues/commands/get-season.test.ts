import { defaultSeasonRules } from '@srleagues/contracts';
import { describe, expect, it } from 'vitest';
import { memoryLeagues, ownerId, staffId } from '../memory-leagues.test-helper.ts';
import { getSeason } from './get-season.ts';

const id = (n: number) => `01900000-0000-7000-8000-0000000000c${n}`;
const seasons = [{ id: id(1), programId: 'program-default', slug: 'one', isCurrent: true }];

describe('getSeason', () => {
  it('shows the starting rules while none are saved, and names no program in a one-program league (U-3)', async () => {
    const { deps, as } = memoryLeagues({ seasons });
    const result = await getSeason(as(ownerId), { seasonId: id(1) }, deps);
    expect(result).toMatchObject({
      ok: true,
      value: { id: id(1), rulesSaved: false, rules: defaultSeasonRules(), version: 1 },
    });
    if (result.ok) expect('programId' in result.value).toBe(false);
  });

  it('names the program when the league has several', async () => {
    const { deps, as } = memoryLeagues({
      seasons,
      programs: [
        { id: 'program-default', slug: 'main', isDefault: true },
        { id: 'p2', slug: 'youth', isDefault: false },
      ],
    });
    const result = await getSeason(as(ownerId), { seasonId: id(1) }, deps);
    expect(result).toMatchObject({ ok: true, value: { programId: 'program-default' } });
  });

  it('refuses a missing season and non-admins', async () => {
    const { deps, as } = memoryLeagues({ seasons });
    expect(await getSeason(as(ownerId), { seasonId: id(9) }, deps)).toMatchObject({
      error: { code: 'season-not-found' },
    });
    expect(await getSeason(as(staffId), { seasonId: id(1) }, deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
  });
});
