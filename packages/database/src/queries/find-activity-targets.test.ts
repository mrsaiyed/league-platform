// findActivityTargets against the real database (step 2.77): one read names each kind of
// thing a page of the activity log points at, finds a team in the bin, and never names
// another league's thing. The two-league case is in ../isolation (bin-cases.test-helper.ts).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTransaction } from '../db/with-transaction.ts';
import { openTwoLeagues, type TwoLeagues } from '../isolation/two-leagues.test-helper.ts';
import { findActivityTargets, type ActivityTargetAsk } from './find-activity-targets.ts';

let leagues: TwoLeagues;
beforeAll(async () => {
  leagues = await openTwoLeagues();
});
afterAll(async () => {
  await leagues.close();
});

const asOwnerOfA = (asks: readonly ActivityTargetAsk[]) =>
  withTransaction(
    leagues.db,
    { leagueId: leagues.a.leagueId, accountId: leagues.a.ownerId },
    (scope) => findActivityTargets(scope, asks),
  );

describe('findActivityTargets', () => {
  it('names a team, a person, a game, a season, a division, a venue and an adjustment', async () => {
    const { a } = leagues;
    const found = await asOwnerOfA([
      { kind: 'team', id: a.teamId },
      { kind: 'person', id: a.personId },
      { kind: 'game', id: a.gameId },
      { kind: 'season', id: a.seasonId },
      { kind: 'division', id: a.divisionId },
      { kind: 'venue', id: a.venueId },
      { kind: 'adjustment', id: a.standingsAdjustmentId },
    ]);
    expect(found.map((f) => f.kind).sort()).toEqual(
      ['adjustment', 'division', 'game', 'person', 'season', 'team', 'venue'].sort(),
    );
    const game = found.find((f) => f.kind === 'game');
    expect(game?.kind === 'game' && game.homeName !== '' && game.awayName !== '').toBe(true);
    const person = found.find((f) => f.kind === 'person');
    expect(person?.kind === 'person' && `${person.firstName}${person.lastName}` !== '').toBe(true);
  });

  it('finds a team in the bin, as it is named now', async () => {
    const { a, pglite } = leagues;
    await pglite.query(
      "update teams set name = 'Renamed Herons', deleted_at = now() where id = $1",
      [a.opponentId],
    );
    const found = await asOwnerOfA([{ kind: 'team', id: a.opponentId }]);
    expect(found).toEqual([{ kind: 'team', id: a.opponentId, name: 'Renamed Herons' }]);
  });

  it("finds nothing of another league's, nor an id that is not one", async () => {
    const { b } = leagues;
    expect(
      await asOwnerOfA([
        { kind: 'team', id: b.teamId },
        { kind: 'person', id: b.personId },
        { kind: 'team', id: 'not-an-id' },
      ]),
    ).toEqual([]);
    expect(await asOwnerOfA([])).toEqual([]);
  });
});
