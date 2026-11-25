// League settings → Bin (step 2.77, A-5, P4 §5): what was removed from the league, teams,
// divisions, people, games, venues and courts, each with "Bring it back". Reached from where things are removed:
// "Removed teams and people" on Teams, "Removed games" on Schedule, and the notice right
// after a removal. The owner and admins see the whole bin; a scheduler, a registrar or an
// admin of one program sees the part they may bring back (leagues.list_bin_part, T-308),
// and someone who may bring back nothing is refused. A refusal to bring something back is said beside it,
// with what to do first (a game held back by its team names the team and leads to its
// line); what was brought back is said at the top, with the way to it.
import { getScheduleDraft, leagueUrl, listBinPart } from '@srleagues/core';
import { EmptyPanel, PageHead } from '@srleagues/ui';
import { forbidden } from 'next/navigation';
import { webPorts } from '../../server/container.ts';
import { commandContextOf } from '../../server/context.ts';
import type { LeagueTimes } from '../../server/game-when.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { locale, t } from '../../server/messages.ts';
import { noticeHolderOf, savedNoticesHere } from '../../server/saved-notice.ts';
import { StaffNotice } from '../staff/index.ts';
import { nameBeforeStop } from '../list-forms/index.ts';
import { problemKey } from '../teams-area/answer.ts';
import { requestTokenField } from '../../server/same-request.ts';
import { bringBackAction } from './actions.ts';
import { binAnswerOf } from './bin-answer.ts';
import { binAnchors } from './bin-anchors.ts';
import {
  binKindsShown,
  binView,
  clashWords,
  firstChildSaid,
  gameBackOf,
  nameTakenBy,
  teamsInBinWords,
  type BinKindShown,
  type BinRow,
} from './bin-view.ts';

/** Each kind's part: its words' key and where it starts. */
const parts = {
  team: { words: 'teams', anchor: binAnchors.teams },
  division: { words: 'divisions', anchor: binAnchors.divisions },
  person: { words: 'people', anchor: binAnchors.people },
  game: { words: 'games', anchor: binAnchors.games },
  venue: { words: 'venues', anchor: binAnchors.venues },
  court: { words: 'courts', anchor: binAnchors.courts },
} as const;

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
  // Teams in this person's own part of the bin: only those are linked to (and theirs to bring back).
  const myTeams = new Set(rows.team.map((r) => r.id));
  // The answer to "Bring it back", taken once (bin-answer.ts, T-426): never from the address.
  const holder = noticeHolderOf(context);
  const answer = binAnswerOf(
    holder === undefined ? undefined : savedNoticesHere().take(holder, 'bin'),
  );
  const refusedId = answer?.kind === 'refused' ? answer.id : undefined;
  const why = answer?.kind === 'refused' ? answer.why : '';
  const refusal = refusedId === undefined ? undefined : problemKey({ problem: why });
  // Another team took the name (S-83): which one, and the way to it.
  const refusedTeam = listed.value.items.find(
    (item) => item.id === refusedId && item.kind === 'team',
  );
  // A second team of the same name, or of the same short name (A-19): either refusal
  // names that team, the one holding the full name or the one holding the short name.
  const shortTaken = why.endsWith('.team-short-name-taken');
  const takenBy =
    refusedTeam === undefined ||
    refusedTeam.seasonId === null ||
    !(shortTaken || why.endsWith('.team-name-taken'))
      ? undefined
      : nameTakenBy(
          refusedTeam,
          await ports.adminTeams.teams(context, refusedTeam.seasonId),
          shortTaken,
        );
  const backId = answer?.kind === 'back' ? answer.id : '';
  const backTo = (kind: string): string | undefined => {
    if (!/^[0-9a-f-]{36}$/.test(backId)) return undefined;
    if (kind === 'team') return leagueUrl(here, 'admin-area', { area: 'teams', subpath: [backId] });
    if (kind === 'person') {
      return leagueUrl(here, 'admin-area', { area: 'people', subpath: [backId] });
    }
    if (kind === 'division') {
      return leagueUrl(here, 'admin-area', { area: 'season', subpath: ['divisions'] });
    }
    if (kind === 'venue' || kind === 'court') {
      return leagueUrl(here, 'admin-area', { area: 'schedule', subpath: ['venues'] });
    }
    return leagueUrl(here, 'admin-area', { area: 'schedule' });
  };
  const heldByTeam = (row: BinRow) =>
    row.teamsInBin.length > 0 && why.endsWith('.game-part-in-bin');

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
          <span
            className="ui-notice"
            data-kind="error"
            role="alert"
            data-bin-answer={row.id}
            data-said="refused"
          >
            {heldByTeam(row)
              ? teamsInBinWords(row.teamsInBin, myTeams, 'refusal')
              : takenBy !== undefined
                ? // A second team of the same name (A-19): which one, and what to do.
                  t(shortTaken ? 'admin.bin.shortNameTakenBy' : 'admin.bin.nameTakenBy', {
                    name: takenBy.name,
                    slug: takenBy.slug,
                  })
                : t('admin.bin.notBack', { name: nameBeforeStop(row.title), problem: t(refusal) })}
            {!heldByTeam(row)
              ? null
              : row.teamsInBin
                  .filter((team) => myTeams.has(team.id))
                  .map((team) => (
                    <span key={team.id}>
                      {' '}
                      <a dir="auto" href={`#bin-${team.id}`}>
                        {t('admin.bin.game.teamInBinLink', { name: team.name })}
                      </a>
                    </span>
                  ))}
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
        <input type="hidden" name={requestTokenField} value={crypto.randomUUID()} />
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

  const backKind = answer?.kind === 'back' ? answer.what : undefined;
  const backHref = backKind === undefined ? undefined : backTo(backKind);
  // A game brought back is a schedule change (A-19): its revision, who it reaches (A-7)
  // and the games now at its time, named. Only what the restore itself left on the server
  // for this person is said, never numbers from the address.
  const gameBack = answer?.kind === 'back' ? answer.game : undefined;
  const firstChild = answer?.kind === 'back' && answer.firstChild;
  const backName = answer?.kind === 'back' ? answer.name : '';
  const clashIds = answer?.kind === 'back' ? answer.clashes : [];
  const seasonId = gameBack?.seasonId;
  const clashes =
    clashIds.length === 0 || seasonId === undefined
      ? []
      : await (async () => {
          const draft = await getScheduleDraft(context, { seasonId }, ports.scheduleAdmin.deps);
          const teams = await ports.scheduleAdmin.teamsOf(here.id, seasonId);
          const names = Object.fromEntries(teams.map((team) => [team.id, team.name]));
          const games = draft.ok ? draft.value.published.games : [];
          return clashIds.map((id) => {
            const game = games.find((g) => g.id === id);
            return { id, words: game === undefined ? undefined : clashWords(game, names, locale) };
          });
        })();
  const nothing = binKindsShown.every((kind) => rows[kind].length === 0);
  return (
    <main className="admin-teams">
      <PageHead title={t('admin.bin.title')} sub={t('admin.bin.sub')} />
      {backKind === undefined ? null : (
        <StaffNotice
          key={backId}
          kind="saved"
          data={{ 'data-bin-answer': backId, 'data-said': 'back' }}
        >
          <p>
            {backName === ''
              ? t('admin.bin.backUnnamed')
              : t('admin.bin.backNamed', { name: nameBeforeStop(backName) })}{' '}
            {t(`admin.bin.backDone.${backKind}`)}{' '}
            {backHref === undefined ? null : (
              <a href={backHref}>{t(`admin.bin.backLink.${backKind}`)}</a>
            )}
          </p>
          {firstChild ? <p data-says="first-child">{t('adminPeople.firstChild')}</p> : null}
          {gameBack === undefined ? null : (
            <p data-bin-game-back={gameBack.revision}>
              {t('admin.bin.gameBack', gameBack)}
              {clashes.length === 0 ? null : (
                <> {t.plural('admin.bin.gameBackClashes', clashes.length)}</>
              )}
            </p>
          )}
          {clashes.length === 0 ? null : (
            <>
              <ul>
                {clashes.map((clash) =>
                  clash.words === undefined ? null : (
                    <li key={clash.id} data-bin-game-clash={clash.id} dir="auto">
                      {clash.words}
                    </li>
                  ),
                )}
              </ul>
              <p>
                <a href={leagueUrl(here, 'admin-area', { area: 'schedule' })}>
                  {t('admin.bin.gameBackCheck')}
                </a>
              </p>
            </>
          )}
        </StaffNotice>
      )}
      <p>{t('admin.bin.keep', { days: listed.value.keepDays })}</p>
      {nothing ? (
        <EmptyPanel
          text={t(
            binKindsShown.every((kind) => mine.has(kind))
              ? 'admin.bin.empty'
              : 'admin.bin.emptyMine',
          )}
        />
      ) : null}
      {binKindsShown
        .filter((kind) => mine.has(kind))
        .map((kind: BinKindShown) => (
          <Part
            key={kind}
            id={parts[kind].anchor}
            title={t(`admin.bin.${parts[kind].words}.title`)}
            none={t(`admin.bin.${parts[kind].words}.none`)}
            of={rows[kind]}
          />
        ))}
    </main>
  );
}
