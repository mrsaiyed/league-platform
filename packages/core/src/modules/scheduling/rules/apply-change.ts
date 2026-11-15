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

const isDate = (v: string): boolean => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
};
const isTime = (v: string): boolean => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

const fail = (error: ChangeError): ApplyChangeResult => ({ ok: false, error });

/** The highest number a round can have: the database numbers a season's rounds 1 to 1000. */
export const maxRounds = 1000;

/** The years a round's date may fall in: what the database takes (rounds_date_plausible). */
export const roundYears = { first: 1900, last: 2999 } as const;

const badRoundDate = (date: string): ApplyChangeResult | undefined => {
  if (!isDate(date)) return fail({ code: 'invalid-date', value: date });
  const year = Number(date.slice(0, 4));
  return year < roundYears.first || year > roundYears.last
    ? fail({ code: 'date-out-of-range', value: date })
    : undefined;
};

/**
 * Applies one draft change to a schedule (P7 §4.3) and returns the new schedule with the
 * clashes that involve the games the change touched, flagged at once. The input is never
 * changed. Changing a round's date moves the games of that round that were on its old date.
 * A round is added after the others and removed only while no game is in it (step 2.160).
 */
export function applyDraftChange(
  state: ScheduleState,
  change: DraftChange,
  skippedDates: readonly string[],
): ApplyChangeResult {
  const find = (id: string): ScheduleGame | undefined => state.games.find((g) => g.id === id);
  const hasRound = (id: string): boolean => state.rounds.some((r) => r.id === id);
  const badSlot = (slot: { date: string; time: string | null }): ApplyChangeResult | undefined => {
    if (!isDate(slot.date)) return fail({ code: 'invalid-date', value: slot.date });
    if (slot.time !== null && !isTime(slot.time)) {
      return fail({ code: 'invalid-time', value: slot.time });
    }
    return undefined;
  };
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
      const bad = badSlot(g);
      if (bad) return bad;
      return done({ ...state, games: [...state.games, { ...g }] }, [g.id]);
    }
    case 'move-game': {
      if (!find(change.gameId)) return fail({ code: 'unknown-game', gameId: change.gameId });
      const to = change.to;
      if (to.roundId !== null && !hasRound(to.roundId)) {
        return fail({ code: 'unknown-round', roundId: to.roundId });
      }
      const bad = badSlot(to);
      if (bad) return bad;
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
    case 'set-recording': {
      if (!find(change.gameId)) return fail({ code: 'unknown-game', gameId: change.gameId });
      const games = state.games.map((g) =>
        g.id === change.gameId ? { ...g, recording: change.recording } : g,
      );
      return done({ ...state, games }, []);
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
      const bad = badRoundDate(change.date);
      if (bad) return bad;
      const touched: string[] = [];
      const games = state.games.map((g) => {
        if (g.roundId !== round.id || g.date !== round.date) return g;
        touched.push(g.id);
        return { ...g, date: change.date };
      });
      const rounds = state.rounds.map((r) => (r.id === round.id ? { ...r, date: change.date } : r));
      return done({ ...state, rounds, games }, touched);
    }
    case 'add-round': {
      const round = change.round;
      const removed = state.removedRounds ?? [];
      // A round the draft removed keeps its id and number until publishing ends: neither is
      // given to a new round in the meantime (a number freed by a publication can be, see
      // ScheduleRound.number).
      if (hasRound(round.id) || removed.some((r) => r.id === round.id)) {
        return fail({ code: 'round-exists', roundId: round.id });
      }
      const number = Math.max(0, ...[...state.rounds, ...removed].map((r) => r.number)) + 1;
      if (number > maxRounds) return fail({ code: 'too-many-rounds', roundId: round.id });
      const label = round.label.trim();
      if (label === '') return fail({ code: 'empty-round-label', roundId: round.id });
      if (round.date !== null) {
        const bad = badRoundDate(round.date);
        if (bad) return bad;
      }
      return done({ ...state, rounds: [...state.rounds, { ...round, number, label }] }, []);
    }
    case 'remove-round': {
      const round = state.rounds.find((r) => r.id === change.roundId);
      if (!round) return fail({ code: 'unknown-round', roundId: change.roundId });
      if (state.games.some((g) => g.roundId === change.roundId)) {
        return fail({ code: 'round-has-games', roundId: change.roundId });
      }
      return done(
        {
          ...state,
          rounds: state.rounds.filter((r) => r.id !== change.roundId),
          removedRounds: [...(state.removedRounds ?? []), round],
        },
        [],
      );
    }
  }
}
