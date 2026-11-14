// Admin → Teams (step 2.51, P4 §3, P7 §2): the season's teams, and a form to add one.
import { leagueUrl } from '@srleagues/core';
import { webPorts } from '../../server/container.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { t } from '../../server/messages.ts';
import { createTeamAction } from './actions.ts';
import {
  ColorFields,
  DivisionField,
  LeagueField,
  Notice,
  Section,
  Swatch,
  TextField,
} from './parts.tsx';

export async function TeamsPage({
  league,
  query,
}: {
  /** The route's `[league]` value. */
  readonly league: string;
  readonly query: Readonly<Record<string, string | string[] | undefined>>;
}) {
  const view = await loadLeaguePage(league, 'admin', 'teams');
  const here = view.context.league;
  const ports = (await webPorts()).adminTeams;
  const season = await ports.currentSeason(here.id);
  return (
    <main>
      <h1>{t('admin.area.teams')}</h1>
      <Notice query={query} />
      {season === undefined ? (
        <p>{t('adminTeams.noSeason')}</p>
      ) : (
        await Body({ league: here, seasonId: season.id, seasonName: season.name })
      )}
    </main>
  );
}

async function Body({
  league,
  seasonId,
  seasonName,
}: {
  readonly league: { readonly id: string; readonly slug: string };
  readonly seasonId: string;
  readonly seasonName: string;
}) {
  const ports = (await webPorts()).adminTeams;
  const [teams, divisions] = await Promise.all([
    ports.teams(league.id, seasonId),
    ports.divisions(league.id, seasonId),
  ]);
  const divisionName = (id: string | null) => divisions.find((d) => d.id === id)?.name;
  return (
    <>
      <Section title={t('adminTeams.seasonLine', { season: seasonName })}>
        {teams.length === 0 ? (
          <p>{t('adminTeams.none')}</p>
        ) : (
          <ul>
            {teams.map((team) => (
              <li key={team.id}>
                <Swatch team={team} />
                <a href={leagueUrl(league, 'admin-area', { area: 'teams', subpath: [team.id] })}>
                  {team.name}
                </a>
                {divisionName(team.divisionId) === undefined
                  ? null
                  : t('adminTeams.inDivision', { division: divisionName(team.divisionId) ?? '' })}
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title={t('adminTeams.create.title')}>
        <form action={createTeamAction}>
          <LeagueField league={league.slug} />
          <TextField name="name" label={t('adminTeams.field.name')} required maxLength={120} />
          <TextField
            name="shortName"
            label={t('adminTeams.field.shortName')}
            hint={t('adminTeams.field.shortNameHint')}
            maxLength={60}
          />
          <ColorFields color={null} />
          <DivisionField divisions={divisions} value={null} />
          <p>
            <button type="submit">{t('adminTeams.create.submit')}</button>
          </p>
        </form>
      </Section>
    </>
  );
}
