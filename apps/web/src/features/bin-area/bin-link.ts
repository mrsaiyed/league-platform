// Where a screen that removes things leads to the bin (step 2.77): "Removed teams and
// people" on Teams, "Removed games" on Schedule. Only for someone the bin's own list
// answers (the owner and the league's admins, leagues.list_bin), so nobody is led to a
// page that refuses them; undefined for anyone else.
import { leagueUrl, listBin, type CommandContext } from '@srleagues/core';
import { webPorts } from '../../server/container.ts';
import { binAnchors } from './bin-anchors.ts';

export async function binLinkFor(
  league: { readonly id: string; readonly slug: string },
  context: CommandContext,
  part: keyof typeof binAnchors,
): Promise<string | undefined> {
  const listed = await listBin(context, {}, (await webPorts()).adminPeople.putBack);
  if (!listed.ok) return undefined;
  const bin = leagueUrl(league, 'admin-area', { area: 'settings', subpath: ['bin'] });
  return `${bin}#${binAnchors[part]}`;
}
