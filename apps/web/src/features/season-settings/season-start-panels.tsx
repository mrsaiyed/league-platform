// Step 2.130's two panels in Season settings. "Current and archived": whether the season is
// the current one, with "Make this the current season", and "Archive this season", each
// asking once on a step of its own (`&ask=current`, `&ask=archive`) and saying in plain
// words what changes before the season command runs; an archived season says it is
// read-only and that it cannot be un-archived (S-100), and offers no archive button. A
// hidden season is not offered Archive (T-388): the panel says to show it first; made
// current, it says the admin's screens open on it while visitors go on seeing the newest
// shown season (S-103).
// "Start a new season": a name, a short name, dates and the one choice of what teams come
// along, saying what is copied from the current season and what is not (T-378). Both are
// plain form posts, so they work with no script in the page; a refused start keeps what was
// typed (step 2.245).
import { defaultSeasonRules } from '@srleagues/contracts';
import {
  archivedSeasonStatus,
  hiddenSeasonStatus,
  clockModes,
  seasonCarryChoices,
  type GameRuleAnswers,
  type SeasonView,
} from '@srleagues/core';
import { randomUUID } from 'node:crypto';
import { t, type TextKey } from '../../server/messages.ts';
import { requestTokenField } from '../../server/same-request.ts';
import { ListForm, type ListField } from '../list-forms/index.ts';
import { StaffNotice } from '../staff/index.ts';
import { changeSeasonAction, startSeasonAction } from './actions.ts';
import type { DoneName } from './answer.ts';
import { seasonStateAnchor, startSeasonAnchor } from './season-settings-address.ts';

const carryKey = (carry: string): TextKey => `seasonSettings.start.carry.${carry}` as TextKey;

export function SeasonStatePanel({
  season,
  league,
  base,
  back,
  mayChange,
  asked,
  said,
  problem,
}: {
  readonly season: SeasonView;
  /** The route's `[league]` value, which the form's post finds the page by. */
  readonly league: string;
  /** This page's address with no query: where the "ask" forms go. */
  readonly base: string;
  /** The page for the season without a question. */
  readonly back: string;
  readonly mayChange: boolean;
  readonly asked: string | undefined;
  /** "current" or "archived", only when the season read fresh is so. */
  readonly said: DoneName | undefined;
  readonly problem: TextKey | undefined;
}) {
  const name = season.name;
  const archived = season.status === archivedSeasonStatus;
  const hidden = season.status === hiddenSeasonStatus;
  const wishes = mayChange
    ? [
        ...(season.isCurrent ? [] : ['current' as const]),
        ...(archived || hidden ? [] : ['archive' as const]),
      ]
    : [];
  const wish = wishes.find((w) => w === asked);
  return (
    <section
      className="staff-panel"
      id={seasonStateAnchor}
      aria-labelledby="season-state-title"
      data-season-state={archived ? 'archived' : season.isCurrent ? 'current' : 'other'}
    >
      <h2 id="season-state-title">{t('seasonSettings.state.title')}</h2>
      {problem === undefined ? null : (
        <StaffNotice kind="refused">
          <p>{t(problem)}</p>
        </StaffNotice>
      )}
      {problem === undefined && said !== undefined ? (
        <StaffNotice kind="saved" data={{ 'data-notice': 'done' }}>
          <p>{t(`seasonSettings.done.${said}` as TextKey, { season: name })}</p>
        </StaffNotice>
      ) : null}
      <p>
        {t(
          season.isCurrent
            ? hidden
              ? 'seasonSettings.currentHidden'
              : 'seasonSettings.current'
            : 'seasonSettings.notCurrent',
          { season: name },
        )}
      </p>
      {archived ? (
        <p data-season-archived="">{t('seasonSettings.archived', { season: name })}</p>
      ) : null}
      {hidden && mayChange ? (
        <p className="staff-quiet" data-season-archive-hidden="">
          {t('seasonSettings.archiveHidden', { season: name })}
        </p>
      ) : null}
      {wish === undefined ? (
        wishes.length === 0 ? null : (
          <div className="staff-buttons">
            {wishes.map((w) => (
              <form key={w} method="get" action={`${base}#${seasonStateAnchor}`}>
                <input type="hidden" name="season" value={season.slug} />
                <input type="hidden" name="ask" value={w} />
                <button
                  type="submit"
                  className="ui-button"
                  data-kind={w === 'archive' ? 'danger' : 'main'}
                  data-season-change={w}
                >
                  {t(w === 'archive' ? 'seasonSettings.archive' : 'seasonSettings.makeCurrent')}
                </button>
              </form>
            ))}
          </div>
        )
      ) : (
        <div
          className="ui-notice"
          role="group"
          aria-labelledby="season-state-ask"
          data-season-ask={wish}
        >
          <p id="season-state-ask">
            {t(
              wish === 'archive'
                ? 'seasonSettings.archiveAsk'
                : hidden
                  ? 'seasonSettings.currentAskHidden'
                  : 'seasonSettings.currentAsk',
              { season: name },
            )}
          </p>
          <div className="staff-buttons">
            <form action={changeSeasonAction} className="staff-buttons">
              <input type="hidden" name="league" value={league} />
              <input type="hidden" name="seasonId" value={season.id} />
              <input type="hidden" name="version" value={season.version} />
              <input type="hidden" name="wish" value={wish} />
              <button
                type="submit"
                className="ui-button"
                data-kind={wish === 'archive' ? 'danger' : 'main'}
              >
                {t(wish === 'archive' ? 'seasonSettings.archiveYes' : 'seasonSettings.currentYes')}
              </button>
            </form>
            <a className="ui-button" href={`${back}#${seasonStateAnchor}`}>
              {t(wish === 'archive' ? 'seasonSettings.archiveNo' : 'seasonSettings.currentNo')}
            </a>
          </div>
        </div>
      )}
    </section>
  );
}

export function StartSeasonPanel({
  league,
  programId,
  copiedFrom,
  gameRules,
  stopClockDropped,
  permalink,
}: {
  /** The route's `[league]` value, which the form's post finds the page by. */
  readonly league: string;
  /** The program the new season is started in; undefined for the league's default one. */
  readonly programId: string | undefined;
  /** The current season's name, which the new one copies; undefined when there is none. */
  readonly copiedFrom: string | undefined;
  /** The game rules asked (S-106, step 2.245), filled with the copied season's (or the starting) ones. */
  readonly gameRules: Required<GameRuleAnswers>;
  /**
   * Said under the clock question when the copied season has a last-minutes stop clock,
   * which a stop clock for the whole game clears (T-428, review M1); else undefined.
   */
  readonly stopClockDropped?: string | undefined;
  /** Where the browser lands with scripts off: this form's place on the page. */
  readonly permalink: string;
}) {
  // A refusal is said in the response to the post (step 2.245, as step 2.155's forms):
  // every box keeps what was typed, the wrong one is marked, the sentence beside it.
  const fields: ListField[] = [
    {
      kind: 'text',
      name: 'name',
      label: t('seasonSettings.start.name'),
      value: '',
      required: true,
      maxLength: 120,
      help: t('seasonSettings.start.nameHelp'),
    },
    {
      kind: 'text',
      name: 'slug',
      label: t('seasonSettings.start.slug'),
      value: '',
      required: true,
      maxLength: 60,
      pattern: '[a-z0-9]+(-[a-z0-9]+)*',
      help: t('seasonSettings.start.slugHelp'),
    },
    { kind: 'date', name: 'startsOn', label: t('seasonSettings.start.startsOn'), value: '' },
    { kind: 'date', name: 'endsOn', label: t('seasonSettings.start.endsOn'), value: '' },
    {
      kind: 'note',
      name: 'gameRules',
      content: (
        <div data-game-rules="">
          <h3>{t('seasonSettings.start.gameRules')}</h3>
          <p className="ui-field-help">{t('seasonSettings.start.gameRulesHelp')}</p>
        </div>
      ),
    },
    {
      kind: 'choice',
      name: 'clockMode',
      label: t('seasonSettings.start.clock'),
      value: gameRules.clockMode ?? defaultSeasonRules().clock.mode,
      options: clockModes.map((mode) => ({
        value: mode,
        label: t(
          mode === 'stop'
            ? 'seasonSettings.start.clock.stop'
            : 'seasonSettings.start.clock.running',
        ),
      })),
    },
    ...(stopClockDropped === undefined
      ? []
      : [
          {
            kind: 'note',
            name: 'stopClockDropped',
            content: (
              <p className="ui-field-help" data-stop-clock-dropped="">
                {stopClockDropped}
              </p>
            ),
          } satisfies ListField,
        ]),
    {
      kind: 'number',
      name: 'mercyLead',
      label: t('seasonSettings.start.mercyLead'),
      value: gameRules.mercyLead === null ? '' : String(gameRules.mercyLead),
      help: t('seasonSettings.start.mercyLeadHelp'),
    },
    ...carryFields(copiedFrom),
  ];
  const hidden: Record<string, string> = { league, [requestTokenField]: randomUUID() };
  if (programId !== undefined) hidden['programId'] = programId;
  if (copiedFrom === undefined) hidden['carry'] = 'nothing';
  return (
    <section
      className="staff-panel"
      id={startSeasonAnchor}
      aria-labelledby="start-season-title"
      data-start-season=""
    >
      <h2 id="start-season-title">{t('seasonSettings.start.title')}</h2>
      <p className="staff-quiet" data-start-copies={copiedFrom === undefined ? 'nothing' : 'rules'}>
        {copiedFrom === undefined
          ? t('seasonSettings.start.aboutFresh')
          : t('seasonSettings.start.about', { season: copiedFrom })}
      </p>
      <p className="staff-quiet">{t('seasonSettings.start.hidden')}</p>
      <ListForm
        action={startSeasonAction}
        permalink={permalink}
        hidden={hidden}
        fields={fields}
        button={t('seasonSettings.start.submit')}
        kind="main"
        label={t('seasonSettings.start.title')}
        name="start-season"
      />
    </section>
  );
}

/** What teams come along, asked only when there is a season to copy them from. */
function carryFields(copiedFrom: string | undefined): ListField[] {
  if (copiedFrom === undefined) return [];
  return [
    {
      kind: 'choice',
      name: 'carry',
      label: t('seasonSettings.start.carry'),
      value: 'teams',
      options: seasonCarryChoices.map((carry) => ({ value: carry, label: t(carryKey(carry)) })),
    },
    {
      kind: 'note',
      name: 'carryHelp',
      content: <p className="ui-field-help">{t('seasonSettings.start.carryHelp')}</p>,
    },
  ];
}
