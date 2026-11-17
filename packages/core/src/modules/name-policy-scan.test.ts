// The T-81 scan across every public surface the one name function feeds (steps 2.126
// and 2.162): under each value of the league's names setting and under its start, with
// and without the parents' confirmation (R-14, R-24, R-29, record 065), with and without
// adults allowed to ask for initials (R-15), with people who asked for initials and to be removed (R-17,
// R-25), in a youth, an adult and a mixed league. Each surface is built by the product's
// own code over made-up stores: a team's roster line, the season statistics table, a
// game's page (box score and plays), its snapshot and the live message cut from it.
// No made-up person's withheld name, nor any private value, may appear in any of them.
import { defaultSeasonRules } from '@srleagues/contracts';
import { basketball } from '@srleagues/sports';
import { describe, expect, it } from 'vitest';
import {
  liveMessageOf,
  readGamePage,
  readGameSnapshot,
  type GameSnapshotStore,
} from './games/index.ts';
import { audiences, type Audience, type StoredSettingRow } from './leagues/index.ts';
import {
  findPrivateFields,
  privateValuesOf,
  publicViewer,
  readNamePolicy,
  type NameRequest,
  type ShownName,
} from './people/index.ts';
import { readStatisticsTable, type StandingsReadStore } from './standings/index.ts';
import { publicRosterLine } from './teams/index.ts';

const leagueId = '01900000-0000-7000-8000-000000000001';
const seasonId = '01900000-0000-7000-8000-0000000c0001';
const gameId = '01900000-0000-7000-8000-0000000b0001';
const home = '01900000-0000-7000-8000-0000000a0001';
const away = '01900000-0000-7000-8000-0000000a0002';
const personId = (n: number) => `01900000-0000-7000-8000-00000000f${String(n).padStart(3, '0')}`;
const now = 1_800_000_000_000;

type MadeUp = {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly isMinor: boolean | null;
  readonly nameRequest: NameRequest;
  readonly birthDate: string;
  readonly side: 'home' | 'away';
};

/**
 * Children, people of unknown age and adults, each with a request of their own. Under
 * "adults may not ask", Lena stands for an adult whose initials were recorded before the
 * league switched asking off, and Ravi for a child whose initials were recorded before
 * his age made him an adult: both requests keep taking effect (R-27).
 */
const people: readonly MadeUp[] = [
  ['Mariam', 'Okafor', null, 'none'],
  ['Yusuf', 'Haddad', true, 'initials'],
  ['Lena', 'Fischer', false, 'initials'],
  ['Ravi', 'Patel', false, 'initials'],
  ['Omar', 'Rahimi', true, 'removed'],
  ['Dana', 'Whitfield', false, 'none'],
  ['Theo', 'Lindqvist', false, 'removed'],
  ['Priya', 'Raman', null, 'initials'],
  ['Kofi', 'Mensah', true, 'none'],
  ['Gita', 'Shah', null, 'removed'],
].map(([firstName, lastName, isMinor, nameRequest], i) => ({
  id: personId(i + 1),
  firstName: firstName as string,
  lastName: lastName as string,
  isMinor: isMinor as boolean | null,
  nameRequest: nameRequest as NameRequest,
  birthDate: `2011-0${(i % 9) + 1}-1${i % 10}`,
  side: i < 5 ? 'home' : 'away',
}));
const jerseyOf = (p: MadeUp) => String(people.indexOf(p) + 4);

/**
 * The rules in plain words, written apart from the function (R-14, R-15, R-17, R-24,
 * R-25, R-29): the league's choice for everyone, a child in full only once confirmed.
 */
function expectedName(
  p: MadeUp,
  audience: Audience,
  stored: Stored,
  confirmed: boolean,
): ShownName {
  if (p.nameRequest === 'removed') return { shown: false, why: 'removed' };
  const initials = `${p.firstName[0]}. ${p.lastName[0]}.`;
  const child = p.isMinor === true || (p.isMinor === null && audience !== 'adult');
  // Nothing stored: every league starts on full names (record 065).
  const choice = stored ?? 'fullName';
  if (choice === 'hidden') return { shown: false, why: 'hidden' };
  // A recorded request holds whatever the switch or the age now say (R-25, R-27).
  if (p.nameRequest === 'initials') return { shown: true, text: initials };
  // A child in full only with full names AND the confirmation (R-14).
  const full = choice === 'fullName' && (!child || confirmed);
  return full
    ? { shown: true, text: `${p.firstName} ${p.lastName}` }
    : { shown: true, text: `${p.firstName} ${p.lastName[0]}.` };
}

/** What a league may have stored for "Names on public pages": nothing, or one of its values. */
const storedValues = [undefined, 'fullName', 'firstNameLastInitial', 'hidden'] as const;
type Stored = (typeof storedValues)[number];

/** The policy as the league's stored settings give it (readNamePolicy). */
function policyOf(stored: Stored, confirmed: boolean, playersMayAskForInitials: boolean) {
  const values: Record<string, unknown> = {
    'privacy.publicNames': stored,
    'privacy.childrenInFullConfirmed': confirmed ? true : undefined,
    'privacy.playersMayAskForInitials': playersMayAskForInitials,
  };
  return readNamePolicy({
    settingRows: async (key): Promise<readonly StoredSettingRow[]> =>
      values[key] === undefined
        ? []
        : [{ level: 'league', document: { version: 1, value: values[key] }, version: 1 }],
  });
}

const statsStore: StandingsReadStore = {
  findSeason: async (id) =>
    id === seasonId ? { id, name: 'Made-up season', rules: defaultSeasonRules() } : undefined,
  seasonStatKeys: async () => ['points'],
  teams: async () =>
    [home, away].map((id) => ({
      id,
      name: id === home ? 'Home' : 'Away',
      slug: id === home ? 'home' : 'away',
      color: null,
      divisionId: null,
      statsVisibility: 'everyone',
    })),
  divisions: async () => [],
  standingsRows: async () => [],
  adjustments: async () => [],
  playerTotals: async () =>
    people.map((p, i) => ({
      personId: p.id,
      gamesPlayed: 3,
      secondsPlayed: 0,
      secondsGames: 0,
      stats: { stats: { points: { total: 10 + i, gamesRecorded: 3 } } },
    })),
  playerTeams: async () =>
    people.map((p) => ({ personId: p.id, teamId: p.side === 'home' ? home : away })),
  decidedGamesOf: async () => [],
  teamStatTotals: async () => [],
  teamTurnoverGames: async () => [],
  people: async (ids) =>
    people
      .filter((p) => ids.includes(p.id))
      .map((p) => ({
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        isMinor: p.isMinor,
        visibility: p.nameRequest,
      })),
};

/** A tracked game with every made-up person on court and a play by each of them. */
function playedState(): basketball.GameState {
  let state = basketball.newGame(basketball.QUARTERS, 0);
  let n = 0;
  const tap = (command: basketball.Command, at: number) => {
    n += 1;
    state = basketball.apply(state, command, { id: `c${n}`, now: at });
  };
  const ids = (side: 'home' | 'away') => people.filter((p) => p.side === side).map((p) => p.id);
  tap({ type: 'lineup', side: 'home', playerIds: ids('home') }, 1000);
  tap({ type: 'lineup', side: 'away', playerIds: ids('away') }, 1000);
  tap({ type: 'start' }, 2000);
  people.forEach((p, i) => {
    tap({ type: 'score', side: p.side, playerId: p.id, points: 2 }, 3000 + i * 1000);
  });
  return state;
}

function gameStore(status: 'live' | 'final'): GameSnapshotStore {
  const state = playedState();
  return {
    findGame: async (id) =>
      id === gameId
        ? {
            id,
            seasonId,
            homeTeamId: home,
            awayTeamId: away,
            startsAt: null,
            status,
            captureMode: 'live',
            homeScore: 10,
            awayScore: 10,
            finalizedAt: null,
            binned: false,
            rules: null,
            seasonStatKeys: [],
          }
        : undefined,
    teams: async () => [
      { id: home, name: 'Home', slug: 'home', color: null, statsVisibility: 'everyone' },
      { id: away, name: 'Away', slug: 'away', color: null, statsVisibility: 'everyone' },
    ],
    state: async () => state,
    savedState: async () => ({ seq: 13, state }),
    lines: async () =>
      people.map((p) => ({
        teamId: p.side === 'home' ? home : away,
        personId: p.id,
        jerseyNumber: jerseyOf(p),
        played: true,
        secondsPlayed: 60,
        stats: { points: 2 },
      })),
    people: async (ids) =>
      people
        .filter((p) => ids.includes(p.id))
        .map((p) => ({
          id: p.id,
          firstName: p.firstName,
          lastName: p.lastName,
          isMinor: p.isMinor,
          visibility: p.nameRequest,
        })),
    correctedOn: async () => undefined,
  };
}

const cases = audiences.flatMap((audience) =>
  storedValues.flatMap((stored) =>
    [false, true].flatMap((confirmed) =>
      [false, true].map((playersMayAskForInitials) => ({
        audience,
        stored: stored ?? ('nothing' as const),
        confirmed,
        playersMayAskForInitials,
      })),
    ),
  ),
);

describe('every public surface under each name setting (T-81, R-24, R-25, R-29)', () => {
  it('covers each value of the three settings and the start, in a youth, an adult and a mixed league', () => {
    expect(cases).toHaveLength(3 * 4 * 2 * 2);
  });

  it.each(cases)(
    'shows only what the settings allow, and nothing private: $audience, $stored, confirmed $confirmed, adults may ask $playersMayAskForInitials',
    async ({ audience, stored: named, confirmed, playersMayAskForInitials }) => {
      const stored = named === 'nothing' ? undefined : named;
      const policy = await policyOf(stored, confirmed, playersMayAskForInitials);
      expect(policy.playersMayAskForInitials).toBe(playersMayAskForInitials);
      expect(policy.childrenInFull).toBe(confirmed);
      const viewer = publicViewer(leagueId);
      const viewing = { leagueId, viewer, audience, policy };
      const expected = people.map((p) => expectedName(p, audience, stored, confirmed));
      const privateValues = people.flatMap((p, i) => [
        ...privateValuesOf(p, expected[i] ?? { shown: false, why: 'no_name' }),
        p.birthDate,
      ]);
      const textOf = (name: ShownName | undefined) => (name?.shown === true ? name.text : null);
      const wanted = expected.map(textOf);
      // R-27 in plain view: the recorded initials of Lena (an adult) and Ravi (a child
      // then, an adult now) hold even where adults may no longer ask; under hidden they
      // show no more than everyone else (R-29).
      expect(wanted.slice(2, 4)).toEqual(stored === 'hidden' ? [null, null] : ['L. F.', 'R. P.']);

      // A team's roster: one line each, the removed and the hidden kept with their number.
      const roster = people.map((p) =>
        publicRosterLine(
          {
            entryId: `e-${p.id}`,
            jerseyNumber: jerseyOf(p),
            role: 'player',
            leftOn: null,
            firstName: p.firstName,
            lastName: p.lastName,
            isMinor: p.isMinor,
            nameRequest: p.nameRequest,
            personBinned: false,
          },
          audience,
          { viewer, policy },
        ),
      );
      expect(roster.map((l) => textOf(l.name))).toEqual(wanted);
      expect(roster.map((l) => l.jerseyNumber)).toEqual(people.map(jerseyOf));

      // The season's statistics: every person keeps their numbers (R-17).
      const table = await readStatisticsTable(statsStore, { seasonId, viewing });
      if (!table.ok) throw new Error('expected a statistics table');
      const shownInTable = new Map(table.value.players.map((p) => [p.personId, p.name.text]));
      expect(people.map((p) => shownInTable.get(p.id) ?? null)).toEqual(wanted);

      // A game: its page (box score and plays), its snapshot and the live message.
      const page = await readGamePage(gameStore('final'), { gameId }, viewing);
      const snapshot = await readGameSnapshot(gameStore('live'), { gameId }, viewing, now);
      if (!page.ok || !snapshot.ok) throw new Error('expected the game');
      const message = liveMessageOf(snapshot.value);
      const inSnapshot = new Map(snapshot.value.players.map((p) => [p.playerId, p.name]));
      expect(people.map((p) => inSnapshot.get(p.id) ?? null)).toEqual(wanted);
      // The latest play is the last person's, and names them only as the settings allow.
      expect(message.latestPlay?.playerName ?? null).toBe(wanted.at(-1) ?? null);

      // The scan is armed: a removed child's full name would be found anywhere.
      expect(findPrivateFields({ caption: 'Omar Rahimi scored' }, { privateValues })).not.toEqual(
        [],
      );
      for (const [surface, response] of [
        ['roster', roster],
        ['statistics', table.value],
        ['game page', page.value],
        ['snapshot', snapshot.value],
        ['live message', message],
      ] as const) {
        expect(findPrivateFields(response, { privateValues }), surface).toEqual([]);
      }
    },
  );
});
