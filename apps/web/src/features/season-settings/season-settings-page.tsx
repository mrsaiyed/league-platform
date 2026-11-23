// Admin → Season settings (P7 §1, P4 §3). Its first panel, "Who can see this season"
// (step 2.182, A-18): the season's state in one line, and "Show this season to visitors"
// or "Hide it again", each asking once on a step of its own before the season command
// runs, so it all works with no script in the page. Around it, step 2.47's parts: the
// season's name and dates, its game rules (with their presets), how games are recorded
// and the statistics kept, the standings, and the rosters. Each part says what it is set
// to in a few lines, with "Change …" for the owner and admins, which opens the part's
// form on a step of its own (`&edit=…`): one form, one filled button. Starting a season
// and choosing the current one are step 2.130's. Drawn inside the admin's own frame with
// its shared pieces, as every admin page is (step 2.103).
//
// The seasons it names are the ones `scheduleAdmin.seasonsOf` lists for this person (the
// hidden ones only to someone who may see them, `mayListSeason`), and the one season is
// read through the season command's own read (getSeason, `season.settings`), in the
// league of the session: a season of another league is never found (T-28).
import { getSeason, isLeagueHidden, readOnlyStatuses, type SeasonView } from '@srleagues/core';
import { displayLabels } from '@srleagues/site';
import { EmptyPanel, OptionPicker, PageHead } from '@srleagues/ui';
import { randomUUID } from 'node:crypto';
import { commandContextOf } from '../../server/context.ts';
import { webPorts } from '../../server/container.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { t, type TextKey } from '../../server/messages.ts';
import type { PublicSchedulePorts } from '../../server/public-schedule.ts';
import { noticeHolderOf, savedNoticesHere } from '../../server/saved-notice.ts';
import { StaffNotice, StaffPill, StaffTrail } from '../staff/index.ts';
import { chooseSeason, firstValue, type SearchParams } from '../stats-pages/index.ts';
import { changeVisibilityAction, savePartAction } from './actions.ts';
import { earnedDone, problemKey } from './answer.ts';
import { mayShowSeason } from './may-show-season.ts';
import { PartForm } from './part-form.tsx';
import { partFacts, partGroups, partTexts } from './part-words.ts';
import { panelWords } from './panel-words.ts';
import {
  isSeasonPart,
  nameFields,
  partAnchor,
  rulesFields,
  seasonParts,
  type SeasonPart,
} from './season-parts.ts';
import {
  divisionsAddress,
  divisionsScreenBuilt,
  partAddress,
  seasonSettingsAddress,
  visibilityAnchor,
} from './season-settings-address.ts';
import { visibilityOf, wishOf, type VisibilityWish } from './season-visibility.ts';

const partKey = (part: SeasonPart, word: string): TextKey =>
  `seasonSettings.part.${part}.${word}` as TextKey;

/** `/{league}/admin/season`: Season settings, with its parts. */
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
  const read = await getSeason(context, { seasonId: season.id }, ports.adminSettings.seasons);
  const mayChange = mayShowSeason(holder, season, addressee.status);
  const edit = firstValue(search['edit']);
  if (read.ok && mayChange && isSeasonPart(edit)) {
    return <PartPage league={addressee} route={league} season={read.value} part={edit} />;
  }
  // "Saved", beside the part saved, once (record 067): taken as the page is drawn.
  const noticeHolder = noticeHolderOf(context);
  const notice =
    noticeHolder === undefined ? undefined : savedNoticesHere().take(noticeHolder, 'season');
  const savedPart =
    notice !== undefined && notice.thing === season.id && isSeasonPart(notice.said)
      ? notice.said
      : undefined;
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
        <>
          <VisibilityPanel
            season={read.value}
            base={seasonSettingsAddress(addressee)}
            address={(more) => seasonSettingsAddress(addressee, season.slug, more)}
            league={addressee.slug}
            leagueHidden={isLeagueHidden(addressee.status)}
            mayChange={mayChange}
            gameUnderWay={gameUnderWay}
            search={search}
          />
          {readOnlyStatuses.includes(addressee.status) ? (
            <p className="staff-quiet">{t('seasonSettings.readOnly')}</p>
          ) : null}
          {read.value.rulesWarnings.length > 0 ? (
            <StaffNotice kind="refused">
              <p>{t('seasonSettings.rulesUpgraded')}</p>
            </StaffNotice>
          ) : null}
          {seasonParts.map((part) => (
            <PartPanel
              key={part}
              part={part}
              season={read.value}
              change={
                mayChange ? partAddress(addressee, season.slug, part, partAnchor(part)) : undefined
              }
              saved={savedPart === part}
            />
          ))}
          {divisionsScreenBuilt ? (
            <p>
              <a className="ui-button" href={divisionsAddress(addressee, season.slug)}>
                {t('seasonSettings.divisions')}
              </a>
            </p>
          ) : null}
        </>
      ) : (
        <StaffNotice kind="refused">
          <p>{t(problemKey({ problem: read.error.code }) ?? 'error.unknown')}</p>
        </StaffNotice>
      )}
    </main>
  );
}

/** One part: what it is set to now, and the way to change it. */
function PartPanel({
  part,
  season,
  change,
  saved,
}: {
  readonly part: SeasonPart;
  readonly season: SeasonView;
  /** Its form's address, for someone who may change it. */
  readonly change: string | undefined;
  /** Whether it was just saved: "Saved" is said here, once. */
  readonly saved: boolean;
}) {
  const titleId = `${partAnchor(part)}-title`;
  const facts = partFacts(part, season);
  return (
    <section
      className="staff-panel admin-season-part"
      id={partAnchor(part)}
      aria-labelledby={titleId}
      data-part={part}
    >
      <div className="staff-panel-head">
        <h2 id={titleId}>{t(partKey(part, 'title'))}</h2>
        {change === undefined ? null : (
          <a className="ui-button" href={change}>
            {t(partKey(part, 'change'))}
          </a>
        )}
      </div>
      <p className="staff-quiet">{t(partKey(part, 'about'))}</p>
      {saved ? (
        <StaffNotice kind="saved" data={{ 'data-notice': 'saved' }}>
          <p>{t(partKey(part, 'saved'))}</p>
        </StaffNotice>
      ) : null}
      {part === 'game' && !season.rulesSaved ? (
        <p className="staff-quiet">{t('seasonSettings.notSavedYet')}</p>
      ) : null}
      <dl className="admin-season-facts">
        {facts.map((fact) => (
          <div key={fact.term}>
            <dt>{fact.term}</dt>
            <dd>
              {fact.value}
              {fact.unused === undefined ? null : (
                <>
                  {' '}
                  <StaffPill kind="wait">{fact.unused}</StaffPill>
                </>
              )}
            </dd>
          </div>
        ))}
      </dl>
      {facts.some((fact) => fact.unused !== undefined) ? (
        <p className="staff-quiet">{t('seasonSettings.notInUse.help')}</p>
      ) : null}
    </section>
  );
}

/** A part's form on a step of its own, under a trail back to the season's settings. */
function PartPage({
  league,
  route,
  season,
  part,
}: {
  readonly league: Parameters<typeof seasonSettingsAddress>[0];
  /** The route's `[league]` value, which the form's post finds the page by. */
  readonly route: string;
  readonly season: SeasonView;
  readonly part: SeasonPart;
}) {
  const back = `${seasonSettingsAddress(league, season.slug)}#${partAnchor(part)}`;
  const title = t(partKey(part, 'title'));
  return (
    <main className="admin-season">
      <StaffTrail steps={[{ href: back, label: t('admin.area.season') }]} here={title} />
      <PageHead title={title} sub={t(partKey(part, 'about'))} />
      <p className="staff-quiet">{t('seasonSettings.seasonName', { name: season.name })}</p>
      <section
        className="staff-panel admin-season-part"
        id={partAnchor(part)}
        aria-label={title}
        data-part={part}
      >
        <PartForm
          action={savePartAction}
          league={route}
          seasonId={season.id}
          part={part}
          version={season.version}
          token={randomUUID()}
          saved={part === 'name' ? nameFields(season) : rulesFields(part, season.rules)}
          groups={partGroups(part, season.rules)}
          back={back}
          permalink={partAddress(league, season.slug, part, partAnchor(part))}
          texts={partTexts(part, season.rules)}
        />
      </section>
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
        {/* A row of its own, so its button lines up with "No" beside it. */}
        <form action={changeVisibilityAction} className="staff-buttons">
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
