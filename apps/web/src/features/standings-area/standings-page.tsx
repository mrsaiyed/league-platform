// Admin → Standings and stats (step 2.56; P4 §3 "Standings and stats", S-10): the season's
// standings adjustments, each with the team, what it changes and its reason, to add and to
// take off. For a league's admin after a game (a ruling, a forfeit penalty), on a phone.
// The table itself is worked out from the results and is never typed in (A-12): an
// adjustment is one of the things the calculation reads, and the public table shows its
// reason as a footnote. Adding asks for the team, the change and a reason; taking one off
// asks why (kept in the activity log) and for a tick first. Both are logged.
//
// The adjustments are read through the standings module's own read (listAdjustments), in
// the league of the session; the team names through the schedule's ports. Every form is a
// plain post that works with scripts off; a refusal keeps what was typed and marks the box
// (record 067); "Saved" is said at the top of the list, where the browser lands.
import { leagueUrl, listAdjustments, type SeasonAdjustment } from '@srleagues/core';
import { EmptyPanel, PageHead } from '@srleagues/ui';
import { randomUUID } from 'node:crypto';
import { commandContextOf } from '../../server/context.ts';
import { webPorts } from '../../server/container.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { t } from '../../server/messages.ts';
import { requestTokenField } from '../../server/same-request.ts';
import { ListForm, SaidLine, takeNotice, type ListField } from '../list-forms/index.ts';
import { StaffNotice } from '../staff/index.ts';
import { chooseSeason, firstValue, type SearchParams } from '../stats-pages/index.ts';
import { addAdjustmentAction, removeAdjustmentAction } from './actions.ts';
import { adjustmentProblemKey } from './adjustment-answers.ts';
import { changesText } from './adjustment-text.ts';
import {
  addAdjustmentAnchor,
  adjustmentAnchor,
  adjustmentsListAnchor,
  standingsAreaAddress,
} from './standings-address.ts';

const reasonField = (name: string, help: string, label: string): ListField => ({
  kind: 'text',
  name,
  label,
  value: '',
  required: true,
  maxLength: 500,
  help,
});

/** `/{league}/admin/standings`: the season's standings adjustments. */
export async function StandingsAreaPage({
  league,
  search,
}: {
  readonly league: string;
  readonly search: SearchParams;
}) {
  const view = await loadLeaguePage(league, 'admin', 'standings');
  const addressee = view.context.league;
  const ports = await webPorts();
  const context = commandContextOf(view.context);
  const holder = await ports.accessOf(context);
  const seasons = await ports.scheduleAdmin.seasonsOf(addressee.id, holder);
  const season = chooseSeason(seasons, firstValue(search['season']));
  if (season === undefined) {
    return (
      <main className="admin-standings">
        <PageHead title={t('adminStandings.title')} />
        <EmptyPanel text={t('adminStandings.noSeason')} />
      </main>
    );
  }
  const seasonId = seasons.find((s) => s.slug === season.slug)?.id ?? '';
  const asked = firstValue(search['season']);
  const page = standingsAreaAddress(addressee, asked);
  const publicTable = leagueUrl(addressee, 'standings', {
    season: season.isCurrent ? undefined : season.slug,
  });
  const [listed, teams] = await Promise.all([
    listAdjustments(context, { seasonId }, ports.games.standingsDeps),
    ports.scheduleAdmin.teamsOf(addressee.id, seasonId),
  ]);
  const notice = takeNotice(context, 'standings');
  const nameOf = (teamId: string) => teams.find((x) => x.id === teamId)?.name ?? '';
  const hidden = (more: Readonly<Record<string, string>> = {}) => ({
    league: addressee.slug,
    season: seasonId,
    seasonSlug: asked ?? '',
    ...more,
    [requestTokenField]: randomUUID(),
  });
  const adjustments = listed.ok ? listed.value.adjustments : [];
  const options = (listed.ok ? listed.value.teams : [])
    .map((team) => ({ value: team.teamId, label: nameOf(team.teamId) }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const count = (name: 'wins' | 'losses' | 'ties' | 'points', help?: string): ListField => ({
    kind: 'number',
    name,
    label: t(`adminStandings.field.${name}`),
    value: '',
    ...(help === undefined ? {} : { help }),
  });
  return (
    <main className="admin-standings">
      <PageHead title={t('adminStandings.title')} sub={t('adminStandings.intro')}>
        <a className="ui-button" data-kind="main" data-icon="plus" href={`#${addAdjustmentAnchor}`}>
          {t('adminStandings.add.title')}
        </a>
      </PageHead>
      <p className="staff-quiet">
        {t('adminStandings.season', { name: season.name })} ·{' '}
        <a href={publicTable}>{t('adminStandings.publicLink')}</a>
      </p>
      <section
        id={adjustmentsListAnchor}
        className="staff-panel"
        aria-labelledby="adjustments-title"
      >
        <h2 id="adjustments-title">{t('adminStandings.list')}</h2>
        {notice === undefined || notice.thing !== seasonId ? null : (
          <SaidLine kind={notice.said === 'removed' ? 'removed' : 'saved'}>
            <p>
              {t(
                notice.said === 'removed'
                  ? 'adminStandings.said.removed'
                  : 'adminStandings.said.added',
                { what: notice.name ?? '' },
              )}
            </p>
          </SaidLine>
        )}
        {!listed.ok ? (
          <StaffNotice kind="refused">
            <p>{t(adjustmentProblemKey(listed.error.code))}</p>
          </StaffNotice>
        ) : adjustments.length === 0 ? (
          <p className="staff-quiet">{t('adminStandings.none')}</p>
        ) : (
          adjustments.map((a) => (
            <AdjustmentPart
              key={a.id}
              adjustment={a}
              team={nameOf(a.teamId)}
              // Its own place: with scripts off, React gives a refusal back to the form
              // whose action and permalink match, so each adjustment's form has its own.
              permalink={`${page}#${adjustmentAnchor(a.id)}`}
              hidden={hidden({ adjustment: a.id })}
            />
          ))
        )}
      </section>
      <section
        id={addAdjustmentAnchor}
        className="staff-panel"
        aria-labelledby="add-adjustment-title"
      >
        <h2 id="add-adjustment-title">{t('adminStandings.add.title')}</h2>
        {options.length === 0 ? (
          <p className="staff-quiet">{t('adminStandings.noTeams')}</p>
        ) : (
          <ListForm
            name="add-adjustment"
            label={t('adminStandings.add.title')}
            action={addAdjustmentAction}
            permalink={`${page}#${addAdjustmentAnchor}`}
            hidden={hidden()}
            fields={[
              {
                kind: 'select',
                name: 'team',
                label: t('adminStandings.field.team'),
                value: options[0]?.value ?? '',
                options,
              },
              count('wins', t('adminStandings.field.winsHelp')),
              count('losses'),
              count('ties'),
              count('points', t('adminStandings.field.pointsHelp')),
              reasonField(
                'reason',
                t('adminStandings.field.reasonHelp'),
                t('adminStandings.field.reason'),
              ),
            ]}
            button={t('adminStandings.add.submit')}
          />
        )}
      </section>
    </main>
  );
}

function AdjustmentPart({
  adjustment,
  team,
  permalink,
  hidden,
}: {
  readonly adjustment: SeasonAdjustment;
  readonly team: string;
  readonly permalink: string;
  readonly hidden: Readonly<Record<string, string>>;
}) {
  return (
    <div id={adjustmentAnchor(adjustment.id)} className="admin-adjustment" data-adjustment={team}>
      <h3 dir="auto">{team}</h3>
      <p>
        <strong>{changesText(adjustment)}</strong>
      </p>
      <p dir="auto">{adjustment.reason}</p>
      <div data-kind="danger">
        <ListForm
          name="remove-adjustment"
          label={t('adminStandings.remove.label', { team })}
          action={removeAdjustmentAction}
          permalink={permalink}
          hidden={hidden}
          fields={[
            reasonField(
              'reason',
              t('adminStandings.field.removeReasonHelp'),
              t('adminStandings.field.removeReason'),
            ),
          ]}
          confirm={t('adminStandings.remove.confirm')}
          button={t('adminStandings.remove.submit')}
          kind="danger"
        />
      </div>
    </div>
  );
}
