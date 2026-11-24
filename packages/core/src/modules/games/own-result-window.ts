// Whether, and until when, an account may reopen a result recorded by hand (step 2.177;
// P7 §5.5, S-52, S-36): a final score, a box score or a forfeit typed in Games. The
// tracker's own rule (reopen-window.ts, step 2.120) for a game recorded by hand: one
// rule for the read that tells the page before the tap (games.read_own_result_offer) and
// for the reopen itself (games.reopen_own_result), so the page never offers it and is
// then refused for a reason the read did not give.
//
// Its caller has already checked that the account may score this game now (mayScoreGame,
// read fresh). Then:
//
// - only a decided game recorded by hand (no plays: a tracked game has its own door);
// - an account that may also correct games at the game's program reopens it at any time;
// - otherwise only the account that recorded the result (`finalized_by`, migration 0027),
//   and only while it was decided no longer ago than the league's
//   games.scorekeeperReopenMinutes (0: never). Who and how long ago are both read inside
//   the database (`statement_timestamp() - finalized_at`); the device's clock never
//   counts. Exactly the setting's minutes still counts.
import type { CommandContext } from '../../command/index.ts';
import { lookupSetting, scorekeeperReopenMinutes } from '../leagues/index.ts';
import { isDecided } from './game-fields.ts';
import { gameScope, mayChangeGames } from './policy.ts';
import type { GameRecord, TrackerTx } from './ports.ts';

/** Why reopening a result recorded by hand is not offered to this account now. */
export type OwnResultNotOffered =
  | 'game-not-decided'
  /** Its tracker decided it: the tracker's door (games.reopen_tracked_game) reopens it. */
  | 'not-recorded-by-hand'
  | 'scorekeepers-may-not-reopen'
  | 'not-recorded-by-you'
  | 'reopen-time-over'
  /** It could be reopened, but an overturn rules on its result (S-85). */
  | 'result-overturned';

export type OwnResultOffer = {
  readonly reopen:
    | { readonly when: 'always' }
    /** Until this time by the server's clock (`tx.clock`), in milliseconds. */
    | { readonly when: 'until'; readonly until: number }
    | { readonly when: 'no'; readonly code: OwnResultNotOffered };
  /** The account that recorded the result by hand; null when none did or it had no account. */
  readonly recordedBy: string | null;
};

const minuteMs = 60_000;

export async function ownResultOffer(
  context: CommandContext,
  tx: TrackerTx,
  game: GameRecord,
): Promise<OwnResultOffer> {
  const recordedBy = await tx.liveGames.decidedBy(game.id);
  const no = (code: OwnResultNotOffered): OwnResultOffer => ({
    reopen: { when: 'no', code },
    recordedBy,
  });
  if (!isDecided(game.status)) return no('game-not-decided');
  // As games.reopen_game tells them apart: a game with a saved state and plays is tracked.
  const saved = await tx.liveGames.findState(game.id);
  if (saved !== undefined && (await tx.games.hasPlays(game.id))) return no('not-recorded-by-hand');
  if (await mayChangeGames(context, tx, 'games.correct', await gameScope(tx, game.id))) {
    if (game.overturned === true) return no('result-overturned');
    return { reopen: { when: 'always' }, recordedBy };
  }
  const minutes = await reopenMinutesOf(tx);
  const mine = minutes !== 0 && recordedBy !== null && recordedBy === context.accountId;
  const ago = mine ? await tx.liveGames.endedAgo(game.id) : undefined;
  const reopen = scorekeeperWindow({
    minutes,
    accountId: context.accountId,
    recordedBy,
    ago,
    overturned: game.overturned === true,
    now: tx.clock.now(),
  });
  return { reopen, recordedBy };
}

async function reopenMinutesOf(tx: TrackerTx): Promise<number> {
  const rows = await tx.games.leagueSettingRows(scorekeeperReopenMinutes.key);
  return lookupSetting(scorekeeperReopenMinutes, rows).value;
}

/** The rule's end, for someone who may not correct games: the minutes, whose entry, how long ago. */
function scorekeeperWindow(facts: {
  readonly minutes: number;
  readonly accountId: string | null;
  readonly recordedBy: string | null;
  readonly ago: number | undefined;
  readonly overturned: boolean;
  readonly now: number;
}): OwnResultOffer['reopen'] {
  if (facts.minutes === 0) return { when: 'no', code: 'scorekeepers-may-not-reopen' };
  if (facts.recordedBy === null || facts.recordedBy !== facts.accountId) {
    return { when: 'no', code: 'not-recorded-by-you' };
  }
  const left = facts.minutes * minuteMs - (facts.ago ?? Number.POSITIVE_INFINITY);
  if (left < 0) return { when: 'no', code: 'reopen-time-over' };
  if (facts.overturned) return { when: 'no', code: 'result-overturned' };
  return { when: 'until', until: facts.now + left };
}

/**
 * The same rule for a whole list of games (T-349), for someone who may not correct games
 * (the list knows that from their access): one read of the games and one of the
 * league's minutes, however many games the list has. Each game's own door checks
 * everything again when tapped. Games not in the league are left out.
 */
export async function ownResultWindows(
  context: CommandContext,
  tx: TrackerTx,
  gameIds: readonly string[],
): Promise<ReadonlyMap<string, OwnResultOffer['reopen']>> {
  const windows = new Map<string, OwnResultOffer['reopen']>();
  if (gameIds.length === 0) return windows;
  const facts = await tx.liveGames.handResults(gameIds);
  const minutes = await reopenMinutesOf(tx);
  const now = tx.clock.now();
  for (const game of facts) {
    windows.set(
      game.gameId,
      !isDecided(game.status)
        ? { when: 'no', code: 'game-not-decided' }
        : game.tracked
          ? { when: 'no', code: 'not-recorded-by-hand' }
          : scorekeeperWindow({
              ...game,
              recordedBy: game.decidedBy,
              minutes,
              accountId: context.accountId,
              now,
            }),
    );
  }
  return windows;
}
