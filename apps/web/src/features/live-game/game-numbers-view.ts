// A game page's box scores and play-by-play as words ready to draw (step 2.46): what
// GameNumbersDrawn draws, worked out on the server. The page as everyone gets it draws the
// public viewer's; the signed-in request after it (T-95, T-287) sends a staff viewer's in
// the same shape, so both are drawn by the one component, every word from the message
// files on the server (T-187).
import { lettersWide, type BoxScoreLabels, type PlayTableLabels } from '@srleagues/ui';
import { displayLabels } from '@srleagues/site';
import { t } from '../../server/messages.ts';
import type { BoxScoresView, BoxScoreView, PlayPeriodView } from './build-game.ts';

export type GameNumbersView = {
  /** Null: a game with no box score to show (not finished). */
  readonly boxScores: {
    readonly title: string;
    readonly body:
      | { readonly kind: 'panel'; readonly text: string }
      | {
          readonly kind: 'tables';
          readonly tables: readonly BoxScoreView[];
          readonly hiddenNotice: string;
          readonly labels: BoxScoreLabels;
          /** The longest name of either team: both tables give their names that room. */
          readonly nameRoom: number;
        };
  } | null;
  /** Null: no plays and none to come. */
  readonly plays: {
    readonly title: string;
    /** "Show newer plays", for a game under way: this page's own address and the words. */
    readonly newer: { readonly href: string; readonly label: string; readonly note: string } | null;
    readonly periods: readonly PlayPeriodView[];
    readonly noneText: string;
    readonly labels: PlayTableLabels;
  } | null;
};

/** The play-by-play's own id: "Show newer plays" lands on it, not on the top of the page. */
export const playsId = 'game-plays';

export function gameNumbersView(input: {
  readonly boxScores: BoxScoresView | null;
  readonly plays: readonly PlayPeriodView[];
  /** The snapshot's status: a live game's plays are as the page was opened. */
  readonly live: boolean;
  /** This page's own address, to show newer plays. */
  readonly selfAddress: string;
}): GameNumbersView {
  const labels = displayLabels(t);
  const box = input.boxScores;
  const boxScores: GameNumbersView['boxScores'] =
    box === null
      ? null
      : {
          title: t('game.boxScores'),
          body:
            box.kind === 'final-score-only'
              ? { kind: 'panel', text: t('game.finalScoreOnly') }
              : box.kind === 'no-stats'
                ? { kind: 'panel', text: t('game.noStats') }
                : {
                    kind: 'tables',
                    tables: box.tables,
                    hiddenNotice: t('game.playersHidden'),
                    labels: labels.boxScore,
                    nameRoom: Math.max(
                      0,
                      ...box.tables.flatMap((table) =>
                        (table.players ?? []).map((player) => lettersWide(player.name)),
                      ),
                    ),
                  },
        };
  // No plays and none to come: a game not started, or decided with only its final score or
  // box score kept, has no play-by-play section at all.
  const plays: GameNumbersView['plays'] =
    !input.live && input.plays.length === 0
      ? null
      : {
          title: t('game.plays'),
          newer: input.live
            ? {
                href: `${input.selfAddress}#${playsId}`,
                label: t('game.newerPlays'),
                note: t('game.playsAsOpened'),
              }
            : null,
          periods: input.plays,
          noneText: t('game.noPlays'),
          labels: {
            time: t('game.col.time'),
            play: t('game.col.play'),
            score: t('game.col.score'),
          },
        };
  return { boxScores, plays };
}
