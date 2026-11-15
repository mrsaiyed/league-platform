// THE GAMES, SESSIONS AND LIVE GAMES OF THE ONE MADE-UP WORLD. FOR LOCAL WORK AND TESTS ONLY.
//
// The games module's stores (GamesStore, ScoringSessionsStore, LiveGamesStore) over one
// league's world (stand-in-world-state.ts), as packages/database's queries read and write
// the same tables: a game's two teams' rosters are its players, a box score line is one
// row whether the tracker or the grid wrote it, and the scorer's table adds real people
// and roster entries. The database's own rules (each command id and number once per game,
// numbers with no gaps, a number worn once where the season asks) are stood in for by the
// checks made here. Only the storage is made up: every rule is the games commands' own.
// A table is never changed in place: each write gives it a new array (stand-in-world-rows.ts).
import { refusedAddEventType } from '@srleagues/contracts';
import {
  hasPlaysPastMarker,
  rulesOfGame,
  type GameLine,
  type GamePlayer,
  type GameRecord,
  type GamesStore,
  type LiveGamesStore,
  type ScoringSession,
  type ScoringSessionsStore,
  type TablePlayerRefusal,
} from '@srleagues/core';
import { randomUUID } from 'node:crypto';
import { addDays, dayIn, momentIn } from './stand-in-world-clock.ts';
import { replacedAt } from './stand-in-world-rows.ts';
import type { LeagueWorld, WorldGame, WorldRosterEntry } from './stand-in-world-state.ts';

/** The roles that play: a coach's entry is no player's (list-game-players.ts). */
const playing = ['player', 'captain'];

const decided = (status: string) => status === 'final' || status === 'forfeit';

/** A game as the games module reads it: the row without the schedule's own fields. */
export function gameRecordOf(game: WorldGame): GameRecord {
  const {
    roundId: _round,
    number: _number,
    localDate: _date,
    localTime: _time,
    venueId: _venue,
    courtId: _court,
    ...record
  } = game;
  return record;
}

const withoutJersey = ({ jerseyNumber: _jersey, ...line }: GameLine & { jerseyNumber?: unknown }) =>
  line;

const teamsOfGame = (s: LeagueWorld, gameId: string): readonly string[] => {
  const game = s.games.find((g) => g.id === gameId);
  return game === undefined ? [] : [game.homeTeamId, game.awayTeamId];
};

/** Whether the season a team is in asks for a different number for each player (0008). */
export function uniqueJerseysOf(s: LeagueWorld, teamId: string): boolean {
  const team = s.teams.find((t) => t.id === teamId);
  const season = s.seasons.find((x) => x.id === team?.seasonId);
  return season !== undefined && rulesOfGame(null, season.rules).rosters.uniqueJerseys;
}

/** The day a game is played, in the league's time zone; the league's today with no time yet. */
const gameDayOf = (s: LeagueWorld, gameId: string, now: Date): string => {
  const startsAt = s.games.find((g) => g.id === gameId)?.startsAt ?? null;
  return dayIn(startsAt === null ? now : new Date(startsAt), s.timeZone);
};

const onDay = (entry: WorldRosterEntry, day: string) =>
  (entry.joinedOn === null || entry.joinedOn <= day) &&
  (entry.leftOn === null || day < entry.leftOn);

/** The games store over one league's world; `now` is the server's clock. */
export function worldGamesStore(s: LeagueWorld, now: () => Date): GamesStore {
  const assigned = (gameId: string, accountId: string) =>
    s.assignments.some((a) => a.gameId === gameId && a.accountId === accountId);
  const decidedOf = (seasonId: string) =>
    s.games
      .filter((g) => g.seasonId === seasonId && !g.binned && decided(g.status))
      .sort((a, b) => a.id.localeCompare(b.id));
  return {
    find: async (gameId) => {
      const game = s.games.find((g) => g.id === gameId);
      return game === undefined ? undefined : gameRecordOf(game);
    },
    setResult: async (gameId, change, version) => {
      const at = s.games.findIndex((g) => g.id === gameId);
      const found = s.games[at];
      if (found === undefined || found.binned || found.version !== version) return undefined;
      s.games = replacedAt(s.games, at, {
        ...found,
        status: change.status,
        homeScore: change.homeScore,
        awayScore: change.awayScore,
        finalizedAt: change.decided ? now().toISOString() : null,
        format: found.format ?? change.format ?? null,
        captureMode: change.captureMode ?? found.captureMode,
        version: found.version + 1,
      });
      return found.version + 1;
    },
    // As the database does it (record 061): only a live game, its rules emptied with it.
    markNotStarted: async (gameId, version) => {
      const at = s.games.findIndex((g) => g.id === gameId);
      const found = s.games[at];
      if (found === undefined || found.binned || found.version !== version) return undefined;
      if (found.status !== 'live') return undefined;
      s.games = replacedAt(s.games, at, {
        ...found,
        status: 'scheduled',
        homeScore: null,
        awayScore: null,
        finalizedAt: null,
        format: null,
        version: found.version + 1,
      });
      return found.version + 1;
    },
    addCorrection: async (correction) => {
      s.corrections = [...s.corrections, { ...correction, on: dayIn(now(), s.timeZone) }];
    },
    listPostponed: async (seasonId) =>
      s.games
        .filter(
          (g) =>
            g.status === 'postponed' &&
            !g.binned &&
            (seasonId === undefined || g.seasonId === seasonId),
        )
        .sort((a, b) => (a.startsAt ?? '~').localeCompare(b.startsAt ?? '~'))
        .map(gameRecordOf),
    listDecided: async (seasonId) => decidedOf(seasonId).map(gameRecordOf),
    listDecidedLines: async (seasonId) => {
      const ids = new Set(decidedOf(seasonId).map((g) => g.id));
      return s.lines
        .filter((l) => ids.has(l.gameId))
        .sort((a, b) => a.gameId.localeCompare(b.gameId) || a.personId.localeCompare(b.personId))
        .map(withoutJersey);
    },
    listLines: async (gameId) =>
      s.lines
        .filter((l) => l.gameId === gameId)
        .sort((a, b) => a.teamId.localeCompare(b.teamId) || a.personId.localeCompare(b.personId))
        .map(withoutJersey),
    replaceLines: async (gameId, lines) => {
      const teams = teamsOfGame(s, gameId);
      const people = new Set<string>();
      for (const line of lines) {
        if (!teams.includes(line.teamId) || people.has(line.personId)) {
          throw new Error('The database refuses a line for a team not in the game, or twice.');
        }
        people.add(line.personId);
      }
      s.lines = [...s.lines.filter((l) => l.gameId !== gameId), ...lines];
    },
    listRoster: async (gameId) => {
      const teams = teamsOfGame(s, gameId);
      return s.roster
        .filter((e) => teams.includes(e.teamId) && playing.includes(e.role))
        .map((e) => ({ e, p: s.people.find((x) => x.id === e.personId) }))
        .sort(
          (a, b) =>
            teams.indexOf(a.e.teamId) - teams.indexOf(b.e.teamId) ||
            a.e.sort - b.e.sort ||
            (a.p?.lastName ?? '').localeCompare(b.p?.lastName ?? '') ||
            (a.p?.firstName ?? '').localeCompare(b.p?.firstName ?? ''),
        )
        .map(({ e, p }) => ({
          teamId: e.teamId,
          personId: e.personId,
          firstName: p?.firstName ?? '',
          lastName: p?.lastName ?? '',
          jerseyNumber: e.jerseyNumber,
          left: e.leftOn !== null,
          addedAtGameId: e.addedAtGameId,
          needsReview: e.needsReview,
        }));
    },
    // Plays past the last "not started" marker, by core's one rule; the players the
    // scorer's table changed are events too, but not plays (records 058, 061).
    hasPlays: async (gameId) =>
      s.playsBefore.includes(gameId) || hasPlaysPastMarker(s.events, gameId),
    findSeason: async (seasonId) => {
      const season = s.seasons.find((x) => x.id === seasonId);
      return season === undefined
        ? undefined
        : { programId: season.programId, rules: season.rules };
    },
    leagueSettingRows: async (key) =>
      s.settings
        .filter((r) => r.key === key && r.place.level === 'league')
        .map((r) => ({ level: r.place.level, document: r.document })),
    isAssigned: async (gameId, accountId) => assigned(gameId, accountId),
    assign: async (gameId, accountId) => {
      if (assigned(gameId, accountId)) return false;
      s.assignments = [...s.assignments, { gameId, accountId }];
      return true;
    },
    unassign: async (gameId, accountId) => {
      if (!assigned(gameId, accountId)) return false;
      s.assignments = s.assignments.filter(
        (a) => !(a.gameId === gameId && a.accountId === accountId),
      );
      return true;
    },
    // From the start of the league's today, for `days` days, in its own calendar.
    listWindow: async (accountId, days) => {
      const today = dayIn(now(), s.timeZone);
      const from = momentIn(today, '00:00', s.timeZone);
      const until = momentIn(addDays(today, days), '00:00', s.timeZone);
      return {
        today,
        games: s.games
          .filter(
            (g) => !g.binned && g.startsAt !== null && g.startsAt >= from && g.startsAt < until,
          )
          .sort(
            (a, b) =>
              (a.startsAt ?? '').localeCompare(b.startsAt ?? '') || a.id.localeCompare(b.id),
          )
          .map((g) => ({
            game: gameRecordOf(g),
            programId: s.seasons.find((x) => x.id === g.seasonId)?.programId ?? '',
            day: dayIn(new Date(g.startsAt ?? ''), s.timeZone),
            assigned: assigned(g.id, accountId),
          })),
      };
    },
  };
}

/** The game's one scoring session (T-116), over one league's world. */
export function worldScoringSessions(s: LeagueWorld): ScoringSessionsStore {
  const current = (gameId: string) => s.sessions.find((x) => x.gameId === gameId);
  return {
    // The world runs one transaction at a time (stand-in-world.ts), which holds every
    // game: nothing else can change it before this one ends.
    lockGame: async (gameId) => s.games.some((g) => g.id === gameId),
    findForGame: async (gameId) => current(gameId),
    start: async (session) => {
      if (current(session.gameId) !== undefined) return undefined;
      const started: ScoringSession = { ...session, id: randomUUID() };
      s.sessions = [...s.sessions, started];
      return started;
    },
    extend: async (gameId, sessionId, heldUntil) => {
      const at = s.sessions.findIndex((x) => x.gameId === gameId && x.id === sessionId);
      const found = s.sessions[at];
      if (found === undefined) return false;
      s.sessions = replacedAt(s.sessions, at, { ...found, heldUntil });
      return true;
    },
    end: async (gameId, sessionId, lapsedBy) => {
      const found = s.sessions.find((x) => x.gameId === gameId && x.id === sessionId);
      if (found === undefined) return false;
      if (lapsedBy !== undefined && found.heldUntil > lapsedBy) return false;
      s.sessions = s.sessions.filter((x) => x !== found);
      return true;
    },
  };
}

/**
 * The live game's storage over one league's world: its state, events and lines, and the
 * players the scorer's table adds, changes and takes off (record 058) as real people and
 * roster entries. A person id is compared in lower case, as the commands give it.
 */
export function worldLiveGames(s: LeagueWorld, now: () => Date): LiveGamesStore {
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const current = (teamId: string, personId: string) =>
    s.roster.find((e) => e.teamId === teamId && same(e.personId, personId) && e.leftOn === null);
  // 0015: an entry waiting for review is neither checked nor counted.
  const worn = (teamId: string, personId: string, jersey: string | null) =>
    jersey !== null &&
    uniqueJerseysOf(s, teamId) &&
    current(teamId, personId)?.needsReview !== true &&
    s.roster.some(
      (e) =>
        e.teamId === teamId &&
        e.leftOn === null &&
        !e.needsReview &&
        e.jerseyNumber === jersey &&
        !same(e.personId, personId),
    );
  return {
    // A copy, as a database read is: the engine works on the state it is given.
    findState: async (gameId) => {
      const found = s.states.find((x) => x.gameId === gameId);
      return found === undefined
        ? undefined
        : { seq: found.seq, state: structuredClone(found.state) };
    },
    takenCommands: async (gameId, commandIds) =>
      s.events
        .filter((e) => e.gameId === gameId && commandIds.includes(e.commandId))
        .map((e) => e.commandId),
    addEvents: async (events) => {
      const kept = [...s.events];
      for (const event of events) {
        const own = kept.filter((e) => e.gameId === event.gameId);
        if (own.some((e) => e.commandId === event.commandId)) {
          throw new Error('game_events_command_once');
        }
        if (event.seq !== own.length + 1) throw new Error('game_events_in_order');
        kept.push(event);
      }
      s.events = kept;
    },
    // Ever final or forfeited: a correction for it, or an end or reopen in its event log.
    wasDecided: async (gameId) =>
      s.corrections.some((c) => c.gameId === gameId) ||
      s.events.some((e) => e.gameId === gameId && (e.type === 'end' || e.type === 'reopen')),
    saveState: async (gameId, seq, state) => {
      s.states = [...s.states.filter((x) => x.gameId !== gameId), { gameId, seq, state }];
    },
    players: async (gameId) => {
      const teams = teamsOfGame(s, gameId);
      const day = gameDayOf(s, gameId, now());
      return (
        s.roster
          .filter((e) => teams.includes(e.teamId) && playing.includes(e.role))
          // By team and person, the entry on the team on the game's day first, then by
          // leaving date with no date first (list-game-players.ts).
          .sort(
            (a, b) =>
              a.teamId.localeCompare(b.teamId) ||
              a.personId.localeCompare(b.personId) ||
              Number(onDay(b, day)) - Number(onDay(a, day)) ||
              Number(a.leftOn !== null) - Number(b.leftOn !== null) ||
              (a.leftOn ?? '').localeCompare(b.leftOn ?? ''),
          )
          .map(
            (e): GamePlayer => ({
              personId: e.personId,
              teamId: e.teamId,
              jerseyNumber: e.jerseyNumber,
              onGameDay: onDay(e, day),
            }),
          )
      );
    },
    lines: async (gameId) => s.lines.filter((l) => l.gameId === gameId),
    saveLines: async (gameId, lines, removed) => {
      const replaced = new Set([...removed, ...lines.map((l) => l.personId)]);
      s.lines = [
        ...s.lines.filter((l) => !(l.gameId === gameId && replaced.has(l.personId))),
        ...lines,
      ];
    },
    findLastEnd: async (gameId) => {
      const end = s.events.filter((e) => e.gameId === gameId && e.type === 'end').at(-1);
      return end === undefined ? undefined : { accountId: end.accountId };
    },
    // The world's "database clock" is the server's own.
    endedAgo: async (gameId) => {
      const decidedAt = s.games.find((g) => g.id === gameId)?.finalizedAt ?? null;
      return decidedAt === null ? undefined : Math.max(0, now().getTime() - Date.parse(decidedAt));
    },
    findEvent: async (gameId, commandId) => {
      const found = s.events.find((e) => e.gameId === gameId && e.commandId === commandId);
      return found === undefined
        ? undefined
        : { seq: found.seq, type: found.type, accountId: found.accountId };
    },
    findTablePlayer: async (teamId, personId) => {
      const entry = current(teamId, personId);
      if (entry === undefined) return undefined;
      const person = s.people.find((p) => same(p.id, personId));
      return {
        entryId: entry.id,
        teamId,
        personId,
        jerseyNumber: entry.jerseyNumber,
        firstName: person?.firstName ?? '',
        lastName: person?.lastName ?? '',
        addedAtGameId: entry.addedAtGameId,
        needsReview: entry.needsReview,
      };
    },
    addTablePlayer: async (player) => {
      if (s.people.some((p) => same(p.id, player.personId))) return 'id-taken';
      if (!player.needsReview && worn(player.teamId, player.personId, player.jerseyNumber)) {
        return 'jersey-taken';
      }
      const { personId, teamId, jerseyNumber, firstName, lastName } = player;
      s.people = [
        ...s.people,
        {
          id: personId,
          firstName,
          lastName,
          publicName: null,
          visibility: 'none',
          binned: false,
          version: 1,
          sensitive: { contactEmail: null, birthDate: null, isMinor: null },
          accountId: null,
        },
      ];
      const mine = s.roster.filter((e) => e.teamId === teamId);
      s.roster = [
        ...s.roster,
        {
          id: randomUUID(),
          teamId,
          personId,
          jerseyNumber,
          role: 'player',
          joinedOn: null,
          leftOn: null,
          sort: Math.max(-1, ...mine.map((e) => e.sort)) + 1,
          version: 1,
          addedAtGameId: player.gameId,
          needsReview: player.needsReview,
        },
      ];
      return 'added';
    },
    changeTablePlayer: async (entryId, personId, change) => {
      const at = s.roster.findIndex((e) => e.id === entryId);
      const entry = s.roster[at];
      if (entry === undefined) return 'failed';
      const jerseyNumber = change.jerseyNumber;
      if (jerseyNumber !== undefined && worn(entry.teamId, personId, jerseyNumber)) {
        return 'jersey-taken';
      }
      if (jerseyNumber !== undefined) {
        s.roster = replacedAt(s.roster, at, { ...entry, jerseyNumber, version: entry.version + 1 });
      }
      if (change.firstName !== undefined || change.lastName !== undefined) {
        s.people = s.people.map((p) =>
          same(p.id, personId)
            ? {
                ...p,
                firstName: change.firstName ?? p.firstName,
                lastName: change.lastName ?? p.lastName,
                version: p.version + 1,
              }
            : p,
        );
      }
      return 'changed';
    },
    removeTablePlayer: async (entryId, personId, gameId, thisGameToo) => {
      const theirs = s.lines.filter((l) => same(l.personId, personId));
      if (theirs.some((l) => l.gameId !== gameId)) return 'has-lines';
      if (thisGameToo && theirs.length > 0) return 'in-box-score';
      const entry = s.roster.find((e) => e.id === entryId);
      if (entry === undefined) return 'failed' satisfies TablePlayerRefusal;
      s.roster = s.roster.filter((e) => e.id !== entryId);
      // To the bin (T-45) when nothing else holds them: no other entry, no account.
      const person = s.people.find((p) => same(p.id, personId));
      if (
        person !== undefined &&
        person.accountId === null &&
        !s.roster.some((e) => same(e.personId, personId))
      ) {
        s.people = s.people.map((p) => (p === person ? { ...p, binned: true } : p));
      }
      return 'removed';
    },
    refusedAdds: async (gameId) =>
      s.events
        .filter((e) => e.gameId === gameId && e.type === refusedAddEventType)
        .map((e) => ({
          commandId: e.commandId,
          playerId: String(e.payload['playerId'] ?? ''),
          problem: String(e.payload['problem'] ?? ''),
        })),
    lastEventSeq: async (gameId) =>
      Math.max(0, ...s.events.filter((e) => e.gameId === gameId).map((e) => e.seq)),
  };
}
