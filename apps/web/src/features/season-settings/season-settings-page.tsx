// Admin → Season settings (P7 §1, P4 §3). Its first panel, "Who can see this season"
// (step 2.182, A-18): the season's state in one line, and "Show this season to visitors"
// or "Hide it again", each asking once on a step of its own before the season command
// runs, so it all works with no script in the page. Step 2.47 builds the season's name,
// dates and rules around this panel; starting a season and choosing the current one are
// step 2.130's. Plain markup and the shared classes only: the admin's look is step 2.103's.
//
// The seasons it names are the ones `scheduleAdmin.seasonsOf` lists for this person (the
// hidden ones only to someone who may see them, `mayListSeason`), and the one season is
// read through the season command's own read (getSeason, `season.settings`), in the
// league of the session: a season of another league is never found (T-28).
import { getSeason, isLeagueHidden, type SeasonView } from '@srleagues/core';
import { displayLabels } from '@srleagues/site';
import { OptionPicker } from '@srleagues/ui';
import { commandContextOf } from '../../server/context.ts';
import { webPorts } from '../../server/container.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { t } from '../../server/messages.ts';
import { chooseSeason, firstValue, type SearchParams } from '../stats-pages/index.ts';
import { changeVisibilityAction } from './actions.ts';
import { doneOf, problemKey } from './answer.ts';
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
  const chosen = chooseSeason(seasons, firstValue(search['season']));
  const season = seasons.find((s) => s.id === chosen?.id);
  const top = (
    <>
      <h1>{t('admin.area.season')}</h1>
      <p>{t('seasonSettings.intro')}</p>
    </>
  );
  if (season === undefined) {
    return (
      <main>
        {top}
        <p>{t('seasonSettings.noSeason')}</p>
      </main>
    );
  }
  const read = await getSeason(context, { seasonId: season.id }, ports.adminSettings.deps);
  const labels = displayLabels(t);
  return (
    <main>
      {top}
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
      <p>{t('seasonSettings.seasonName', { name: season.name })}</p>
      {read.ok ? (
        <VisibilityPanel
          season={read.value}
          base={seasonSettingsAddress(addressee)}
          address={(more) => seasonSettingsAddress(addressee, season.slug, more)}
          league={addressee.slug}
          leagueHidden={isLeagueHidden(addressee.status)}
          mayChange={mayShowSeason(holder, season, addressee.status)}
          search={search}
        />
      ) : (
        <p role="alert">{t(problemKey({ problem: read.error.code }) ?? 'error.unknown')}</p>
      )}
    </main>
  );
}

function VisibilityPanel({
  season,
  base,
  address,
  league,
  leagueHidden,
  mayChange,
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
  readonly search: SearchParams;
}) {
  const name = season.name;
  const visibility = visibilityOf(season.status);
  const words = panelWords({ visibility, leagueShown: !leagueHidden, seasonName: name });
  const wish = mayChange ? wishOf(season.status) : undefined;
  const asked = firstValue(search['ask']);
  const said = doneOf(search);
  const problem = problemKey(search);
  return (
    <section className="ui-panel" id={visibilityAnchor} aria-labelledby="who-can-see-title">
      <h2 id="who-can-see-title">{t('seasonSettings.visibility.title')}</h2>
      {problem === undefined ? null : (
        <p className="ui-notice" role="alert" data-kind="error">
          {t(problem)}
        </p>
      )}
      {problem === undefined && said !== undefined ? (
        <p className="ui-notice" role="status" data-notice="done">
          {said === 'shown' ? words.shown : t('seasonSettings.done.hidden', { season: name })}
        </p>
      ) : null}
      <p data-season-visibility={visibility}>{words.state}</p>
      {words.leagueNote === undefined ? null : <p>{words.leagueNote}</p>}
      {wish === undefined ? null : asked === wish ? (
        <Question
          wish={wish}
          ask={wish === 'show' ? words.showAsk : t('seasonSettings.hideAsk', { season: name })}
          season={season}
          league={league}
          back={address()}
        />
      ) : (
        <form method="get" action={`${base}#${visibilityAnchor}`}>
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
  return (
    <div data-visibility-ask={wish}>
      <p>{ask}</p>
      <form action={changeVisibilityAction}>
        <input type="hidden" name="league" value={league} />
        <input type="hidden" name="seasonId" value={season.id} />
        <input type="hidden" name="version" value={season.version} />
        <input type="hidden" name="wish" value={wish} />
        <button type="submit" className="ui-button" data-kind={show ? 'main' : 'danger'}>
          {t(show ? 'seasonSettings.showYes' : 'seasonSettings.hideYes')}
        </button>
      </form>
      <p>
        <a className="ui-button" href={`${back}#${visibilityAnchor}`}>
          {t(show ? 'seasonSettings.showNo' : 'seasonSettings.hideNo')}
        </a>
      </p>
    </div>
  );
}
