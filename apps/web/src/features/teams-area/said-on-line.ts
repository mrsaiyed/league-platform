// What went well on one roster line, in words that name the player (step 2.161): said on
// that line, where the phone lands, not at the top of the page. Kept apart from the page
// so it is tested without a server. Names come from the roster as it is now, never from
// the address; the address only says which line and, for a player put back without
// their number (R-32), which number they lost.
import type { RosterLine } from '@srleagues/core';
import { t } from '../../server/messages.ts';
import type { DoneAt, DoneName } from './answer.ts';
import { rosterName } from './roster-name.ts';

export type SaidOnLine = { readonly entry: string; readonly text: string };

export function saidOnLine(
  found: { readonly done: DoneName; readonly at: DoneAt } | undefined,
  lines: readonly RosterLine[],
  teamName: string,
): SaidOnLine | undefined {
  if (found === undefined) return undefined;
  const line = lines.find((candidate) => candidate.id === found.at.entry);
  if (line === undefined) return undefined;
  const name = rosterName(line);
  const said = (text: string): SaidOnLine => ({ entry: line.id, text });
  switch (found.done) {
    case 'left':
      return line.leftOn === null
        ? undefined
        : said(t('adminTeams.said.left', { name, team: teamName }));
    case 'putBack':
      return line.leftOn !== null ? undefined : said(t('adminTeams.said.putBack', { name }));
    case 'putBackNoNumber': {
      const number = found.at.number;
      if (line.leftOn !== null || number === undefined) return undefined;
      const wearer = lines.find(
        (other) => other.id !== line.id && other.leftOn === null && other.jerseyNumber === number,
      );
      return said(
        wearer === undefined
          ? t('adminTeams.said.putBackNoNumberNoWearer', { name, number })
          : t('adminTeams.said.putBackNoNumber', { name, number, wearer: rosterName(wearer) }),
      );
    }
    default:
      return undefined;
  }
}
