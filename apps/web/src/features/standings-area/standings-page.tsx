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
import {
  leagueUrl,
  listAdjustments,
  type LevelSet,
  type SeasonAdjustment,
  type SeasonCoinFlip,
} from '@srleagues/core';
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
import {
  addAdjustmentAction,
  awardGameAction,
  overturnResultAction,
  recordCoinFlipAction,
  removeAdjustmentAction,
  removeCoinFlipAction,
} from './actions.ts';
import { adjustmentProblemKey } from './adjustment-answers.ts';
import { changesText, gameName } from './adjustment-text.ts';
import {
  addAdjustmentAnchor,
  adjustmentAnchor,
  awardGameAnchor,
  overturnResultAnchor,
  adjustmentsListAnchor,
  coinFlipsAnchor,
  levelSetAnchor,
  standingsAreaAddress,
} from './standings-address.ts';

const reasonField = (name: string, help: string, label: string, maxLength = 500): ListField => ({
  kind: 'text',
  name,
  label,
  value: '',
  required: true,
  maxLength,
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
  const hidden = (more: Readonly<Record<string, string>> = {}): Hidden => ({
    league: addressee.slug,
    season: seasonId,
    seasonSlug: asked ?? '',
    ...more,
    [requestTokenField]: randomUUID(),
  });
  const adjustments = listed.ok ? listed.value.adjustments : [];
  const levelSets = listed.ok ? listed.value.levelSets : [];
  const unusedFlips = listed.ok ? listed.value.unusedFlips : [];
  const names = (teamIds: readonly string[]) => teamIds.map(nameOf).join(', ');
  const options = (listed.ok ? listed.value.teams : [])
    .map((team) => ({ value: team.teamId, label: nameOf(team.teamId) }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const games = (listed.ok ? listed.value.games : []).map((g) => ({
    value: g.gameId,
    label: gameName(g, nameOf),
  }));
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
        {notice === undefined ||
        notice.thing !== seasonId ||
        !['added', 'removed'].includes(notice.said) ? null : (
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
              paired={
                (a.pairedWith ?? null) !== null || adjustments.some((o) => o.pairedWith === a.id)
              }
              // Its own place: with scripts off, React gives a refusal back to the form
              // whose action and permalink match, so each adjustment's form has its own.
              permalink={`${page}#${adjustmentAnchor(a.id)}`}
              hidden={hidden({ adjustment: a.id })}
            />
          ))
        )}
      </section>
      <section id={coinFlipsAnchor} className="staff-panel" aria-labelledby="coin-flips-title">
        <h2 id="coin-flips-title">{t('adminStandings.flip.title')}</h2>
        {notice === undefined ||
        notice.thing !== seasonId ||
        !['flip-saved', 'flip-removed'].includes(notice.said) ? null : (
          <SaidLine kind={notice.said === 'flip-removed' ? 'removed' : 'saved'}>
            <p>
              {t(
                notice.said === 'flip-removed'
                  ? 'adminStandings.flip.said.removed'
                  : 'adminStandings.flip.said.saved',
                { what: notice.name ?? '' },
              )}
            </p>
          </SaidLine>
        )}
        <p className="staff-quiet">{t('adminStandings.flip.intro')}</p>
        {levelSets.length === 0 ? (
          <p className="staff-quiet">{t('adminStandings.flip.none')}</p>
        ) : (
          levelSets.map((set) => (
            <LevelSetPart
              key={set.teamIds.join('-')}
              set={set}
              nameOf={nameOf}
              permalink={`${page}#${levelSetAnchor(set.teamIds)}`}
              hidden={(more) => hidden({ teams: set.teamIds.join(','), ...more })}
            />
          ))
        )}
        {unusedFlips.length === 0 ? null : (
          <>
            <h3>{t('adminStandings.flip.unused')}</h3>
            <p className="staff-quiet">{t('adminStandings.flip.unusedHelp')}</p>
            {unusedFlips.map((flip) => (
              <div key={flip.id} className="admin-adjustment" data-unused-flip={flip.id}>
                <FlipLine flip={flip} names={names(flip.teamIds)} />
                <RemoveFlip
                  flip={flip}
                  names={names(flip.teamIds)}
                  permalink={`${page}#${coinFlipsAnchor}`}
                  hidden={hidden({ teams: flip.teamIds.join(','), flip: flip.id })}
                />
              </div>
            ))}
          </>
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
      <section
        id={overturnResultAnchor}
        className="staff-panel"
        aria-labelledby="overturn-result-title"
      >
        <h2 id="overturn-result-title">{t('adminStandings.overturn.title')}</h2>
        <p className="staff-quiet">{t('adminStandings.overturn.intro')}</p>
        {games.length === 0 ? (
          <p className="staff-quiet">{t('adminStandings.overturn.none')}</p>
        ) : (
          <ListForm
            name="overturn-result"
            label={t('adminStandings.overturn.title')}
            action={overturnResultAction}
            permalink={`${page}#${overturnResultAnchor}`}
            hidden={hidden()}
            fields={[
              {
                kind: 'select',
                name: 'game',
                label: t('adminStandings.field.game'),
                value: games[0]?.value ?? '',
                options: games,
              },
              reasonField(
                'reason',
                t('adminStandings.field.reasonHelp'),
                t('adminStandings.field.reason'),
                400,
              ),
            ]}
            button={t('adminStandings.overturn.submit')}
          />
        )}
      </section>
      <section id={awardGameAnchor} className="staff-panel" aria-labelledby="award-game-title">
        <h2 id="award-game-title">{t('adminStandings.award.title')}</h2>
        <p className="staff-quiet">{t('adminStandings.award.intro')}</p>
        {options.length < 2 ? (
          <p className="staff-quiet">{t('adminStandings.noTeams')}</p>
        ) : (
          <ListForm
            name="award-game"
            label={t('adminStandings.award.title')}
            action={awardGameAction}
            permalink={`${page}#${awardGameAnchor}`}
            hidden={hidden()}
            fields={[
              {
                kind: 'select',
                name: 'winner',
                label: t('adminStandings.field.winner'),
                value: options[0]?.value ?? '',
                options,
              },
              {
                kind: 'select',
                name: 'loser',
                label: t('adminStandings.field.loser'),
                value: options[1]?.value ?? '',
                options,
              },
              reasonField(
                'reason',
                t('adminStandings.field.reasonHelp'),
                t('adminStandings.field.reason'),
              ),
            ]}
            button={t('adminStandings.award.submit')}
          />
        )}
      </section>
    </main>
  );
}

type Hidden = Readonly<Record<string, string>>;

/** How the flip was made and when, and its note. */
function FlipLine({ flip, names }: { readonly flip: SeasonCoinFlip; readonly names: string }) {
  const date = flip.recordedAt.slice(0, 10);
  return (
    <>
      <h3 dir="auto">{names}</h3>
      <p data-flip-made={flip.method}>
        {t(flip.method === 'drawn' ? 'adminStandings.flip.drawn' : 'adminStandings.flip.byHand', {
          date,
        })}
      </p>
      {flip.note === null ? null : <p dir="auto">{flip.note}</p>}
    </>
  );
}

function RemoveFlip({
  flip,
  names,
  permalink,
  hidden,
}: {
  readonly flip: SeasonCoinFlip;
  readonly names: string;
  readonly permalink: string;
  readonly hidden: Hidden;
}) {
  return (
    <div data-kind="danger" data-remove-flip={flip.id}>
      <ListForm
        name="remove-coin-flip"
        label={t('adminStandings.flip.remove.label', { teams: names })}
        action={removeCoinFlipAction}
        permalink={permalink}
        hidden={hidden}
        fields={[
          reasonField(
            'reason',
            t('adminStandings.field.removeReasonHelp'),
            t('adminStandings.field.removeReason'),
          ),
        ]}
        confirm={t('adminStandings.flip.remove.confirm')}
        button={t('adminStandings.flip.remove.submit')}
        kind="danger"
      />
    </div>
  );
}

/** One set of teams level after every tiebreaker: its order, and the forms to set it. */
function LevelSetPart({
  set,
  nameOf,
  permalink,
  hidden,
}: {
  readonly set: LevelSet;
  readonly nameOf: (teamId: string) => string;
  readonly permalink: string;
  readonly hidden: (more?: Hidden) => Hidden;
}) {
  const order = set.flip?.teamIds ?? set.teamIds;
  const names = order.map(nameOf).join(', ');
  const options = set.teamIds.map((id) => ({ value: id, label: nameOf(id) }));
  const note: ListField = {
    kind: 'text',
    name: 'note',
    label: t('adminStandings.flip.note'),
    value: '',
    required: false,
    maxLength: 500,
    help: t('adminStandings.flip.noteHelp'),
  };
  return (
    <div
      id={levelSetAnchor(set.teamIds)}
      className="admin-adjustment"
      data-level-set={set.teamIds.map(nameOf).join(',')}
      data-flipped={set.flip === null ? 'no' : 'yes'}
    >
      {set.flip === null ? (
        <>
          <h3 dir="auto">{names}</h3>
          <p>{t('adminStandings.flip.level')}</p>
        </>
      ) : (
        <FlipLine flip={set.flip} names={names} />
      )}
      <div data-flip-form="by-hand">
        <ListForm
          name="record-coin-flip"
          label={t('adminStandings.flip.record', { teams: names })}
          action={recordCoinFlipAction}
          permalink={permalink}
          hidden={hidden({ method: 'by-hand' })}
          fields={[
            ...order.map(
              (teamId, i): ListField => ({
                kind: 'select',
                name: `place${i + 1}`,
                label: t('adminStandings.flip.place', { place: String(i + 1) }),
                value: teamId,
                options,
              }),
            ),
            note,
          ]}
          button={t('adminStandings.flip.submit')}
        />
      </div>
      <div data-flip-form="drawn">
        <ListForm
          name="draw-coin-flip"
          label={t('adminStandings.flip.drawLabel', { teams: names })}
          action={recordCoinFlipAction}
          permalink={permalink}
          hidden={hidden({ method: 'drawn' })}
          fields={[{ ...note, help: t('adminStandings.flip.drawHelp') }]}
          button={t('adminStandings.flip.drawSubmit')}
        />
      </div>
      {set.flip === null ? null : (
        <RemoveFlip
          flip={set.flip}
          names={names}
          permalink={permalink}
          hidden={hidden({ flip: set.flip.id })}
        />
      )}
    </div>
  );
}

function AdjustmentPart({
  adjustment,
  team,
  paired,
  permalink,
  hidden,
}: {
  readonly adjustment: SeasonAdjustment;
  readonly team: string;
  readonly paired: boolean;
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
      {!paired ? null : <p className="staff-quiet">{t('adminStandings.pairNote')}</p>}
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
