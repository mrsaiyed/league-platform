// Admin → Season settings (P7 §1, P4 §3). Its first panel, "Who can see this season"
// (step 2.182, A-18): the season's state in one line, and "Show this season to visitors"
// or "Hide it again", each asking once on a step of its own before the season command
// runs, so it all works with no script in the page. Step 2.47 builds the season's name,
// dates and rules around this panel; starting a season and choosing the current one are
// step 2.130's. Drawn inside the admin's own frame with its shared pieces, as every admin
// page is (step 2.103): the page's head (its title and one line of what it is for), the
// season picker, then the panel; the question asked on a step of its own inside it.
//
// The seasons it names are the ones `scheduleAdmin.seasonsOf` lists for this person (the
// hidden ones only to someone who may see them, `mayListSeason`), and the one season is
// read through the season command's own read (getSeason, `season.settings`), in the
// league of the session: a season of another league is never found (T-28).
import { getSeason, isLeagueHidden, type SeasonView } from '@srleagues/core';
import { displayLabels } from '@srleagues/site';
import { EmptyPanel, OptionPicker, PageHead } from '@srleagues/ui';
import { commandContextOf } from '../../server/context.ts';
import { webPorts } from '../../server/container.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { t } from '../../server/messages.ts';
import type { PublicSchedulePorts } from '../../server/public-schedule.ts';
import { StaffNotice } from '../staff/index.ts';
import { chooseSeason, firstValue, type SearchParams } from '../stats-pages/index.ts';
import { changeVisibilityAction } from './actions.ts';
import { earnedDone, problemKey } from './answer.ts';
import { mayShowSeason } from './may-show-season.ts';
import { panelWords } from './panel-words.ts';
import { seasonSettingsAddress, visibilityAnchor } from './season-settings-address.ts';
import { visibilityOf, wishOf, type VisibilityWish } from './season-visibility.ts';

/** `/{league}/admin/season`: Season settings, with its first panel. */
export async function SeasonSettingsPage({
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
  // A `?season=` naming no season listed here falls back to the current or first one, and
  // says so: the league has seasons, so "no season yet" would be untrue.
  const asked = firstValue(search['season']);
  const named = chooseSeason(seasons, asked);
  const notFound = named === undefined && asked !== undefined && asked !== '';
  const chosen = named ?? chooseSeason(seasons, undefined);
  const season = seasons.find((s) => s.id === chosen?.id);
  const top = <PageHead title={t('admin.area.season')} sub={t('seasonSettings.intro')} />;
  if (season === undefined) {
    return (
      <main className="admin-season">
        {top}
        <EmptyPanel text={t('seasonSettings.noSeason')} />
      </main>
    );
  }
  const read = await getSeason(context, { seasonId: season.id }, ports.adminSettings.deps);
  // Only while "Hide it again" is being asked: whether a game of the season is being scored
  // now, read from the season's public schedule (what visitors following it would lose).
  const gameUnderWay =
    read.ok && read.value.status === 'active' && firstValue(search['ask']) === 'hide'
      ? await liveGameIn(ports.publicSchedule, addressee.id, season.id)
      : false;
  const labels = displayLabels(t);
  return (
    <main className="admin-season">
      {top}
      {/* The season picker and the season's name, in one compact row under the head. */}
      <div className="admin-season-pick">
        {seasons.length < 2 ? null : (
          <OptionPicker
            name="season"
            label={labels.season}
            submitLabel={labels.show}
            action={seasonSettingsAddress(addressee)}
            value={season.slug}
            options={seasons.map((s) => ({ value: s.slug, label: s.name }))}
          />
        )}
        <p className="staff-quiet">{t('seasonSettings.seasonName', { name: season.name })}</p>
      </div>
      {notFound ? (
        <StaffNotice kind="refused">
          <p>{t('seasonSettings.seasonNotFound', { name: season.name })}</p>
        </StaffNotice>
      ) : null}
      {read.ok ? (
        <VisibilityPanel
          season={read.value}
          base={seasonSettingsAddress(addressee)}
          address={(more) => seasonSettingsAddress(addressee, season.slug, more)}
          league={addressee.slug}
          leagueHidden={isLeagueHidden(addressee.status)}
          mayChange={mayShowSeason(holder, season, addressee.status)}
          gameUnderWay={gameUnderWay}
          search={search}
        />
      ) : (
        <StaffNotice kind="refused">
          <p>{t(problemKey({ problem: read.error.code }) ?? 'error.unknown')}</p>
        </StaffNotice>
      )}
    </main>
  );
}

/** Whether a published game of a season visitors can see is being scored now. */
async function liveGameIn(
  schedules: PublicSchedulePorts,
  leagueId: string,
  seasonId: string,
): Promise<boolean> {
  const { today } = await schedules.clockOf(leagueId);
  const schedule = await schedules.scheduleOf(leagueId, seasonId, today);
  if (schedule === undefined) return false;
  return [...schedule.rounds.flatMap((r) => r.games), ...schedule.unplacedGames].some(
    (g) => g.status === 'live',
  );
}

function VisibilityPanel({
  season,
  base,
  address,
  league,
  leagueHidden,
  mayChange,
  gameUnderWay,
  search,
}: {
  readonly season: SeasonView;
  /** This page's address with no query: where the "ask" form goes. */
  readonly base: string;
  /** This page's address for the season, with more in its query. */
  readonly address: (more?: Readonly<Record<string, string>>) => string;
  readonly league: string;
  readonly leagueHidden: boolean;
  /** Whether this person gets the buttons (the command checks again). */
  readonly mayChange: boolean;
  /** Whether a game of the season is being scored now (read only while hiding is asked). */
  readonly gameUnderWay: boolean;
  readonly search: SearchParams;
}) {
  const name = season.name;
  const visibility = visibilityOf(season.status);
  const words = panelWords({
    visibility,
    leagueShown: !leagueHidden,
    seasonName: name,
    isCurrent: season.isCurrent,
    gameUnderWay,
  });
  const wish = mayChange ? wishOf(season.status) : undefined;
  const asked = firstValue(search['ask']);
  const said = earnedDone(search, visibility);
  const problem = problemKey(search);
  return (
    <section className="staff-panel" id={visibilityAnchor} aria-labelledby="who-can-see-title">
      <h2 id="who-can-see-title">{t('seasonSettings.visibility.title')}</h2>
      {problem === undefined ? null : (
        <StaffNotice kind="refused">
          <p>{t(problem)}</p>
        </StaffNotice>
      )}
      {problem === undefined && said !== undefined ? (
        <StaffNotice kind="saved" data={{ 'data-notice': 'done' }}>
          <p>
            {said === 'shown' ? words.shown : t('seasonSettings.done.hidden', { season: name })}
          </p>
        </StaffNotice>
      ) : null}
      <p data-season-visibility={visibility}>{words.state}</p>
      {words.leagueNote === undefined ? null : <p className="staff-quiet">{words.leagueNote}</p>}
      {wish === undefined ? null : asked === wish ? (
        <Question
          wish={wish}
          ask={wish === 'show' ? words.showAsk : words.hideAsk}
          season={season}
          league={league}
          back={address()}
        />
      ) : (
        <form method="get" action={`${base}#${visibilityAnchor}`} className="staff-buttons">
          <input type="hidden" name="season" value={season.slug} />
          <input type="hidden" name="ask" value={wish} />
          <button
            type="submit"
            className="ui-button"
            data-kind={wish === 'show' ? 'main' : 'danger'}
          >
            {t(wish === 'show' ? 'seasonSettings.show' : 'seasonSettings.hide')}
          </button>
        </form>
      )}
    </section>
  );
}

/** The one question before the season is shown or hidden: yes runs it, no goes back. */
function Question({
  wish,
  ask,
  season,
  league,
  back,
}: {
  readonly wish: VisibilityWish;
  /** The question's words (panel-words.ts). */
  readonly ask: string;
  readonly season: SeasonView;
  readonly league: string;
  /** The page without the question. */
  readonly back: string;
}) {
  const show = wish === 'show';
  // The question as a notice of its own in the panel, its answers in one row under it: yes
  // first (filled to show, the danger kind to hide), then no, outlined, back to the panel.
  return (
    <div
      className="ui-notice"
      role="group"
      aria-labelledby="who-can-see-ask"
      data-visibility-ask={wish}
    >
      <p id="who-can-see-ask">{ask}</p>
      <div className="staff-buttons">
        <form action={changeVisibilityAction}>
          <input type="hidden" name="league" value={league} />
          <input type="hidden" name="seasonId" value={season.id} />
          <input type="hidden" name="version" value={season.version} />
          <input type="hidden" name="wish" value={wish} />
          <button type="submit" className="ui-button" data-kind={show ? 'main' : 'danger'}>
            {t(show ? 'seasonSettings.showYes' : 'seasonSettings.hideYes')}
          </button>
        </form>
        <a className="ui-button" href={`${back}#${visibilityAnchor}`}>
          {t(show ? 'seasonSettings.showNo' : 'seasonSettings.hideNo')}
        </a>
      </div>
    </div>
  );
}
