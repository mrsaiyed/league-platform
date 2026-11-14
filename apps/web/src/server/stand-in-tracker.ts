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
};

export const emptyTracker = (): TrackerState => ({
  sessions: [],
  states: [],
  events: [],
  lines: [],
  players: [],
  people: [],
  teams: [],
});

/** One made-up team: its name, whether its player numbers are for staff only, and its players. */
export type MadeUpTeam = {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly statsVisibility: 'everyone' | 'staff';
  readonly players: readonly { readonly firstName: string; readonly lastName: string }[];
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
      color: null,
      statsVisibility: team.statsVisibility,
    });
    team.players.forEach((player, n) => {
      const id = personId(t + 1, n + 1);
      state.people.push({ id, ...player, isMinor: false, visibility: 'none' });
      state.players.push({ personId: id, teamId: team.id, jerseyNumber: String(n * 2 + 3) });
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

/** The live game's storage, over one state; `teamsOf` gives a game's two teams. */
export function liveGamesOf(
  s: TrackerState,
  teamsOf: (gameId: string) => readonly string[],
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
    saveLines: async (gameId, lines, removed) => {
      const replaced = new Set([...removed, ...lines.map((l) => l.personId)]);
      s.lines = [
        ...s.lines.filter((l) => !(l.gameId === gameId && replaced.has(l.personId))),
        ...lines,
      ];
    },
  };
}
