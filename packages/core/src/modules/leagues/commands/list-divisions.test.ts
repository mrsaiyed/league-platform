import { describe, expect, it } from 'vitest';
import { division, seasonId, seasons } from '../division-test-data.test-helper.ts';
import { memoryLeagues, ownerId } from '../memory-leagues.test-helper.ts';
import { listDivisions } from './list-divisions.ts';

describe('listDivisions', () => {
  it("lists the season's divisions in order, leaving out the bin", async () => {
    const { deps, as } = memoryLeagues({
      seasons,
      divisions: [
        division(1, { sort: 2 }),
        division(2, { sort: 1 }),
        division(3, { binned: true }),
      ],
    });
    const result = await listDivisions(as(ownerId), { seasonId }, deps);
    expect(result.ok && result.value.map((d) => d.name)).toEqual(['Division 2', 'Division 1']);
  });

  it('works in an archived league, and refuses those without the permission', async () => {
    const { db, deps, as } = memoryLeagues({ seasons, divisions: [division(1)] });
    if (db.state.league !== undefined) db.state.league = { ...db.state.league, status: 'archived' };
    expect(await listDivisions(as(ownerId), { seasonId }, deps)).toMatchObject({ ok: true });
    expect(await listDivisions(as('someone'), { seasonId }, deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
  });
});
