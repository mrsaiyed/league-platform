// What a change to the rules would move in the standings (S-1, P7 §1): the teams whose
// place, record or points differ between the table as it stands and the table the
// same results give under the new rules. Pure: both tables are given. A team is
// listed only when something about it changes, so a change that moves nothing lists
// nobody and needs no confirmation.
import type { StandingsRow } from '@srleagues/sports';

/** The things about a team a rule change can alter, as the table shows them. */
export type MovedField =
  | 'rank'
  | 'seed'
  | 'wins'
  | 'losses'
  | 'ties'
  | 'pointsFor'
  | 'pointsAgainst'
  | 'pointDifference'
  | 'points';

const fields: readonly MovedField[] = [
  'rank',
  'seed',
  'wins',
  'losses',
  'ties',
  'pointsFor',
  'pointsAgainst',
  'pointDifference',
  'points',
];

export type TeamMove = {
  readonly teamId: string;
  /** The division whose table it sits in (null: no divisions). */
  readonly divisionId: string | null;
  /** Each thing that changes, with its value now and after the change. */
  readonly changes: readonly {
    readonly field: MovedField;
    readonly from: number | null;
    readonly to: number | null;
  }[];
};

/** Teams that change, in id order. A team in only one of the tables counts as unchanged. */
export function whatWouldMove(
  now: readonly StandingsRow[],
  after: readonly StandingsRow[],
): readonly TeamMove[] {
  const afterByTeam = new Map(after.map((row) => [row.teamId, row]));
  const moves: TeamMove[] = [];
  for (const row of now) {
    const next = afterByTeam.get(row.teamId);
    if (next === undefined) continue;
    const changes = fields.flatMap((field) =>
      row[field] === next[field] ? [] : [{ field, from: row[field], to: next[field] }],
    );
    if (changes.length > 0) {
      moves.push({ teamId: row.teamId, divisionId: next.divisionId, changes });
    }
  }
  return moves.sort((a, b) => a.teamId.localeCompare(b.teamId));
}
