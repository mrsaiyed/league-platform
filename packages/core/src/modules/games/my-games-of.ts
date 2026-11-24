// The games a person's lists of games show (the scorekeeper's games, and the games list's
// "Needs a result", week and earlier rounds, step 2.156), each as the list draws it, by one
// rule: in a league where any scorekeeper may score, every game in the person's reach;
// where only assigned ones may, the games they are assigned to. The owner, admins and
// schedulers get every game they may score (P4 §4). In an archived or suspended league the
// games are still listed, but marked not scorable (U-9); so are an archived season's, but
// while a correction is open, for those who may correct games there (T-389).
import { accessOfAccount, readOnlyLeagueStatuses, type Scope } from '../access/index.ts';
import { archivedSeasonRefusesScoring } from './archived-season.ts';
import { recordingOf } from './game-fields.ts';
import type { GameInWindow, GamesTx } from './ports.ts';
import { mayScoreUnder, scoringRuleOf } from './scoring-access.ts';
import { rulesOfGame } from './season-rules-of.ts';

/** A game on one of the person's lists. */
export type MyGame = {
  readonly id: string;
  readonly seasonId: string;
  /** The program of the game's season, where changing its result is checked. */
  readonly programId: string;
  readonly divisionId: string | null;
  readonly homeTeamId: string;
  readonly awayTeamId: string;
  readonly startsAt: string | null;
  /** The day it is played in the league's time zone (YYYY-MM-DD), and whether that is today. */
  readonly day: string;
  readonly isToday: boolean;
  readonly status: string;
  /** The score so far, or null while there is none. */
  readonly homeScore: number | null;
  readonly awayScore: number | null;
  /** A final game's overtime periods (P7 §5.6); null when not known or not final. */
  readonly overtimePeriods: number | null;
  readonly recording: ReturnType<typeof recordingOf>;
  /** Whether the person is assigned to score it. */
  readonly assignedToMe: boolean;
  /**
   * False while the league is archived or suspended: the game is shown, not scorable (U-9);
   * and in an archived season unless a correction is open on it and the person may correct
   * games there, by the commands' own rule (archivedSeasonRefusesScoring, O-12, T-389).
   */
  readonly scorable: boolean;
  /**
   * Whether the live tracker has recorded plays of a game still to be decided (scheduled
   * or live), by the store's own rule (plays since its last "not started" marker): such a
   * game is ended in the tracker, never by a score typed by hand (S-46). False for a game
   * that is decided, postponed or cancelled: it is not asked.
   */
  readonly hasPlays: boolean;
  readonly version: number;
  /**
   * The score a forfeit would record, winner's and loser's, by the rules the game is played
   * under (its own, else its season's): what the question before a forfeit says (step 2.158).
   */
  readonly forfeitScore: { readonly winner: number; readonly loser: number };
};

const view = (
  { game, day, assigned, programId }: GameInWindow,
  today: string,
  scorable: boolean,
  hasPlays: boolean,
  forfeitScore: MyGame['forfeitScore'],
): MyGame => ({
  id: game.id,
  seasonId: game.seasonId,
  programId,
  divisionId: game.divisionId,
  homeTeamId: game.homeTeamId,
  awayTeamId: game.awayTeamId,
  startsAt: game.startsAt,
  day,
  isToday: day === today,
  status: game.status,
  homeScore: game.homeScore,
  awayScore: game.awayScore,
  overtimePeriods: game.status === 'final' ? game.overtimePeriods : null,
  recording: recordingOf(game.captureMode),
  assignedToMe: assigned,
  scorable,
  hasPlays,
  version: game.version,
  forfeitScore,
});

/** Only a game still to be decided can be ended by hand, so only it is asked about. */
const stillOpen = (status: string) => status === 'scheduled' || status === 'live';

/** Whether the league may score now: not while it is archived or suspended (U-9). */
export async function leagueScores(tx: GamesTx): Promise<boolean> {
  const status = await tx.access.leagueStatus();
  return status !== undefined && !readOnlyLeagueStatuses.includes(status);
}

/**
 * The entries the person may score, in the order given, as the lists draw them; undefined
 * for a person with no access here.
 */
export async function myGamesOf(
  tx: GamesTx,
  accountId: string,
  entries: readonly GameInWindow[],
  today: string,
): Promise<readonly MyGame[] | undefined> {
  const holder = await accessOfAccount(tx, accountId);
  if (holder === undefined) return undefined;
  const rule = await scoringRuleOf(tx);
  const scorable = await leagueScores(tx);
  const mine = entries.filter((entry) => {
    const scope: Scope = { type: 'program', id: entry.programId };
    return mayScoreUnder(holder, scope, rule, entry.assigned);
  });
  // One after another: they share the transaction's one connection.
  const listed: MyGame[] = [];
  // Each season's stored rules read once (a list holds a season's games side by side).
  const seasonRules = new Map<string, unknown>();
  for (const entry of mine) {
    const plays = stillOpen(entry.game.status) && (await tx.games.hasPlays(entry.game.id));
    const { seasonId } = entry.game;
    if (!seasonRules.has(seasonId)) {
      seasonRules.set(seasonId, (await tx.games.findSeason(seasonId))?.rules);
    }
    const { forfeit } = rulesOfGame(entry.game.format, seasonRules.get(seasonId));
    const scope: Scope = { type: 'program', id: entry.programId };
    const open = scorable && !(await archivedSeasonRefusesScoring(entry.game, tx, holder, scope));
    listed.push(
      view(entry, today, open, plays, {
        winner: forfeit.winnerScore,
        loser: forfeit.loserScore,
      }),
    );
  }
  return listed;
}
