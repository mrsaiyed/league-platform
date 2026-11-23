// League settings → Bin (step 2.77, A-5, P4 §5): what was removed from the league, teams,
// people and games, each with "Bring it back". Reached from where things are removed:
// "Removed teams and people" on Teams, "Removed games" on Schedule, and the notice right
// after a removal. The owner and admins see the whole bin; a scheduler, a registrar or an
// admin of one program sees the part they may bring back (leagues.list_bin_part, T-308),
// and someone who may bring back nothing is refused. A refusal to bring something back is said beside it,
// with what to do first; what was brought back is said at the top, with the way to it.
import { leagueUrl, listBinPart } from '@srleagues/core';
import { EmptyPanel, PageHead } from '@srleagues/ui';
import { forbidden } from 'next/navigation';
import { webPorts } from '../../server/container.ts';
import { commandContextOf } from '../../server/context.ts';
import type { LeagueTimes } from '../../server/game-when.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { locale, t } from '../../server/messages.ts';
import { StaffNotice } from '../staff/index.ts';
import { problemKey } from '../teams-area/answer.ts';
import { bringBackAction } from './actions.ts';
import { binAnchors } from './bin-anchors.ts';
import { binView, nameTakenBy, type BinKindShown, type BinRow } from './bin-view.ts';

type Query = Readonly<Record<string, string | string[] | undefined>>;

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export async function BinPage({
  league,
  query,
}: {
  readonly league: string;
  readonly query: Query;
}) {
  const view = await loadLeaguePage(league, 'admin');
  const here = view.context.league;
  const context = commandContextOf(view.context);
  const ports = await webPorts();
  const listed = await listBinPart(context, {}, ports.adminPeople.putBack);
  if (!listed.ok || listed.value.kinds.length === 0) return forbidden();
  const mine = new Set<string>(listed.value.kinds);
  const clock = await ports.publicSchedule.clockOf(here.id);
  const times: LeagueTimes = { locale, timeZone: clock.timeZone };
  const rows = binView(listed.value.items, times);
  const refusedId = one(query['not']);
  const refusal = refusedId === undefined ? undefined : problemKey({ problem: one(query['why']) });
  // Another team took the name (S-83): which one, and the way to it.
  const refusedTeam = listed.value.items.find(
    (item) => item.id === refusedId && item.kind === 'team',
  );
  const takenBy =
    refusedTeam === undefined ||
    refusedTeam.seasonId === null ||
    !(one(query['why']) ?? '').endsWith('.team-name-taken')
      ? undefined
      : nameTakenBy(refusedTeam, await ports.adminTeams.teams(context, refusedTeam.seasonId));
  const back = one(query['back']);
  const backId = one(query['id']) ?? '';
  const backTo = (kind: string): string | undefined => {
    if (!/^[0-9a-f-]{36}$/.test(backId)) return undefined;
    if (kind === 'team') return leagueUrl(here, 'admin-area', { area: 'teams', subpath: [backId] });
    if (kind === 'person') {
      return leagueUrl(here, 'admin-area', { area: 'people', subpath: [backId] });
    }
    return leagueUrl(here, 'admin-area', { area: 'schedule' });
  };

  const Row = ({ row }: { readonly row: BinRow }) => (
    <li id={`bin-${row.id}`} className="staff-row" data-bin={row.kind}>
      <span className="staff-row-words">
        <strong dir="auto">{row.title}</strong>
        {row.facts.map((fact) => (
          <span key={fact} className="staff-row-facts" dir="auto">
            {fact}
          </span>
        ))}
        {refusedId === row.id && refusal !== undefined ? (
          <span className="ui-notice" data-kind="error" role="alert">
            {t('admin.bin.notBack', { problem: t(refusal) })}
            {takenBy === undefined ? null : (
              <>
                {' '}
                <a
                  dir="auto"
                  href={leagueUrl(here, 'admin-area', { area: 'teams', subpath: [takenBy.id] })}
                >
                  {t('admin.bin.takenBy', { name: takenBy.name })}
                </a>
              </>
            )}
          </span>
        ) : null}
      </span>
      <form action={bringBackAction}>
        <input type="hidden" name="league" value={here.slug} />
        <input type="hidden" name="kind" value={row.kind} />
        <input type="hidden" name="id" value={row.id} />
        <button type="submit" className="ui-button">
          {t('admin.bin.back')}
        </button>
      </form>
    </li>
  );

  const Part = ({
    id,
    title,
    none,
    of,
  }: {
    readonly id: string;
    readonly title: string;
    readonly none: string;
    readonly of: readonly BinRow[];
  }) => (
    <section id={id} className="staff-panel">
      <h2>{title}</h2>
      {of.length === 0 ? (
        <p>{none}</p>
      ) : (
        <ul className="staff-rows">
          {of.map((row) => (
            <Row key={row.id} row={row} />
          ))}
        </ul>
      )}
    </section>
  );

  const backKind: BinKindShown | undefined =
    back === 'team' || back === 'person' || back === 'game' ? back : undefined;
  const backHref = backKind === undefined ? undefined : backTo(backKind);
  const nothing = rows.teams.length + rows.people.length + rows.games.length === 0;
  return (
    <main className="admin-teams">
      <PageHead title={t('admin.bin.title')} sub={t('admin.bin.sub')} />
      {backKind === undefined ? null : (
        <StaffNotice kind="saved">
          <p>
            {t(`admin.bin.backDone.${backKind}`)}{' '}
            {backHref === undefined ? null : (
              <a href={backHref}>{t(`admin.bin.backLink.${backKind}`)}</a>
            )}
          </p>
        </StaffNotice>
      )}
      <p>{t('admin.bin.keep', { days: listed.value.keepDays })}</p>
      {nothing ? <EmptyPanel text={t('admin.bin.empty')} /> : null}
      {!mine.has('team') ? null : (
        <Part
          id={binAnchors.teams}
          title={t('admin.bin.teams.title')}
          none={t('admin.bin.teams.none')}
          of={rows.teams}
        />
      )}
      {!mine.has('person') ? null : (
        <Part
          id={binAnchors.people}
          title={t('admin.bin.people.title')}
          none={t('admin.bin.people.none')}
          of={rows.people}
        />
      )}
      {!mine.has('game') ? null : (
        <Part
          id={binAnchors.games}
          title={t('admin.bin.games.title')}
          none={t('admin.bin.games.none')}
          of={rows.games}
        />
      )}
    </main>
  );
}
