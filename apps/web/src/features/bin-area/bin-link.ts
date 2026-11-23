// Where a screen that removes things leads to the bin (step 2.77): "Removed teams and
// people" on Teams, "Removed games" on Schedule. Only for someone who may bring back that
// part's kind (leagues.list_bin_part: the owner and admins, and a scheduler for games, a
// registrar for people, T-308), so nobody is led to a page that refuses them.
import { leagueUrl, listBinPart, type BinKind, type CommandContext } from '@srleagues/core';
import { webPorts } from '../../server/container.ts';
import { binAnchors } from './bin-anchors.ts';

const partKind: Readonly<Record<keyof typeof binAnchors, BinKind>> = {
  teams: 'team',
  people: 'person',
  games: 'game',
};

export async function binLinkFor(
  league: { readonly id: string; readonly slug: string },
  context: CommandContext,
  part: keyof typeof binAnchors,
): Promise<string | undefined> {
  const listed = await listBinPart(context, {}, (await webPorts()).adminPeople.putBack);
  if (!listed.ok || !listed.value.kinds.includes(partKind[part])) return undefined;
  const bin = leagueUrl(league, 'admin-area', { area: 'settings', subpath: ['bin'] });
  return `${bin}#${binAnchors[part]}`;
}
