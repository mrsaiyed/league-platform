import { listMyGames, type AccessReader, type Grant } from '@srleagues/core';
import { describe, expect, it } from 'vitest';
import { namesShownOf, startingNamePolicy } from '../../server/name-policy-of.ts';
import { standInGames } from '../../server/stand-in-games.ts';
import { testWorld } from '../../server/stand-in-world.test-helper.ts';
import { buildGameRows } from './build-games-view.ts';
import { runGameAction } from './run-game-action.ts';

const leagueId = '01900000-0000-7000-8000-000000000001';
const owner = '01900000-0000-7000-8000-0000000000a1';
const keeper = '01900000-0000-7000-8000-0000000000a5';
const other = '01900000-0000-7000-8000-0000000000a9';
const grants: Grant[] = [
  {
    id: '01900000-0000-7000-8000-0000000000d5',
    accountId: keeper,
    role: 'scorekeeper',
    scope: { type: 'league' },
    grantedByAccountId: owner,
    revokedAt: null,
  },
];
const access: AccessReader = {
  ownerAccountId: async () => owner,
  leagueStatus: async () => 'live',
  activeGrantsOf: async (account) => grants.filter((g) => g.accountId === account),
};

/** The made-up draft league: the same games, scored by assigned scorekeepers only (its setting). */
const assignedOnlyLeagueId = '01900000-0000-7000-8000-000000000003';

function setup(assignedOnly = false) {
  const ports = standInGames(
    testWorld(() => access),
    {
      people: { [keeper]: 'Sam' },
      namesShownOf: namesShownOf(startingNamePolicy, () => 'adult'),
    },
  );
  const league = assignedOnly ? assignedOnlyLeagueId : leagueId;
  const as = (accountId: string) => ({ leagueId: league, accountId, requestId: 'r1' });
  const games = async (accountId: string) => {
    const listed = await listMyGames(as(accountId), {}, ports.deps);
    return listed.ok ? listed.value.games : [];
  };
  return { ports, as, games };
}

describe('the games area actions', () => {
  it('saves a final score, and the game then shows it as final', async () => {
    const { ports, as, games } = setup();
    const target = (await games(owner)).find((g) => g.status === 'scheduled');
    expect(target).toBeDefined();
    const fields = {
      gameId: target?.id,
      version: String(target?.version),
      homeScore: '61',
      awayScore: '58',
    };
    expect(await runGameAction('final', fields, as(owner), ports.deps)).toEqual({ ok: true });
    const after = (await games(owner)).find((g) => g.id === target?.id);
    expect(after).toMatchObject({ status: 'final', homeScore: 61, awayScore: 58 });
    // The same score sent again (a double tap on "Yes", step 2.154) is answered as saved,
    // and changes nothing; another score from the same page is refused: the game moved on.
    expect(await runGameAction('final', fields, as(owner), ports.deps)).toEqual({ ok: true });
    expect((await games(owner)).find((g) => g.id === target?.id)).toMatchObject({
      version: after?.version,
    });
    expect(
      await runGameAction('final', { ...fields, homeScore: '60' }, as(owner), ports.deps),
    ).toEqual({ ok: false, code: 'changed-since-read' });
  });

  it('refuses a score that is not two whole numbers', async () => {
    const { ports, as, games } = setup();
    const target = (await games(owner))[0];
    const result = await runGameAction(
      'final',
      { gameId: target?.id, version: '1', homeScore: '', awayScore: '4' },
      as(owner),
      ports.deps,
    );
    expect(result).toEqual({ ok: false, code: 'invalid-input' });
  });

  it('records a forfeit, a postponement and a cancellation', async () => {
    const { ports, as, games } = setup();
    const [a, b, c] = (await games(owner)).filter((g) => g.status === 'scheduled');
    const home = a?.homeTeamId;
    expect(
      await runGameAction(
        'forfeit',
        { gameId: a?.id, version: String(a?.version), forfeitingTeamId: home },
        as(owner),
        ports.deps,
      ),
    ).toEqual({ ok: true });
    expect(
      await runGameAction(
        'postpone',
        { gameId: b?.id, version: String(b?.version) },
        as(owner),
        ports.deps,
      ),
    ).toEqual({ ok: true });
    expect(
      await runGameAction(
        'cancel',
        { gameId: c?.id, version: String(c?.version) },
        as(owner),
        ports.deps,
      ),
    ).toEqual({ ok: true });
    const status = (id: string | undefined) =>
      games(owner).then((g) => g.find((x) => x.id === id)?.status);
    expect(await status(a?.id)).toBe('forfeit');
    expect(await status(b?.id)).toBe('postponed');
    expect(await status(c?.id)).toBe('cancelled');
  });

  it('lets a scorekeeper score but not forfeit, postpone or cancel', async () => {
    const { ports, as, games } = setup();
    const mine = (await games(keeper)).find((g) => g.assignedToMe && g.status === 'scheduled');
    const fields = { gameId: mine?.id, version: String(mine?.version) };
    expect(
      await runGameAction(
        'forfeit',
        { ...fields, forfeitingTeamId: mine?.homeTeamId },
        as(keeper),
        ports.deps,
      ),
    ).toEqual({ ok: false, code: 'not-allowed' });
    expect(await runGameAction('cancel', fields, as(keeper), ports.deps)).toEqual({
      ok: false,
      code: 'not-allowed',
    });
    expect(
      await runGameAction(
        'final',
        { ...fields, homeScore: '1', awayScore: '0' },
        as(keeper),
        ports.deps,
      ),
    ).toEqual({ ok: true });
  });

  it('shows a scorekeeper only their own games when the league says assigned only', async () => {
    const { ports, as, games } = setup(true);
    const mine = await games(keeper);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((g) => g.assignedToMe)).toBe(true);
    const everything = await games(owner);
    expect(everything.length).toBeGreaterThan(mine.length);
    // A game they are not assigned to is refused even when asked for by id.
    const notMine = everything.find(
      (g) => g.status === 'scheduled' && !mine.some((m) => m.id === g.id),
    );
    const result = await runGameAction(
      'final',
      { gameId: notMine?.id, version: String(notMine?.version), homeScore: '1', awayScore: '0' },
      as(keeper),
      ports.deps,
    );
    expect(result).toEqual({ ok: false, code: 'not-allowed' });
    // And a scorekeeper is offered the score form only, with the names beside each game;
    // a game the tracker has recorded plays of offers no form at all (S-46, step 2.154).
    const rows = buildGameRows(mine, await ports.namesOf(assignedOnlyLeagueId), {
      accountId: keeper,
      isOwner: false,
      grants,
    });
    expect(rows.every((r) => (r.hasPlays ? !r.canScore : r.canScore || r.status === 'final'))).toBe(
      true,
    );
    expect(rows.some((r) => r.canForfeit || r.canPostpone || r.canCancel || r.canPutBack)).toBe(
      false,
    );
    expect(rows[0]?.homeName).not.toBe('');
  });

  it("lists none of this league's games for another league, and none for a league with none", async () => {
    const { ports, as, games } = setup();
    const ours = (await games(owner)).map((g) => g.id);
    const listOf = async (league: string) => {
      const listed = await listMyGames(
        { leagueId: league, accountId: owner, requestId: 'r' },
        {},
        ports.deps,
      );
      return listed.ok ? listed.value.games.map((g) => g.id) : [];
    };
    // The youth league has games of its own this week, never the first league's.
    const theirs = await listOf('01900000-0000-7000-8000-000000000002');
    expect(theirs.length).toBeGreaterThan(0);
    expect(theirs.some((id) => ours.includes(id))).toBe(false);
    expect(await listOf('01900000-0000-7000-8000-000000000007')).toEqual([]);
    expect(as(owner).leagueId).toBe(leagueId);
  });

  it('offers forfeit and call-off only at programs where the person may change results', async () => {
    const { ports, games } = setup();
    const list = await games(owner);
    const names = await ports.namesOf(leagueId);
    const limited = {
      accountId: other,
      isOwner: false,
      grants: [
        {
          id: '01900000-0000-7000-8000-0000000000d9',
          accountId: other,
          role: 'admin' as const,
          scope: { type: 'program' as const, id: 'some-other-program' },
          grantedByAccountId: owner,
          revokedAt: null,
        },
      ],
    };
    expect(
      buildGameRows(list, names, limited).some(
        (r) => r.canForfeit || r.canPostpone || r.canCancel || r.canPutBack,
      ),
    ).toBe(false);
    const postponed = list.map((g) => ({ ...g, status: 'postponed' }));
    const rows = buildGameRows(postponed, names, { accountId: owner, isOwner: true, grants: [] });
    expect(rows.some((r) => r.canScore || r.canForfeit)).toBe(false);
    // Step 2.158: a postponed game is offered cancelling only; a cancelled one, putting back.
    expect(rows.every((r) => r.canCancel && !r.canPostpone && !r.canPutBack)).toBe(true);
    const cancelled = list.map((g) => ({ ...g, status: 'cancelled' }));
    const back = buildGameRows(cancelled, names, { accountId: owner, isOwner: true, grants: [] });
    expect(back.every((r) => r.canPutBack && !r.canCancel && !r.canScore)).toBe(true);
  });

  it('offers postponing and cancelling a scheduled game whose line-ups a scorer’s table set', async () => {
    const { ports, games } = setup();
    const list = (await games(owner)).map((g) => ({
      ...g,
      status: 'scheduled',
      hasPlays: true,
      homeScore: null,
      awayScore: null,
    }));
    const rows = buildGameRows(list, await ports.namesOf(leagueId), {
      accountId: owner,
      isOwner: true,
      grants: [],
    });
    // Its forfeit and score are the tracker's (S-46); postponing and cancelling keep its line-ups.
    expect(rows.every((r) => r.canPostpone && r.canCancel && !r.canForfeit && !r.canScore)).toBe(
      true,
    );
  });

  it('puts a cancelled game back: scheduled again, its line in the activity log', async () => {
    const world = testWorld(() => access);
    const ports = standInGames(world, {
      people: { [keeper]: 'Sam' },
      namesShownOf: namesShownOf(startingNamePolicy, () => 'adult'),
    });
    const as = (accountId: string) => ({ leagueId, accountId, requestId: 'r1' });
    const listed = await listMyGames(as(owner), {}, ports.deps);
    const target = (listed.ok ? listed.value.games : []).find((g) => g.status === 'scheduled');
    const fields = { gameId: target?.id, version: String(target?.version) };
    expect(await runGameAction('cancel', fields, as(owner), ports.deps)).toEqual({ ok: true });
    const again = { ...fields, version: String((target?.version ?? 0) + 1) };
    // No reason, or one not on the list, is refused; a scorekeeper may not.
    expect(await runGameAction('putBack', again, as(owner), ports.deps)).toEqual({
      ok: false,
      code: 'invalid-input',
    });
    expect(
      await runGameAction('putBack', { ...again, reason: 'willBePlayed' }, as(keeper), ports.deps),
    ).toEqual({ ok: false, code: 'not-allowed' });
    expect(
      await runGameAction('putBack', { ...again, reason: 'willBePlayed' }, as(owner), ports.deps),
    ).toEqual({ ok: true });
    const read = await world.read(leagueId);
    expect(read?.games.find((g) => g.id === target?.id)).toMatchObject({
      status: 'scheduled',
      homeScore: null,
      startsAt: target?.startsAt,
    });
    expect(read?.activity.slice(-2)).toEqual([
      expect.objectContaining({ action: 'games.cancel_game', actorAccountId: owner }),
      expect.objectContaining({
        action: 'games.put_game_back',
        actorAccountId: owner,
        targetId: target?.id,
        details: { reason: 'willBePlayed', was: 'cancelled', now: 'scheduled' },
      }),
    ]);
  });

  it('refuses a score for a postponed game (game-postponed, said in a plain sentence)', async () => {
    const { ports, as, games } = setup();
    const target = (await games(owner)).find((g) => g.status === 'scheduled' && !g.hasPlays);
    const fields = { gameId: target?.id, version: String(target?.version) };
    expect(await runGameAction('postpone', fields, as(owner), ports.deps)).toEqual({ ok: true });
    expect(
      await runGameAction(
        'final',
        {
          ...fields,
          version: String((target?.version ?? 0) + 1),
          homeScore: '50',
          awayScore: '40',
        },
        as(owner),
        ports.deps,
      ),
    ).toEqual({ ok: false, code: 'game-postponed' });
    // Typed on a page drawn before it was postponed (the version it read): said the same way,
    // not as "someone changed this game".
    expect(
      await runGameAction(
        'final',
        { ...fields, homeScore: '50', awayScore: '40' },
        as(owner),
        ports.deps,
      ),
    ).toEqual({ ok: false, code: 'game-postponed' });
  });

  it('says a score typed before a game was cancelled is refused because it is cancelled', async () => {
    const { ports, as, games } = setup();
    const target = (await games(owner)).find((g) => g.status === 'scheduled' && !g.hasPlays);
    const fields = { gameId: target?.id, version: String(target?.version) };
    expect(await runGameAction('cancel', fields, as(owner), ports.deps)).toEqual({ ok: true });
    expect(
      await runGameAction(
        'final',
        { ...fields, homeScore: '50', awayScore: '40' },
        as(owner),
        ports.deps,
      ),
    ).toEqual({ ok: false, code: 'game-cancelled' });
  });
});
