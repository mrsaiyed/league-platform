// How one round of earlier games is named in the games list's address (step 2.156): the
// list shows them a round at a time, and the address says which (navigation only: never a
// form's answer, record 067). A round is named by its id; a season's games in no round
// (a make-up game, say) by the season's. Nothing else is accepted.
import type { EarlierRoundRef } from './ports.ts';

const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const keyPattern = new RegExp(`^(r|s)-(${uuid})$`);

/** The address's name for a round of earlier games: `r-{round}`, or `s-{season}` for no round. */
export function earlierRoundKey(group: {
  readonly seasonId: string;
  readonly roundId: string | null;
}): string {
  return group.roundId === null ? `s-${group.seasonId}` : `r-${group.roundId}`;
}

/** What a key names, or undefined for anything that is not one (read as no round chosen). */
export function parseEarlierRoundKey(key: string | undefined): EarlierRoundRef | undefined {
  const found = keyPattern.exec((key ?? '').toLowerCase());
  if (found === null) return undefined;
  const [, kind = '', id = ''] = found;
  return kind === 'r' ? { roundId: id } : { seasonId: id };
}
