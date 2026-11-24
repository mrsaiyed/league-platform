// Admin → Season settings → Divisions (step 2.49; P7 §1, P4 §3): a season's divisions, to
// add, rename, color, put in order and remove. For an owner or admin who does this a few
// times a season, on a phone. Each division is a panel: its mark and name, the teams in it,
// its name and color, a place up or down, and its removal. A division that still has teams
// (or divisions under it) says so up front, names them and points to Teams, and draws no
// remove button that could only be refused (A-17 as changed). Removing asks first (a tick)
// and is answered "Removed: East." with "Put it back" where the person is looking (A-5).
//
// Every form is a plain post that works with scripts off; a refusal keeps what was typed
// and is said beside the box (record 067). The divisions are read through the leagues
// module's own command (listDivisions, `divisions.manage`), in the league of the session.
import {
  allows,
  leagueUrl,
  listDivisions,
  type DivisionRecord,
  type TeamRecord,
} from '@srleagues/core';
import { displayLabels } from '@srleagues/site';
import { Emblem, EmptyPanel, OptionPicker, PageHead } from '@srleagues/ui';
import { randomUUID } from 'node:crypto';
import { commandContextOf } from '../../server/context.ts';
import { webPorts } from '../../server/container.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { t, type TextKey } from '../../server/messages.ts';
import { requestTokenField } from '../../server/same-request.ts';
import type { SavedNotice } from '../../server/saved-notice.ts';
import { ListForm, SaidLine, takeNotice, type ListField } from '../list-forms/index.ts';
import { seasonSettingsAddress } from '../season-settings/index.ts';
import { ArchivedSeasonNotice, StaffNotice, StaffTrail } from '../staff/index.ts';
import { chooseSeason, firstValue, type SearchParams } from '../stats-pages/index.ts';
import {
  createDivisionAction,
  moveDivisionAction,
  removeDivisionAction,
  restoreDivisionAction,
  saveDivisionAction,
} from './actions.ts';
import { divisionProblemKey } from './division-answers.ts';
import { siblingsOf } from './division-order.ts';
import {
  addDivisionAnchor,
  divisionAnchor,
  divisionsAddress,
  divisionsListAnchor,
} from './divisions-address.ts';
import { namesList } from './names-list.ts';

/** `/{league}/admin/season/divisions`: the season's divisions. */
export async function DivisionsPage({
  league,
  search,
}: {
  /** The route's `[league]` value. */
  readonly league: string;
  readonly search: SearchParams;
}) {
  const view = await loadLeaguePage(league, 'admin', 'season');
  const addressee = view.context.league;
  const ports = await webPorts();
  const context = commandContextOf(view.context);
  const holder = await ports.accessOf(context);
  const seasons = await ports.scheduleAdmin.seasonsOf(addressee.id, holder);
  const chosen = chooseSeason(seasons, firstValue(search['season']));
  const season = seasons.find((s) => s.id === chosen?.id);
  const trail = (
    <StaffTrail
      steps={[
        {
          href: seasonSettingsAddress(addressee, season?.slug),
          label: t('admin.area.season'),
        },
      ]}
      here={t('adminDivisions.title')}
    />
  );
  if (season === undefined) {
    return (
      <main className="admin-season">
        {trail}
        <PageHead title={t('adminDivisions.title')} sub={t('adminDivisions.intro')} />
        <EmptyPanel text={t('adminDivisions.noSeason')} />
      </main>
    );
  }
  const deps = ports.adminSettings.deps;
  const [listed, teams] = await Promise.all([
    listDivisions(context, { seasonId: season.id }, deps),
    ports.adminTeams.teams(context, season.id),
  ]);
  const notice = takeNotice(context, 'divisions');
  const page = divisionsAddress(addressee, season.slug);
  const base = {
    league: addressee.slug,
    season: season.slug,
    seasonId: season.id,
  };
  // A fresh one-time token for each form as it is drawn (server/same-request.ts).
  const hidden = (more: Readonly<Record<string, string>> = {}) => ({
    ...base,
    ...more,
    [requestTokenField]: randomUUID(),
  });
  const mayPutBack =
    holder !== undefined &&
    allows(holder, 'bin.restore', { type: 'program', id: season.programId });
  const labels = displayLabels(t);
  const divisions = listed.ok ? listed.value : [];
  const top = divisions.filter((d) => d.parentDivisionId === null);
  const under = (parent: DivisionRecord) =>
    divisions.filter((d) => d.parentDivisionId === parent.id);
  const panel = (division: DivisionRecord) => (
    <DivisionPanel
      key={division.id}
      division={division}
      teams={teams.filter((team) => team.divisionId === division.id)}
      hasUnder={under(division).length > 0}
      siblings={siblingsOf(divisions, division)}
      notice={notice?.thing === division.id ? notice : undefined}
      page={page}
      hidden={hidden}
      teamsHref={leagueUrl(addressee, 'admin-area', { area: 'teams' })}
    />
  );
  return (
    <main className="admin-season admin-divisions">
      {trail}
      <PageHead
        title={t('adminDivisions.title')}
        sub={`${t('adminDivisions.intro')} ${t('seasonSettings.seasonName', { name: season.name })}`}
      >
        {season.archived ? null : (
          <a className="ui-button" data-kind="main" data-icon="plus" href={`#${addDivisionAnchor}`}>
            {t('adminDivisions.add.title')}
          </a>
        )}
      </PageHead>
      {/* An archived season (O-12): its divisions are listed, with no form to change one. */}
      {season.archived ? <ArchivedSeasonNotice season={season.name} /> : null}
      {seasons.length < 2 ? null : (
        <div className="admin-season-pick">
          <OptionPicker
            name="season"
            label={labels.season}
            submitLabel={labels.show}
            action={divisionsAddress(addressee)}
            value={season.slug}
            options={seasons.map((s) => ({ value: s.slug, label: s.name }))}
          />
        </div>
      )}
      <div id={divisionsListAnchor} aria-label={t('adminDivisions.list')} role="region">
        {notice?.said === 'removed' ? (
          <SaidLine kind="removed">
            <p>{t('adminDivisions.said.removed', { name: notice.name ?? '' })}</p>
            {mayPutBack ? (
              <ListForm
                name="put-back"
                label={t('adminDivisions.putBack.label', { name: notice.name ?? '' })}
                action={restoreDivisionAction}
                permalink={`${page}#${divisionsListAnchor}`}
                hidden={hidden({ division: notice.thing })}
                button={t('adminDivisions.putBack.submit')}
              />
            ) : null}
          </SaidLine>
        ) : null}
        {!listed.ok ? (
          <StaffNotice kind="refused">
            <p>{t(divisionProblemKey(listed.error.code))}</p>
          </StaffNotice>
        ) : top.length === 0 && season.archived ? (
          <EmptyPanel text={t('adminDivisions.none')} />
        ) : top.length === 0 ? (
          <EmptyPanel
            text={t('adminDivisions.none')}
            action={{ href: `#${addDivisionAnchor}`, label: t('adminDivisions.add.title') }}
          />
        ) : null}
      </div>
      {season.archived ? (
        <ul className="staff-rows" data-divisions-read-only="">
          {top
            .flatMap((division) => [division, ...under(division)])
            .map((division) => (
              <li key={division.id} className="staff-row" dir="auto">
                {division.name}
              </li>
            ))}
        </ul>
      ) : (
        top.flatMap((division) => [panel(division), ...under(division).map(panel)])
      )}
      {season.archived ? null : (
        <section
          id={addDivisionAnchor}
          className="staff-panel"
          aria-labelledby="add-division-title"
        >
          <h2 id="add-division-title">{t('adminDivisions.add.title')}</h2>
          <ListForm
            name="add"
            label={t('adminDivisions.add.title')}
            action={createDivisionAction}
            permalink={`${page}#${addDivisionAnchor}`}
            hidden={hidden()}
            fields={divisionFields({ name: '', color: null })}
            button={t('adminDivisions.add.submit')}
          />
        </section>
      )}
    </main>
  );
}

function divisionFields(division: Pick<DivisionRecord, 'name' | 'color'>): readonly ListField[] {
  return [
    {
      kind: 'text',
      name: 'name',
      label: t('adminDivisions.field.name'),
      value: division.name,
      required: true,
      maxLength: 120,
      help: t('adminDivisions.field.nameHelp'),
    },
    {
      kind: 'color',
      name: 'color',
      label: t('adminDivisions.field.color'),
      value: division.color,
      ownName: 'useOwnColors',
      ownLabel: t('adminDivisions.field.useOwnColors'),
    },
  ];
}

function DivisionPanel({
  division,
  teams,
  hasUnder,
  siblings,
  notice,
  page,
  hidden,
  teamsHref,
}: {
  readonly division: DivisionRecord;
  readonly teams: readonly TeamRecord[];
  readonly hasUnder: boolean;
  readonly siblings: readonly DivisionRecord[];
  readonly notice: SavedNotice | undefined;
  readonly page: string;
  readonly hidden: (more?: Readonly<Record<string, string>>) => Record<string, string>;
  readonly teamsHref: string;
}) {
  const name = division.name;
  const anchor = divisionAnchor(division.id);
  const permalink = `${page}#${anchor}`;
  const place = siblings.findIndex((d) => d.id === division.id);
  const teamNames = namesList(teams.map((team) => team.name));
  const said =
    notice === undefined || notice.said === 'removed'
      ? undefined
      : (`adminDivisions.said.${notice.said}` as TextKey);
  const move = (direction: 'up' | 'down') => (
    <ListForm
      name={`move-${direction}`}
      label={t(`adminDivisions.move.${direction}Label`, { name })}
      action={moveDivisionAction}
      permalink={permalink}
      hidden={hidden({ division: division.id, direction })}
      button={t(`adminDivisions.move.${direction}`)}
      kind="quiet"
    />
  );
  return (
    <section
      id={anchor}
      className="staff-panel admin-division"
      data-division={name}
      aria-labelledby={`${anchor}-name`}
    >
      <div className="staff-panel-head">
        <h2 id={`${anchor}-name`} className="admin-division-name" dir="auto">
          <Emblem name={name} color={division.color} size="small" /> {name}
        </h2>
      </div>
      <p className="staff-quiet" data-division-teams={teams.length}>
        {teams.length === 0
          ? t('adminDivisions.teamsNone')
          : t.plural('adminDivisions.teams', teams.length, { names: teamNames })}
      </p>
      {said === undefined ? null : (
        <SaidLine kind="saved">
          <p>{t(said, { name })}</p>
        </SaidLine>
      )}
      <ListForm
        name="change"
        label={t('adminDivisions.change.label', { name })}
        action={saveDivisionAction}
        permalink={permalink}
        hidden={hidden({ division: division.id, version: String(division.version) })}
        fields={divisionFields(division)}
        button={t('adminDivisions.change.submit')}
      />
      {siblings.length < 2 ? null : (
        <div className="staff-actions">
          {place > 0 ? move('up') : null}
          {place < siblings.length - 1 ? move('down') : null}
        </div>
      )}
      <div className="admin-division-remove" data-kind="danger">
        {teams.length > 0 ? (
          <p data-held="teams">
            {t.plural('adminDivisions.heldByTeams', teams.length, { name })}{' '}
            <a href={teamsHref}>{t('adminDivisions.toTeams')}</a>
          </p>
        ) : hasUnder ? (
          <p data-held="divisions">{t('adminDivisions.heldByDivisions', { name })}</p>
        ) : (
          <>
            <p className="staff-quiet">{t('adminDivisions.remove.body')}</p>
            <ListForm
              name="remove"
              label={t('adminDivisions.remove.label', { name })}
              action={removeDivisionAction}
              permalink={`${page}#${divisionsListAnchor}`}
              hidden={hidden({ division: division.id })}
              confirm={t('adminDivisions.remove.confirm', { name })}
              button={t('adminDivisions.remove.submit')}
              kind="danger"
            />
          </>
        )}
      </div>
    </section>
  );
}
