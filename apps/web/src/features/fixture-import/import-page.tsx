import { getFixtureImport, leagueUrl, type FixtureImportView } from '@srleagues/core';
import { webPorts } from '../../server/container.ts';
import { commandContextOf } from '../../server/context.ts';
import type { ImportNames } from '../../server/fixture-import-ports.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { locale, t } from '../../server/messages.ts';
import {
  applyImportAction,
  discardImportAction,
  undoImportAction,
  uploadFixturesAction,
} from './actions.ts';
import { first, importNotice, type SearchParams } from './import-notice.ts';
import { maxUploadBytes } from './run-import-action.ts';

/** The import's size limit in the page's words, from the limit itself so it cannot drift. */
const sizeLimitText = new Intl.NumberFormat(locale, {
  style: 'unit',
  unit: 'kilobyte',
  maximumFractionDigits: 0,
}).format(maxUploadBytes / 1000);

const columnList = new Intl.ListFormat(locale, { style: 'short', type: 'unit' });

const dayFormat = new Intl.DateTimeFormat(locale, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

function dayText(date: string): string {
  const day = new Date(`${date}T00:00:00.000Z`);
  return Number.isNaN(day.getTime()) ? date : dayFormat.format(day);
}

/** The hidden fields every step on an import carries: the league's route value, which import. */
function ImportFields({
  league,
  view,
}: {
  readonly league: string;
  readonly view: FixtureImportView;
}) {
  return (
    <>
      <input type="hidden" name="league" value={league} />
      <input type="hidden" name="importId" value={view.id} />
      <input type="hidden" name="version" value={view.version} />
    </>
  );
}

function ProblemList({ view }: { readonly view: FixtureImportView }) {
  const count = view.problems.length + view.omittedProblems;
  if (count === 0) return null;
  return (
    <section aria-labelledby="import-problems">
      <h2 id="import-problems">{t.plural('admin.import.problemsTitle', count)}</h2>
      <p>{t('admin.import.problemsHelp')}</p>
      <ul>
        {view.problems.map((p, n) => (
          <li key={`${p.rowNumber}-${n}`}>
            {t('admin.import.problemRow', { row: p.rowNumber, message: p.message })}
          </li>
        ))}
      </ul>
      {view.omittedProblems > 0 ? (
        <p>{t.plural('admin.import.moreProblems', view.omittedProblems)}</p>
      ) : null}
      {view.problemsNote === null ? null : <p>{view.problemsNote}</p>}
    </section>
  );
}

function WarningList({ view }: { readonly view: FixtureImportView }) {
  if (view.warnings.length === 0) return null;
  return (
    <section aria-labelledby="import-warnings">
      <h2 id="import-warnings">{t('admin.import.warningsTitle')}</h2>
      <ul>
        {view.warnings.map((w, n) => (
          <li key={`${w.rowNumber}-${n}`}>
            {t('admin.import.problemRow', { row: w.rowNumber, message: w.message })}
          </li>
        ))}
      </ul>
    </section>
  );
}

function GameTable({
  view,
  names,
}: {
  readonly view: FixtureImportView;
  readonly names: ImportNames;
}) {
  if (view.games.length === 0) return null;
  const none = t('admin.import.none');
  return (
    <section aria-labelledby="import-games">
      <h2 id="import-games">{t('admin.import.gamesTitle')}</h2>
      {/* A wide table scrolls by itself at phone width, never the whole page (A-2). */}
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th scope="col">{t('admin.import.col.row')}</th>
              <th scope="col">{t('admin.import.col.date')}</th>
              <th scope="col">{t('admin.import.col.time')}</th>
              <th scope="col">{t('admin.import.col.home')}</th>
              <th scope="col">{t('admin.import.col.away')}</th>
              <th scope="col">{t('admin.import.col.place')}</th>
              <th scope="col">{t('admin.import.col.score')}</th>
            </tr>
          </thead>
          <tbody>
            {view.games.map((g) => {
              const venue = g.venueId === null ? undefined : names.venues[g.venueId];
              const place =
                venue === undefined
                  ? none
                  : g.court === null
                    ? venue
                    : t('admin.import.place', { venue, court: g.court });
              return (
                <tr key={g.rowNumber}>
                  <td>{g.rowNumber}</td>
                  <td>{dayText(g.date)}</td>
                  <td>{g.time ?? none}</td>
                  <td>{names.teams[g.homeTeamId] ?? none}</td>
                  <td>{names.teams[g.awayTeamId] ?? none}</td>
                  <td>{place}</td>
                  <td>
                    {g.finalScore === null
                      ? none
                      : t('admin.import.score', {
                          home: g.finalScore.home,
                          away: g.finalScore.away,
                        })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {view.gameCount > view.games.length ? (
        <p>{t.plural('admin.import.moreGames', view.gameCount - view.games.length)}</p>
      ) : null}
    </section>
  );
}

function ImportReport({
  league,
  view,
  names,
  reloadHref,
}: {
  readonly league: string;
  readonly view: FixtureImportView;
  readonly names: ImportNames;
  readonly reloadHref: string;
}) {
  return (
    <section aria-labelledby="import-report" className="admin-import-report">
      <h2 id="import-report">
        {view.fileName === null
          ? t('admin.import.noFileName')
          : t('admin.import.fileName', { name: view.fileName })}
      </h2>
      <p>{t(`admin.import.status.${view.status}`)}</p>
      {view.status === 'reading' ? (
        <>
          <p>
            <a href={reloadHref}>{t('admin.import.reload')}</a>
          </p>
          <form action={discardImportAction}>
            <ImportFields league={league} view={view} />
            <button type="submit">{t('admin.import.discard')}</button>
          </form>
        </>
      ) : null}
      {view.fileProblem === null ? null : <p role="alert">{view.fileProblem}</p>}
      {view.status === 'reading' || view.fileProblem !== null ? null : (
        <>
          <p>
            {t.plural('admin.import.rowsRead', view.rowsRead)}{' '}
            {t.plural('admin.import.gamesReady', view.gameCount)}
            {view.scoreCount > 0 ? <> {t.plural('admin.import.scores', view.scoreCount)}</> : null}
          </p>
          {view.columnsFound.length > 0 ? (
            <p>{t('admin.import.columns', { columns: columnList.format(view.columnsFound) })}</p>
          ) : null}
        </>
      )}
      {view.status === 'ready' ? (
        <form action={applyImportAction}>
          <ImportFields league={league} view={view} />
          <button type="submit">{t.plural('admin.import.apply', view.gameCount)}</button>
        </form>
      ) : null}
      {view.status === 'applied' ? (
        <>
          {view.scoresWaiting > 0 ? (
            <p>{t.plural('admin.import.scoresWaiting', view.scoresWaiting)}</p>
          ) : null}
          {view.scoresRecorded > 0 ? (
            <p>{t.plural('admin.import.scoresRecorded', view.scoresRecorded)}</p>
          ) : null}
          <p>{t('admin.import.undoHelp')}</p>
          <form action={undoImportAction}>
            <ImportFields league={league} view={view} />
            <button type="submit">{t('admin.import.undo')}</button>
          </form>
        </>
      ) : null}
      <ProblemList view={view} />
      <WarningList view={view} />
      <GameTable view={view} names={names} />
    </section>
  );
}

/**
 * `/{league}/admin/schedule/import`: upload a fixtures spreadsheet, see the report with every
 * row's problem in plain words, add the games to the schedule draft, and undo that (P7 §4
 * "Also", O-4). The file is read once and never kept or served (T-80).
 */
export async function ImportPage({
  league,
  search,
}: {
  /** The route's `[league]` value. */
  readonly league: string;
  readonly search: SearchParams;
}) {
  const view = await loadLeaguePage(league, 'admin', 'schedule');
  const addressee = view.context.league;
  const { fixtureImport } = await webPorts();
  const context = commandContextOf(view.context);
  const season = await fixtureImport.currentSeasonOf(addressee.id);
  const here = leagueUrl(addressee, 'admin-area', { area: 'schedule', subpath: ['import'] });
  const notice = importNotice(search);

  const importId = first(search['import']);
  const found =
    importId === undefined
      ? undefined
      : await getFixtureImport(context, { importId }, fixtureImport.deps);
  const shown = found?.ok === true && found.value.seasonId === season?.id ? found.value : undefined;
  const names =
    shown === undefined ? undefined : await fixtureImport.namesOf(addressee.id, shown.seasonId);
  const draftCount =
    season === undefined ? 0 : await fixtureImport.draftChangeCount(addressee.id, season.id);

  return (
    <main className="admin-import">
      <h1>{t('admin.import.title')}</h1>
      <p>
        <a href={leagueUrl(addressee, 'admin-area', { area: 'schedule' })}>
          {t('admin.import.backToSchedule')}
        </a>
      </p>
      <p>{t('admin.import.intro')}</p>
      {notice === undefined ? null : (
        <div role={notice.problem ? 'alert' : 'status'}>
          <p>{t(notice.key, { size: sizeLimitText })}</p>
          {notice.clashes === undefined ? null : (
            <p>{t.plural('admin.import.clashes', notice.clashes)}</p>
          )}
        </div>
      )}
      {season === undefined ? (
        <p>{t('admin.import.noSeason')}</p>
      ) : (
        <>
          <p>{t('admin.import.season', { season: season.name })}</p>
          <p>
            {draftCount === 0
              ? t('admin.import.draftEmpty')
              : t.plural('admin.import.draft', draftCount)}
          </p>
          {importId !== undefined && shown === undefined && notice?.problem !== true ? (
            <p role="alert">{t('admin.import.error.import-not-found')}</p>
          ) : null}
          {shown === undefined || names === undefined ? null : (
            <ImportReport
              league={league}
              view={shown}
              names={names}
              reloadHref={`${here}?${new URLSearchParams({ import: shown.id })}`}
            />
          )}
          <section aria-labelledby="import-upload">
            <h2 id="import-upload">
              {shown === undefined ? t('admin.import.upload') : t('admin.import.uploadAnother')}
            </h2>
            <p>{t('admin.import.help')}</p>
            <form action={uploadFixturesAction}>
              <input type="hidden" name="league" value={league} />
              <label>
                <span>{t('admin.import.fileLabel')}</span>{' '}
                <input type="file" name="file" accept=".csv,text/csv" required />
              </label>{' '}
              <button type="submit">{t('admin.import.upload')}</button>
            </form>
          </section>
        </>
      )}
    </main>
  );
}
