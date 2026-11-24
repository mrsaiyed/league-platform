// Admin → Teams (step 2.51, P4 §3, P7 §2): the season's teams, and a form to add one.
// Drawn by step 2.103 as a list page: a title, one line of what it is for, and its main
// action ("Add a team") at the top right, which leads to the form; each team a row with
// its shield, its division and one way in; an empty list a calm panel with the action.
import { randomUUID } from 'node:crypto';
import { leagueUrl, type CommandContext } from '@srleagues/core';
import { EmptyPanel, PageHead } from '@srleagues/ui';
import { webPorts } from '../../server/container.ts';
import { commandContextOf } from '../../server/context.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { binLinkFor } from '../bin-area/index.ts';
import { t } from '../../server/messages.ts';
import { requestTokenField } from '../../server/same-request.ts';
import { ListForm } from '../list-forms/index.ts';
import { createTeamAction } from './actions.ts';
import { Notice, Section, Swatch } from './parts.tsx';

/** Where "Add a team" leads: the form's own place on the page. */
const addTeamAnchor = 'add-team';

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
  const context = commandContextOf(view.context);
  const season = await ports.currentSeason(context);
  const binLink = await binLinkFor(here, context, 'teams');
  return (
    <main className="admin-teams">
      <PageHead
        title={t('admin.area.teams')}
        sub={season === undefined ? undefined : t('adminTeams.seasonLine', { season: season.name })}
      >
        {season === undefined ? null : (
          <a className="ui-button" data-kind="main" data-icon="plus" href={`#${addTeamAnchor}`}>
            {t('adminTeams.create.title')}
          </a>
        )}
      </PageHead>
      {binLink === undefined ? null : (
        <p>
          <a href={binLink}>{t('admin.bin.link.teamsPeople')}</a>
        </p>
      )}
      <Notice
        query={query}
        binHref={leagueUrl(here, 'admin-area', { area: 'settings', subpath: ['bin'] })}
      />
      {season === undefined ? (
        <EmptyPanel text={t('adminTeams.noSeason')} />
      ) : (
        await Body({ league: here, context, seasonId: season.id })
      )}
    </main>
  );
}

async function Body({
  league,
  context,
  seasonId,
}: {
  readonly league: { readonly id: string; readonly slug: string };
  /** The session's: the reads answer only someone who may manage the season's teams. */
  readonly context: CommandContext;
  readonly seasonId: string;
}) {
  const ports = (await webPorts()).adminTeams;
  const [teams, divisions] = await Promise.all([
    ports.teams(context, seasonId),
    ports.divisions(context, seasonId),
  ]);
  const divisionName = (id: string | null) => divisions.find((d) => d.id === id)?.name;
  return (
    <>
      {teams.length === 0 ? (
        <EmptyPanel
          text={t('adminTeams.none')}
          action={{ href: `#${addTeamAnchor}`, label: t('adminTeams.create.title') }}
        />
      ) : (
        <ul className="staff-rows">
          {teams.map((team) => {
            const division = divisionName(team.divisionId);
            return (
              // The link is the team's name alone and covers the whole row (staff.css).
              <li key={team.id} className="staff-row" data-team-row={team.id}>
                <Swatch team={team} size="small" />
                <span className="staff-row-words">
                  <a
                    className="staff-row-link"
                    href={leagueUrl(league, 'admin-area', { area: 'teams', subpath: [team.id] })}
                    dir="auto"
                  >
                    {team.name}
                  </a>
                  {division === undefined ? null : (
                    <span className="staff-row-facts" dir="auto">
                      {division}
                    </span>
                  )}
                  {team.left ? (
                    <span className="staff-row-facts" data-team-left-mark={team.id}>
                      {t('adminTeams.leftMark')}
                    </span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <div id={addTeamAnchor} className="admin-add-team">
        <Section title={t('adminTeams.create.title')}>
          {/* Refused, every box keeps what was typed and the wrong one is marked, with its
              sentence beside it (step 2.155; ../list-forms). */}
          <ListForm
            action={createTeamAction}
            permalink={`${leagueUrl(league, 'admin-area', { area: 'teams' })}#${addTeamAnchor}`}
            hidden={{ league: league.slug, [requestTokenField]: randomUUID() }}
            fields={[
              {
                kind: 'text',
                name: 'name',
                label: t('adminTeams.field.name'),
                value: '',
                required: true,
                maxLength: 120,
              },
              {
                kind: 'text',
                name: 'shortName',
                label: t('adminTeams.field.shortName'),
                value: '',
                maxLength: 60,
                help: t('adminTeams.field.shortNameHint'),
              },
              {
                kind: 'color',
                name: 'color',
                label: t('adminTeams.field.color'),
                value: null,
                ownName: 'useOwnColors',
                ownLabel: t('adminTeams.field.useOwnColors'),
              },
              {
                kind: 'select',
                name: 'divisionId',
                label: t('adminTeams.field.division'),
                value: '',
                required: false,
                options: [
                  { value: '', label: t('adminTeams.noDivision') },
                  ...divisions.map((division) => ({ value: division.id, label: division.name })),
                ],
              },
            ]}
            button={t('adminTeams.create.submit')}
            kind="main"
            label={t('adminTeams.create.title')}
            name="create-team"
          />
        </Section>
      </div>
    </>
  );
}
