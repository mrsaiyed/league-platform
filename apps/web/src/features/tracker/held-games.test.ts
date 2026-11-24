import { createTranslator } from '@srleagues/site';
import { describe, expect, it } from 'vitest';
import {
  dismissQuestion,
  heldGameHref,
  heldGameMark,
  heldGames,
  heldGameWords,
  type HeldGame,
} from './held-games.ts';
import type { OpenedGame } from './opened-game-storage.ts';
import type { QueuedCommand } from './queue-storage.ts';

const t = createTranslator('en');
const league = 'league-1';
const otherLeague = 'league-2';
const account = 'account-1';
const otherAccount = 'account-2';
const mine = { leagueId: league, accountId: account };
const player = '00000000-0000-4000-8000-0000000000b1';

let made = 0;
const row = (
  gameId: string,
  at: number,
  extra: {
    readonly leagueId?: string;
    readonly accountId?: string;
    /** Stored before the maker was kept with each play: nobody's (T-323). */
    readonly noMaker?: true;
    readonly state?: 'waiting' | 'not-saved';
  } = {},
): QueuedCommand => ({
  gameId,
  protocolVersion: 2,
  command: {
    commandId: `00000000-0000-4000-8000-${(made += 1).toString(16).padStart(12, '0')}`,
    at,
    input: { type: 'score', side: 'home', playerId: player, points: 2 },
  },
  ...(extra.leagueId === undefined ? {} : { leagueId: extra.leagueId }),
  ...(extra.noMaker === true ? {} : { accountId: extra.accountId ?? account }),
  state: extra.state ?? 'waiting',
});

const team = (name: string) => ({ teamId: name, name, players: [] });
const keptGame = (gameId: string, leagueId: string, accountId = account): OpenedGame => ({
  gameId,
  leagueId,
  accountId,
  rosters: { home: team('Hawks'), away: team('Bears'), uniqueJerseys: true },
  rostersSavedAt: 0,
  state: null,
  confirmedFormat: null,
});

describe('the games this device holds plays for (step 2.38, S-88)', () => {
  it('lists each game once, however old, with what waits and what was not saved', () => {
    const queue = [
      row('old', 1_000, { leagueId: league }),
      row('old', 2_000, { leagueId: league, state: 'not-saved' }),
      row('old', 3_000, { leagueId: league }),
      row('new', 9_000, { leagueId: league }),
    ];
    const kept = new Map([['old', keptGame('old', league)]]);
    expect(heldGames(queue, mine, (id) => kept.get(id))).toEqual([
      { gameId: 'new', waiting: 1, notSaved: 0, lastTapAt: 9_000, teams: null },
      {
        gameId: 'old',
        waiting: 2,
        notSaved: 1,
        lastTapAt: 3_000,
        teams: { home: 'Hawks', away: 'Bears' },
      },
    ]);
  });

  it('lists only this league’s games, by the league kept with the plays or the game', () => {
    const queue = [
      row('mine', 1, { leagueId: league }),
      row('theirs', 2, { leagueId: otherLeague }),
      // Stored before the league was kept with each play: the kept game says.
      row('kept-theirs', 3),
      row('kept-mine', 4),
      // Nothing more is known: listed in every league, rather than lost.
      row('unknown', 5),
    ];
    const kept = new Map([
      ['kept-theirs', keptGame('kept-theirs', otherLeague)],
      ['kept-mine', keptGame('kept-mine', league)],
      // Kept by the other league, though the plays say this one: no names from it.
      ['mine', keptGame('mine', otherLeague)],
    ]);
    const listed = heldGames(queue, mine, (id) => kept.get(id));
    expect(listed.map((game) => [game.gameId, game.teams?.home ?? null])).toEqual([
      ['unknown', null],
      ['kept-mine', 'Hawks'],
      ['mine', null],
    ]);
  });

  it('lists only the signed-in account’s own plays, and never another account’s names (T-321)', () => {
    const queue = [
      row('ours', 1, { leagueId: league, accountId: account }),
      row('shared', 2, { leagueId: league, accountId: account }),
      row('shared', 3, { leagueId: league, accountId: otherAccount }),
      row('theirs', 4, { leagueId: league, accountId: otherAccount }),
      // Stored before the account was kept with each play: nobody's, listed to nobody (T-323).
      row('before', 5, { leagueId: league, noMaker: true }),
    ];
    const kept = new Map([
      ['ours', keptGame('ours', league)],
      ['theirs', keptGame('theirs', league, otherAccount)],
      ['before', keptGame('before', league, otherAccount)],
    ]);
    const listed = heldGames(queue, mine, (id) => kept.get(id));
    expect(listed.map((game) => [game.gameId, game.waiting, game.teams?.home ?? null])).toEqual([
      ['shared', 1, null],
      ['ours', 1, 'Hawks'],
    ]);
    // The other account sees its own plays only; nobody signed in, nothing.
    const theirs = heldGames(queue, { leagueId: league, accountId: otherAccount }, (id) =>
      kept.get(id),
    );
    expect(theirs.map((game) => [game.gameId, game.waiting, game.teams?.home ?? null])).toEqual([
      ['theirs', 1, 'Hawks'],
      ['shared', 1, null],
    ]);
    expect(heldGames(queue, { leagueId: league, accountId: null }, () => undefined)).toEqual([]);
  });

  it('lists nothing when the device holds no plays', () => {
    expect(heldGames([], mine, () => undefined)).toEqual([]);
  });
});

describe('what a held game says', () => {
  const game: HeldGame = {
    gameId: 'g',
    waiting: 3,
    notSaved: 1,
    lastTapAt: 0,
    teams: { home: 'Hawks', away: 'Bears' },
  };

  it('names the game, or says it was scored here when its names are gone', () => {
    expect(heldGameWords(game, t)).toEqual({
      name: 'Hawks v Bears',
      counts: ['3 plays waiting to send', '1 play not saved'],
    });
    expect(heldGameWords({ ...game, teams: null, notSaved: 0 }, t)).toEqual({
      name: 'A game scored on this device',
      counts: ['3 plays waiting to send'],
    });
  });

  it('asks before dismissing, saying what is lost', () => {
    expect(dismissQuestion(game, t)).toContain('the league will never get them');
    expect(dismissQuestion({ ...game, waiting: 1 }, t)).toContain('Dismiss 1 play that');
    expect(dismissQuestion({ ...game, waiting: 0 }, t)).toContain('The league never had it.');
  });

  it('puts the game in the address the page built for the mark', () => {
    expect(heldGameHref(`/a/score/${heldGameMark}`, 'g 1')).toBe('/a/score/g%201');
  });
});

describe('a held game whose league the device does not know (step 2.38, part 2)', () => {
  const t = createTranslator('en');
  const play = (gameId: string): QueuedCommand =>
    ({
      command: { at: 5 },
      gameId,
      accountId: account,
      state: 'waiting',
    }) as unknown as QueuedCommand;

  it('is listed in every league, and its line says it may belong to another league', () => {
    const [listed] = heldGames(
      [play('old-game')],
      { leagueId: 'league-a', accountId: account },
      () => undefined,
    );
    expect(listed?.leagueUnknown).toBe(true);
    if (listed === undefined) return;
    expect(heldGameWords(listed, t).name).toBe(
      'A game scored on this device: it may belong to another league on this device',
    );
    const known: HeldGame = {
      gameId: 'old-game',
      waiting: 1,
      notSaved: 0,
      lastTapAt: 5,
      teams: null,
    };
    expect(heldGameWords(known, t).name).toBe('A game scored on this device');
  });
});
