// The statistics a season keeps ("Statistics kept", P7 §1), in its order: the one answer
// the statistics page and a game's box score both draw their columns from (step 2.196,
// the numbers audit's L7: a standard season showed TO on a game's page and not on the
// statistics page). A season that names its statistics itself keeps those; one that names
// none (no command writes the list, record 070) keeps the set its rules choose, the
// columns the box score grid asks for. Rules that cannot be read are the starting set.
import { boxScoreColumns } from './box-score-columns.ts';
import { rulesOfGame } from './season-rules-of.ts';

/**
 * `named` is the season's own list (empty when it names none); `rules` the season's rules
 * as stored. A game's page asks with its season's, not the rules the game kept (S-1), so
 * its columns are the statistics page's after a season's statistics change.
 */
export function statisticsKept(named: readonly string[], rules: unknown): readonly string[] {
  return named.length > 0 ? named : boxScoreColumns(rulesOfGame(null, rules).statistics).statKeys;
}
