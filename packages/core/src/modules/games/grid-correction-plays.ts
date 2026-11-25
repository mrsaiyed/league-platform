// The plays that turn a tracked game's lines into the lines an admin's box score grid
// wants (step 2.65, T6 §8, T-122). A grid on a tracked game never writes lines: its
// edits become the tracker's own commands, so the event log always explains the final
// numbers. One more foul is a foul, one fewer is the tracker's own take-back (unfoul);
// turnovers the same; one more basket of 1, 2 or 3 is that basket. The engine has no
// command that takes back a basket other than the last play (undo), so a grid that
// lowers a player's baskets cannot be made of commands, and is said so here (T-405):
// the game is fixed with the tracker's undo, or marked not started and scored again.
// Minutes are the clock's, never typed. Pure: the command judges and applies the plays.
import type { basketball } from '@srleagues/sports';

/** The counts the grid can change on a tracked game: the tracker's own. */
export const gridCounts = ['fg1', 'fg2', 'fg3', 'fouls', 'turnovers'] as const;
export type GridCount = (typeof gridCounts)[number];

/** One player's line as the game's plays give it (linesOf): counts by stat key. */
export type ReplayedLine = {
  readonly teamId: string;
  readonly personId: string;
  readonly stats: Readonly<Record<string, number>>;
};

/** One player's line as the grid wants it: a count left out stays as it is. */
export type WantedLine = { readonly teamId: string; readonly personId: string } & {
  readonly [K in GridCount]?: number | undefined;
};

/** A play the grid makes, in the engine's command shape. */
export type GridPlay =
  | {
      readonly type: 'score';
      readonly side: basketball.Side;
      readonly playerId: string;
      readonly points: 1 | 2 | 3;
    }
  | {
      readonly type: 'foul' | 'unfoul' | 'turnover' | 'unturnover';
      readonly side: basketball.Side;
      readonly playerId: string;
    };

/** Why the wanted lines cannot be made of plays. */
export type GridProblem =
  | { readonly problem: 'team-not-in-game'; readonly teamId: string }
  | { readonly problem: 'player-listed-twice'; readonly personId: string }
  | {
      readonly problem: 'basket-taken-back';
      readonly personId: string;
      readonly stat: 'fg1' | 'fg2' | 'fg3';
    };

export type GridCorrection =
  | { readonly ok: true; readonly plays: readonly GridPlay[] }
  | { readonly ok: false; readonly problems: readonly GridProblem[] };

const points = { fg1: 1, fg2: 2, fg3: 3 } as const;
const takeBack = { fouls: 'unfoul', turnovers: 'unturnover' } as const;
const add = { fouls: 'foul', turnovers: 'turnover' } as const;

const keyOf = (teamId: string, personId: string) =>
  `${teamId.toLowerCase()}|${personId.toLowerCase()}`;

/**
 * The plays, in order: every take-back first (so a foul moved from one player to another
 * never counts as one too many on the way), then every foul and turnover added, then every
 * basket. Players in the grid's order. Nothing changed gives no plays.
 */
export function gridCorrectionPlays(
  teams: { readonly homeTeamId: string; readonly awayTeamId: string },
  replayed: readonly ReplayedLine[],
  wanted: readonly WantedLine[],
): GridCorrection {
  const now = new Map(replayed.map((line) => [keyOf(line.teamId, line.personId), line.stats]));
  const problems: GridProblem[] = [];
  const takeBacks: GridPlay[] = [];
  const added: GridPlay[] = [];
  const baskets: GridPlay[] = [];
  const seen = new Set<string>();
  for (const line of wanted) {
    const teamId = line.teamId.toLowerCase();
    const side: basketball.Side | undefined =
      teamId === teams.homeTeamId.toLowerCase()
        ? 'home'
        : teamId === teams.awayTeamId.toLowerCase()
          ? 'away'
          : undefined;
    if (side === undefined) {
      problems.push({ problem: 'team-not-in-game', teamId: line.teamId });
      continue;
    }
    const playerId = line.personId.toLowerCase();
    if (seen.has(playerId)) {
      problems.push({ problem: 'player-listed-twice', personId: line.personId });
      continue;
    }
    seen.add(playerId);
    const stats = now.get(keyOf(teamId, playerId)) ?? {};
    for (const stat of gridCounts) {
      const want = line[stat];
      if (want === undefined) continue;
      const change = want - (stats[stat] ?? 0);
      if (change === 0) continue;
      if (stat === 'fouls' || stat === 'turnovers') {
        const type = change > 0 ? add[stat] : takeBack[stat];
        const list = change > 0 ? added : takeBacks;
        for (let i = 0; i < Math.abs(change); i += 1) list.push({ type, side, playerId });
      } else if (change < 0) {
        problems.push({ problem: 'basket-taken-back', personId: line.personId, stat });
      } else {
        for (let i = 0; i < change; i += 1) {
          baskets.push({ type: 'score', side, playerId, points: points[stat] });
        }
      }
    }
  }
  if (problems.length > 0) return { ok: false, problems };
  return { ok: true, plays: [...takeBacks, ...added, ...baskets] };
}
