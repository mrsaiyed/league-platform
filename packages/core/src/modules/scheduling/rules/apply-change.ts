import type {
  ChangeError,
  Clash,
  DraftChange,
  ScheduleGame,
  ScheduleSlot,
  ScheduleState,
} from './schedule-types.ts';
import { findClashes } from './find-clashes.ts';

export type ApplyChangeResult =
  | { ok: true; state: ScheduleState; clashes: Clash[] }
  | { ok: false; error: ChangeError };

const slotOf = (g: ScheduleSlot): ScheduleSlot => ({
  roundId: g.roundId,
  date: g.date,
  time: g.time,
  venueId: g.venueId,
  court: g.court,
});

const fail = (error: ChangeError): ApplyChangeResult => ({ ok: false, error });

/**
 * Applies one draft change to a schedule (P7 §4.3) and returns the new schedule with the
 * clashes that involve the games the change touched, flagged at once. The input is never
 * changed. Changing a round's date moves the games of that round that were on its old date.
 */
export function applyDraftChange(
  state: ScheduleState,
  change: DraftChange,
  skippedDates: readonly string[],
): ApplyChangeResult {
  const find = (id: string): ScheduleGame | undefined => state.games.find((g) => g.id === id);
  const hasRound = (id: string): boolean => state.rounds.some((r) => r.id === id);
  const done = (next: ScheduleState, touched: string[]): ApplyChangeResult => ({
    ok: true,
    state: next,
    clashes: findClashes(next.games, skippedDates, new Set(touched)),
  });

  switch (change.kind) {
    case 'add-game': {
      const g = change.game;
      if (find(g.id)) return fail({ code: 'game-exists', gameId: g.id });
      if (g.homeTeamId === g.awayTeamId) return fail({ code: 'team-plays-itself', gameId: g.id });
      if (g.roundId !== null && !hasRound(g.roundId)) {
        return fail({ code: 'unknown-round', roundId: g.roundId });
      }
      return done({ ...state, games: [...state.games, { ...g }] }, [g.id]);
    }
    case 'move-game': {
      if (!find(change.gameId)) return fail({ code: 'unknown-game', gameId: change.gameId });
      const to = change.to;
      if (to.roundId !== null && !hasRound(to.roundId)) {
        return fail({ code: 'unknown-round', roundId: to.roundId });
      }
      const games = state.games.map((g) => (g.id === change.gameId ? { ...g, ...slotOf(to) } : g));
      return done({ ...state, games }, [change.gameId]);
    }
    case 'swap-games': {
      const a = find(change.gameId);
      const b = find(change.otherGameId);
      if (!a) return fail({ code: 'unknown-game', gameId: change.gameId });
      if (!b) return fail({ code: 'unknown-game', gameId: change.otherGameId });
      if (a.id === b.id) return fail({ code: 'swap-with-itself', gameId: a.id });
      const games = state.games.map((g) =>
        g.id === a.id ? { ...g, ...slotOf(b) } : g.id === b.id ? { ...g, ...slotOf(a) } : g,
      );
      return done({ ...state, games }, [a.id, b.id]);
    }
    case 'remove-game': {
      if (!find(change.gameId)) return fail({ code: 'unknown-game', gameId: change.gameId });
      return done({ ...state, games: state.games.filter((g) => g.id !== change.gameId) }, []);
    }
    case 'rename-round': {
      if (!hasRound(change.roundId))
        return fail({ code: 'unknown-round', roundId: change.roundId });
      const label = change.label.trim();
      if (label === '') return fail({ code: 'empty-round-label', roundId: change.roundId });
      const rounds = state.rounds.map((r) => (r.id === change.roundId ? { ...r, label } : r));
      return done({ ...state, rounds }, []);
    }
    case 'change-round-date': {
      const round = state.rounds.find((r) => r.id === change.roundId);
      if (!round) return fail({ code: 'unknown-round', roundId: change.roundId });
      const touched: string[] = [];
      const games = state.games.map((g) => {
        if (g.roundId !== round.id || g.date !== round.date) return g;
        touched.push(g.id);
        return { ...g, date: change.date };
      });
      const rounds = state.rounds.map((r) => (r.id === round.id ? { ...r, date: change.date } : r));
      return done({ rounds, games }, touched);
    }
  }
}
