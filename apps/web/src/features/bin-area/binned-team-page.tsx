// A team's admin address while the team is in the bin (step 2.77): for staff who may see
// the bin, "This team is in the bin" with what comes back with it and "Bring it back";
// for anyone else nothing (the caller then answers "Page not found", as the public team
// page does for everyone). The bin's own list decides who may see it (leagues.list_bin).
import { leagueUrl, listBin, type CommandContext } from '@srleagues/core';
import { PageHead } from '@srleagues/ui';
import { webPorts } from '../../server/container.ts';
import { locale, t } from '../../server/messages.ts';
import { bringBackAction } from './actions.ts';
import { binAnchors } from './bin-anchors.ts';
import { binView } from './bin-view.ts';

export async function binnedTeamPage(
  league: { readonly id: string; readonly slug: string },
  context: CommandContext,
  teamId: string,
) {
  const ports = await webPorts();
  const listed = await listBin(context, {}, ports.adminPeople.putBack);
  if (!listed.ok) return undefined;
  const clock = await ports.publicSchedule.clockOf(league.id);
  const row = binView(listed.value.items, { locale, timeZone: clock.timeZone }).teams.find(
    (team) => team.id === teamId,
  );
  if (row === undefined) return undefined;
  const bin = leagueUrl(league, 'admin-area', { area: 'settings', subpath: ['bin'] });
  return (
    <main className="admin-teams">
      <PageHead title={row.title} sub={t('admin.bin.teamPage.title')} />
      <section className="staff-panel" data-bin="team">
        <h2>{t('admin.bin.teamPage.title')}</h2>
        <p>{t('admin.bin.teamPage.body')}</p>
        {row.facts.map((fact) => (
          <p key={fact}>{fact}</p>
        ))}
        <form action={bringBackAction} className="staff-buttons">
          <input type="hidden" name="league" value={league.slug} />
          <input type="hidden" name="kind" value="team" />
          <input type="hidden" name="id" value={row.id} />
          <button type="submit" className="ui-button" data-kind="main">
            {t('admin.bin.back')}
          </button>{' '}
          <a href={`${bin}#${binAnchors.teams}`}>{t('admin.bin.link.teamsPeople')}</a>
        </form>
      </section>
    </main>
  );
}
