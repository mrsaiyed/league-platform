import { listMyGames, type AccessReader, type Grant } from '@srleagues/core';
import { describe, expect, it } from 'vitest';
import { standInGames } from '../../server/stand-in-games.ts';
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

function setup(assignedOnly = false) {
  const ports = standInGames({
    leagueId,
    people: { [keeper]: 'Sam' },
    assignees: [keeper, other],
    accessOf: () => access,
    log: () => {},
    ...(assignedOnly
      ? {
          settings: {
            'games.whoMayScore': [
              { level: 'league' as const, document: { version: 1, value: 'assignedOnly' } },
            ],
          },
        }
      : {}),
  });
  const as = (accountId: string) => ({ leagueId, accountId, requestId: 'r1' });
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
    // Saving it again from the same page is refused: the game moved on.
    expect(await runGameAction('final', fields, as(owner), ports.deps)).toEqual({
      ok: false,
      code: 'changed-since-read',
    });
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
    // And a scorekeeper is offered the score form only, with the names beside each game.
    const rows = buildGameRows(mine, await ports.namesOf(leagueId), {
      accountId: keeper,
      isOwner: false,
      grants,
    });
    expect(rows.every((r) => r.canScore || r.status === 'final')).toBe(true);
    expect(rows.some((r) => r.canForfeit || r.canCallOff)).toBe(false);
    expect(rows[0]?.homeName).not.toBe('');
  });

  it('lists no games for another league', async () => {
    const { ports, as } = setup();
    const listed = await listMyGames(
      { leagueId: '01900000-0000-7000-8000-000000000002', accountId: owner, requestId: 'r' },
      {},
      ports.deps,
    );
    expect(listed.ok && listed.value.games).toEqual([]);
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
    expect(buildGameRows(list, names, limited).some((r) => r.canForfeit || r.canCallOff)).toBe(
      false,
    );
    const postponed = list.map((g) => ({ ...g, status: 'postponed' }));
    const rows = buildGameRows(postponed, names, { accountId: owner, isOwner: true, grants: [] });
    expect(rows.some((r) => r.canScore || r.canForfeit)).toBe(false);
  });
});
