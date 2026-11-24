// Which of the games a public page shows the signed-in person may score, and how each is
// recorded (step 2.153; S-38, S-50; P7 §5.1). The league's home, its schedule, a team's page
// and a game's page draw "Score this game" (a game recorded live) or "Enter the score" (a
// final score or a box score) on these games, for this person only. Who may is the one rule
// the scoring commands enforce (mayScoreUnder, scoring-access.ts): their roles, a role held
// for one program only, the league's "who may score" and their assignments, all read in this
// transaction (T-75). Only a game under way, or one still to be played whose day has come in
// the league's time zone, is offered (S-70, offeredOnItsDay): one days ahead, one with no
// date, and one decided, postponed or called off are not, and nothing is while the league is
// archived or suspended (U-9), nor, in an archived season, unless a correction is open
// and the person may correct games there (T-389). The menu's "My games to score" and Admin → Games still lead
// to a game days ahead. The answer is game ids and how each is recorded, nothing about a
// game the person may not score. It changes nothing, but runs in the same shape as a
// command (record 014).
import { z } from 'zod';
import { defineCommand, ok, type Result } from '../../../command/index.ts';
import { accessOfAccount, type Scope } from '../../access/index.ts';
import { archivedSeasonRefusesScoring } from '../archived-season.ts';
import { recordingOf } from '../game-fields.ts';
import { leagueScores } from '../my-games-of.ts';
import { mayReadGames } from '../policy.ts';
import type { GameInWindow, GamesTx } from '../ports.ts';
import { lowerId } from '../scoring-session.ts';
import { mayScoreUnder, scoringRuleOf } from '../scoring-access.ts';

/** The most games asked about at once: a page with more asks again for the rest. */
export const scoringOffersLimit = 100;

/** A game the person may score now, and how it is recorded. */
export type ScoringOffer = {
  readonly gameId: string;
  readonly recording: 'live' | 'final-score' | 'box-score';
};

export type ScoringOffers = {
  /** In the order asked. */
  readonly games: readonly ScoringOffer[];
};

/**
 * Whether a game is offered now (S-70): one under way; one still to be played from the start
 * of its own day in the league's time zone until it has a result, so today's games and those
 * of earlier days that still have none, but never one of a day still ahead, nor one with no
 * date yet. Decided, put off and called off games are never offered. `today` and the game's
 * day are the store's, by its clock and the league's time zone: the very days the games
 * list reads (GamesWindow), so a game offered here is one the list shows.
 */
export function offeredOnItsDay(entry: GameInWindow, today: string): boolean {
  if (entry.game.status === 'live') return true;
  return entry.game.status === 'scheduled' && entry.game.startsAt !== null && entry.day <= today;
}

export const listScoringOffers = defineCommand({
  name: 'games.list_scoring_offers',
  permission: 'games.score',
  input: z.object({ gameIds: z.array(lowerId).max(scoringOffersLimit) }),
  // Anyone who scores somewhere in the league; which games is decided game by game below.
  allowed: (context, _input, tx: GamesTx) => mayReadGames(context, tx, 'games.score'),
  run: async ({ context, input, tx }): Promise<Result<ScoringOffers, never>> => {
    const none: ScoringOffers = { games: [] };
    const accountId = context.accountId;
    const asked = [...new Set(input.gameIds)];
    if (accountId === null || asked.length === 0) return ok(none);
    const holder = await accessOfAccount(tx, accountId);
    if (holder === undefined || !(await leagueScores(tx))) return ok(none);
    const rule = await scoringRuleOf(tx);
    const found = await tx.games.listByIds(accountId, asked);
    const offered = new Map<string, ScoringOffer>();
    for (const entry of found.games) {
      const recording = recordingOf(entry.game.captureMode);
      if (recording === undefined || !offeredOnItsDay(entry, found.today)) continue;
      const scope: Scope = { type: 'program', id: entry.programId };
      if (!mayScoreUnder(holder, scope, rule, entry.assigned)) continue;
      // An archived season's game (O-12, T-381, T-389): only while a correction is open on
      // it and to someone who may correct games there, by the commands' own rule.
      if (await archivedSeasonRefusesScoring(entry.game, tx, holder, scope)) continue;
      offered.set(entry.game.id, { gameId: entry.game.id, recording });
    }
    return ok({ games: asked.flatMap((id) => offered.get(id) ?? []) });
  },
});
