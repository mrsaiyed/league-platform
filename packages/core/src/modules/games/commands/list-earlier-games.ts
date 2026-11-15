// The games list's "Earlier games" (step 2.156, the using-it audit's H8): the games played
// before the league's today that are decided or called off, for looking back and
// correcting, by round, a round at a time, so a league with hundreds of past games still
// opens quickly. The rounds come latest first, each with how many of its games the person
// may score; the chosen round's games come soonest first. A game still waiting for its
// result is not here: it is under "Needs a result". The person sees what they may score,
// by the one rule of the lists (my-games-of.ts). It changes nothing, but runs in the same
// shape as a command (record 014).
import { z } from 'zod';
import { defineCommand, ok, type Result } from '../../../command/index.ts';
import { accessOfAccount, type Scope } from '../../access/index.ts';
import { earlierRoundKey, parseEarlierRoundKey } from '../earlier-round-key.ts';
import { myGamesOf, type MyGame } from '../my-games-of.ts';
import { mayReadGames } from '../policy.ts';
import type { EarlierRoundCount, EarlierRoundRef, GamesTx } from '../ports.ts';
import { mayScoreUnder, scoringReachOf, scoringRuleOf } from '../scoring-access.ts';

/** The most rounds offered at once, and the most games of one round shown. */
export const earlierRoundsLimit = 200;
export const earlierRoundGamesLimit = 100;

/** A round of earlier games as the list offers it. */
export type EarlierRound = {
  /** Its name in the address (earlier-round-key.ts). */
  readonly key: string;
  readonly seasonId: string;
  /** Null for the season's games in no round. */
  readonly roundId: string | null;
  readonly number: number | null;
  readonly label: string | null;
  readonly firstDay: string;
  readonly lastDay: string;
  /** How many of its earlier games the person may score. */
  readonly games: number;
};

export type EarlierGames = {
  /** Latest played first, at most `earlierRoundsLimit`. */
  readonly rounds: readonly EarlierRound[];
  /** More rounds than these: the latest are offered. */
  readonly moreRounds: boolean;
  /** The round asked for, when it is one of these, and its games. */
  readonly shown: {
    readonly round: EarlierRound;
    readonly games: readonly MyGame[];
    /** More games than `earlierRoundGamesLimit` in it: the first are shown. */
    readonly more: boolean;
  } | null;
};

const none: EarlierGames = { rounds: [], moreRounds: false, shown: null };

export const listEarlierGames = defineCommand({
  name: 'games.list_earlier_games',
  permission: 'games.score',
  input: z.object({ round: z.string().max(100).optional() }),
  // Anyone who scores somewhere in the league; which games is decided game by game below.
  allowed: (context, _input, tx: GamesTx) => mayReadGames(context, tx, 'games.score'),
  run: async ({ context, input, tx }): Promise<Result<EarlierGames, never>> => {
    const accountId = context.accountId;
    if (accountId === null) return ok(none);
    const holder = await accessOfAccount(tx, accountId);
    if (holder === undefined) return ok(none);
    const rule = await scoringRuleOf(tx);
    // The store counts only the games this person may score, then cuts, so no round of
    // theirs is pushed out by rounds they do not score, and "more" speaks only of theirs.
    const reach = scoringReachOf(holder, rule);
    // How many of a round's games this person may score: all, those assigned to them, or none.
    const mine = (round: EarlierRoundCount): number => {
      const scope: Scope = { type: 'program', id: round.programId };
      if (mayScoreUnder(holder, scope, rule, false)) return round.games;
      return mayScoreUnder(holder, scope, rule, true) ? round.assigned : 0;
    };
    const counted = await tx.games.listEarlierRounds(accountId, reach, earlierRoundsLimit + 1);
    const rounds = counted
      .slice(0, earlierRoundsLimit)
      .map(
        (round): EarlierRound => ({
          key: earlierRoundKey(round),
          seasonId: round.seasonId,
          roundId: round.roundId,
          number: round.number,
          label: round.label,
          firstDay: round.firstDay,
          lastDay: round.lastDay,
          games: mine(round),
        }),
      )
      .filter((round) => round.games > 0);
    const moreRounds = counted.length > earlierRoundsLimit;
    // Only a round on offer is shown: a key for any other names nothing here.
    const asked = parseEarlierRoundKey(input.round);
    const round = asked === undefined ? undefined : rounds.find((r) => r.key === keyOf(asked));
    if (asked === undefined || round === undefined) return ok({ rounds, moreRounds, shown: null });
    const found = await tx.games.listEarlierRound(
      accountId,
      reach,
      asked,
      earlierRoundGamesLimit + 1,
    );
    const games = await myGamesOf(
      tx,
      accountId,
      found.games.slice(0, earlierRoundGamesLimit),
      found.today,
    );
    return ok({
      rounds,
      moreRounds,
      shown: {
        round,
        games: games ?? [],
        more: found.games.length > earlierRoundGamesLimit,
      },
    });
  },
});

/** The key of what was asked for, as earlierRoundKey writes it. */
const keyOf = (ref: EarlierRoundRef) =>
  'roundId' in ref
    ? earlierRoundKey({ seasonId: '', roundId: ref.roundId })
    : earlierRoundKey({ seasonId: ref.seasonId, roundId: null });
