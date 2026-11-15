// THE TRACKER'S LOCAL STAND-IN. FOR LOCAL WORK AND TESTS ONLY, NEVER FOR PRODUCTION.
//
// The scoring sessions, saved states, events and box score lines of the made-up games
// (stand-in-games.ts), in this process's memory (T-201), with made-up rosters and
// names, so the tracker's endpoints (step 2.32) run the real commands with no
// database. The database's own rules for events (each command id and number once per
// game, numbers with no gaps) are stood in for by the checks made here.
import type {
  GamePageTeam,
  GamePersonRecord,
  GamePlayer,
  LiveGameLine,
  LiveGamesStore,
  NewGameEvent,
  ScoringSession,
  ScoringSessionsStore,
} from '@srleagues/core';
import { randomUUID } from 'node:crypto';

export type TrackerState = {
  sessions: ScoringSession[];
  states: { gameId: string; seq: number; state: unknown }[];
  events: NewGameEvent[];
  lines: LiveGameLine[];
  players: GamePlayer[];
  people: GamePersonRecord[];
  teams: GamePageTeam[];
  /** Players added at a scorer's table: where, and whether they wait for review (S-6, record 058). */
  tableMarks: { teamId: string; personId: string; addedAtGameId: string; needsReview: boolean }[];
};

export const emptyTracker = (): TrackerState => ({
  sessions: [],
  states: [],
  events: [],
  lines: [],
  players: [],
  people: [],
  teams: [],
  tableMarks: [],
});

/** One made-up team: its name, whether its player numbers are for staff only, and its players. */
export type MadeUpTeam = {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  /** The team's own color, #rrggbb; left out for a team with none. */
  readonly color?: string;
  readonly statsVisibility: 'everyone' | 'staff';
  readonly players: readonly {
    readonly firstName: string;
    readonly lastName: string;
    /** A child (R-14); an adult where not given. */
    readonly isMinor?: boolean;
  }[];
};

/** The made-up rosters: each player a person with a number on one team. */
export function seedTracker(
  teams: readonly MadeUpTeam[],
  personId: (team: number, n: number) => string,
): TrackerState {
  const state = emptyTracker();
  teams.forEach((team, t) => {
    state.teams.push({
      id: team.id,
      name: team.name,
      slug: team.slug,
      color: team.color ?? null,
      statsVisibility: team.statsVisibility,
    });
    team.players.forEach((player, n) => {
      const id = personId(t + 1, n + 1);
      state.people.push({
        id,
        firstName: player.firstName,
        lastName: player.lastName,
        isMinor: player.isMinor ?? false,
        visibility: 'none',
      });
      state.players.push({
        personId: id,
        teamId: team.id,
        jerseyNumber: String(n * 2 + 3),
        onGameDay: true,
      });
    });
  });
  return state;
}

/** The game's sessions, over one state; `hasGame` says whether the game is in the league. */
export function scoringSessionsOf(
  s: TrackerState,
  hasGame: (gameId: string) => boolean,
): ScoringSessionsStore {
  const current = (gameId: string) => s.sessions.find((x) => x.gameId === gameId);
  return {
    // The stand-in runs one transaction at a time (stand-in-games.ts), which holds
    // every game: nothing else can change it before this one ends.
    lockGame: async (gameId) => hasGame(gameId),
    findForGame: async (gameId) => current(gameId),
    start: async (session) => {
      if (current(session.gameId) !== undefined) return undefined;
      const started: ScoringSession = { ...session, id: randomUUID() };
      s.sessions.push(started);
      return started;
    },
    extend: async (gameId, sessionId, heldUntil) => {
      const index = s.sessions.findIndex((x) => x.gameId === gameId && x.id === sessionId);
      const found = s.sessions[index];
      if (found === undefined) return false;
      s.sessions[index] = { ...found, heldUntil };
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
 * The players the scorer's table adds, changes and takes off (record 058), over the
 * made-up rosters: `players` (a person on a team with a number) and `people` (their
 * names). A roster entry's id here is "team|person". The database's rules are stood in
 * for: an id once, a number worn once on a team where its season asks
 * (`uniqueJerseys`), nothing taken away that has a box score line.
 */
function tablePlayersOf(
  s: TrackerState,
  uniqueJerseys: (teamId: string) => boolean,
): Pick<
  LiveGamesStore,
  | 'findTablePlayer'
  | 'addTablePlayer'
  | 'setTablePlayerNumber'
  | 'renameTablePlayer'
  | 'removeTablePlayer'
> {
  const split = (entryId: string) => {
    const [teamId = '', personId = ''] = entryId.split('|');
    return { teamId, personId };
  };
  const onTeam = (teamId: string, personId: string) => (p: GamePlayer) =>
    p.teamId === teamId && p.personId.toLowerCase() === personId && p.onGameDay;
  const worn = (teamId: string, personId: string, jersey: string | null) =>
    jersey !== null &&
    uniqueJerseys(teamId) &&
    s.players.some(
      (p) =>
        p.teamId === teamId && p.onGameDay && p.jerseyNumber === jersey && p.personId !== personId,
    );
  return {
    findTablePlayer: async (teamId, personId) => {
      const player = s.players.find(onTeam(teamId, personId));
      if (player === undefined) return undefined;
      const person = s.people.find((p) => p.id.toLowerCase() === personId);
      const mark = s.tableMarks.find((m) => m.teamId === teamId && m.personId === personId);
      return {
        entryId: `${teamId}|${personId}`,
        teamId,
        personId,
        jerseyNumber: player.jerseyNumber,
        firstName: person?.firstName ?? '',
        lastName: person?.lastName ?? '',
        addedAtGameId: mark?.addedAtGameId ?? null,
      };
    },
    addTablePlayer: async (player) => {
      if (s.people.some((p) => p.id.toLowerCase() === player.personId)) return 'id-taken';
      if (worn(player.teamId, player.personId, player.jerseyNumber)) return 'jersey-taken';
      const { personId, teamId, jerseyNumber, firstName, lastName } = player;
      s.people.push({ id: personId, firstName, lastName, isMinor: null, visibility: 'none' });
      s.players.push({ personId, teamId, jerseyNumber, onGameDay: true });
      s.tableMarks.push({
        teamId,
        personId,
        addedAtGameId: player.gameId,
        needsReview: player.needsReview,
      });
      return 'added';
    },
    setTablePlayerNumber: async (entryId, jerseyNumber) => {
      const { teamId, personId } = split(entryId);
      if (worn(teamId, personId, jerseyNumber)) return 'jersey-taken';
      s.players = s.players.map((p) => (onTeam(teamId, personId)(p) ? { ...p, jerseyNumber } : p));
      return 'changed';
    },
    renameTablePlayer: async (personId, firstName, lastName) => {
      s.people = s.people.map((p) =>
        p.id.toLowerCase() === personId ? { ...p, firstName, lastName } : p,
      );
    },
    removeTablePlayer: async (entryId, personId) => {
      const { teamId } = split(entryId);
      if (s.lines.some((l) => l.personId.toLowerCase() === personId)) return 'has-lines';
      s.players = s.players.filter((p) => !onTeam(teamId, personId)(p));
      s.tableMarks = s.tableMarks.filter((m) => !(m.teamId === teamId && m.personId === personId));
      if (!s.players.some((p) => p.personId.toLowerCase() === personId)) {
        s.people = s.people.filter((p) => p.id.toLowerCase() !== personId);
      }
      return 'removed';
    },
  };
}

/**
 * The live game's storage, over one state; `teamsOf` gives a game's two teams and
 * `uniqueJerseys` whether a team's season asks for unique numbers (none, if not given).
 */
export function liveGamesOf(
  s: TrackerState,
  teamsOf: (gameId: string) => readonly string[],
  uniqueJerseys: (teamId: string) => boolean = () => false,
): LiveGamesStore {
  return {
    findState: async (gameId) => {
      const found = s.states.find((x) => x.gameId === gameId);
      return found === undefined ? undefined : { seq: found.seq, state: found.state };
    },
    takenCommands: async (gameId, commandIds) =>
      s.events
        .filter((e) => e.gameId === gameId && commandIds.includes(e.commandId))
        .map((e) => e.commandId),
    addEvents: async (events) => {
      for (const event of events) {
        const own = s.events.filter((e) => e.gameId === event.gameId);
        if (own.some((e) => e.commandId === event.commandId)) {
          throw new Error('game_events_command_once');
        }
        if (event.seq !== own.length + 1) throw new Error('game_events_in_order');
        s.events.push(event);
      }
    },
    saveState: async (gameId, seq, state) => {
      s.states = [...s.states.filter((x) => x.gameId !== gameId), { gameId, seq, state }];
    },
    players: async (gameId) => {
      const teams = teamsOf(gameId);
      return s.players.filter((p) => teams.includes(p.teamId));
    },
    lines: async (gameId) => s.lines.filter((l) => l.gameId === gameId),
    saveLines: async (gameId, lines, removed) => {
      const replaced = new Set([...removed, ...lines.map((l) => l.personId)]);
      s.lines = [
        ...s.lines.filter((l) => !(l.gameId === gameId && replaced.has(l.personId))),
        ...lines,
      ];
    },
    ...tablePlayersOf(s, uniqueJerseys),
  };
}
