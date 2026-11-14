// The box score grid's form, read back into the set-box-score command's input (step
// 2.64). The form is plain text by field name; the sheet (from getBoxScoreSheet) says
// which players and columns it had. How a paper sheet is read:
// - a player who is ticked as played, or has any number filled in, played;
// - a column with at least one number for a team was recorded for that team, so its
//   empty boxes for players who played are 0; a column with none was not recorded, and
//   is left out of the lines (so it does not count in averages, T6 §9);
// - minutes are whole minutes; a player who did not play gets a line saying so if
//   they are still on the roster, and nothing if they have left the team;
// - an empty team score is the total of the team's players' points (P7 §5.2): 0 when no
//   player has points.
import type { BoxScoreLineInput, BoxScoreSheet } from '@srleagues/core';

/** What a form held: text only, by field name. */
export type BoxScoreFields = Readonly<Record<string, string | undefined>>;

/** The field names of one player's row. */
export const boxScoreField = {
  played: (personId: string) => `played.${personId}`,
  minutes: (personId: string) => `minutes.${personId}`,
  stat: (personId: string, key: string) => `stat.${key}.${personId}`,
} as const;

export type BoxScoreInput = {
  readonly homeScore: number;
  readonly awayScore: number;
  readonly lines: readonly BoxScoreLineInput[];
};

/** A whole number from 0 to `max`, nothing for an empty box, or 'bad'. */
function cell(text: string | undefined, max: number): number | undefined | 'bad' {
  const trimmed = (text ?? '').trim();
  if (trimmed === '') return undefined;
  if (!/^\d{1,4}$/.test(trimmed)) return 'bad';
  const value = Number(trimmed);
  return value <= max ? value : 'bad';
}

type Row = {
  readonly personId: string;
  readonly teamId: string;
  readonly left: boolean;
  readonly played: boolean;
  readonly minutes: number | undefined;
  readonly stats: Readonly<Record<string, number | undefined>>;
};

/** The command's input, or undefined when a box holds something that is not a count. */
export function readBoxScoreForm(
  sheet: Pick<BoxScoreSheet, 'game' | 'players' | 'statKeys' | 'minutes'>,
  fields: BoxScoreFields,
): BoxScoreInput | undefined {
  const rows: Row[] = [];
  for (const player of sheet.players) {
    const minutes = sheet.minutes
      ? cell(fields[boxScoreField.minutes(player.personId)], 1440)
      : undefined;
    if (minutes === 'bad') return undefined;
    const stats: Record<string, number | undefined> = {};
    for (const key of sheet.statKeys) {
      const value = cell(fields[boxScoreField.stat(player.personId, key)], 999);
      if (value === 'bad') return undefined;
      stats[key] = value;
    }
    const anyNumber = minutes !== undefined || Object.values(stats).some((v) => v !== undefined);
    const ticked = fields[boxScoreField.played(player.personId)] !== undefined;
    rows.push({
      personId: player.personId,
      teamId: player.teamId,
      left: player.left,
      played: ticked || anyNumber,
      minutes,
      stats,
    });
  }

  const lines: BoxScoreLineInput[] = [];
  const pointsOf = new Map<string, number>();
  for (const teamId of [sheet.game.homeTeamId, sheet.game.awayTeamId]) {
    const team = rows.filter((row) => row.teamId === teamId);
    const played = team.filter((row) => row.played);
    const kept = sheet.statKeys.filter((key) => played.some((row) => row.stats[key] !== undefined));
    const minutesKept = played.some((row) => row.minutes !== undefined);
    for (const row of team) {
      if (!row.played) {
        if (!row.left) {
          lines.push({
            teamId,
            personId: row.personId,
            played: false,
            secondsPlayed: null,
            stats: {},
          });
        }
        continue;
      }
      const stats: Record<string, number> = {};
      for (const key of kept) stats[key] = row.stats[key] ?? 0;
      lines.push({
        teamId,
        personId: row.personId,
        played: true,
        secondsPlayed: minutesKept ? (row.minutes ?? 0) * 60 : null,
        stats,
      });
    }
    // The total of the team's players' points (an empty box is 0, and so is no points).
    pointsOf.set(
      teamId,
      played.reduce((sum, row) => sum + (row.stats['points'] ?? 0), 0),
    );
  }

  const score = (name: 'homeScore' | 'awayScore', teamId: string): number | 'bad' => {
    const typed = cell(fields[name], 999);
    return typed === undefined ? (pointsOf.get(teamId) ?? 0) : typed;
  };
  const homeScore = score('homeScore', sheet.game.homeTeamId);
  const awayScore = score('awayScore', sheet.game.awayTeamId);
  if (homeScore === 'bad' || awayScore === 'bad') return undefined;
  return { homeScore, awayScore, lines };
}
