import {
  gameAnchor,
  getScheduleDraft,
  isLeagueHidden,
  leagueUrl,
  listVenues,
  previewSchedulePublish,
  type ScheduleGame,
  type ScheduleRound,
  type VenueWithCourts,
} from '@srleagues/core';
import { Emblem, EmptyPanel, PageHead } from '@srleagues/ui';
import { randomUUID } from 'node:crypto';
import { Fragment, type ReactNode } from 'react';
import { webPorts } from '../../server/container.ts';
import { commandContextOf } from '../../server/context.ts';
import { binLinkFor } from '../bin-area/index.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { t } from '../../server/messages.ts';
import { requestTokenField } from '../../server/same-request.ts';
import { noticeHolderOf, savedNoticesHere } from '../../server/saved-notice.ts';
import {
  mayShowSeason,
  seasonSettingsAddress,
  visibilityAnchor,
} from '../season-settings/index.ts';
import { IntoView, MarkedFocus } from '../list-forms/index.ts';
import { ArchivedSeasonNotice, StaffPill } from '../staff/index.ts';
import { chooseSeason, firstValue, type SearchParams } from '../stats-pages/index.ts';
import { venuesAddress } from '../venues-area/index.ts';
import {
  addGameAction,
  addRoundAction,
  changeRoundDateAction,
  discardAction,
  publishAction,
  putBackGameAction,
  removeGameAction,
  removeRoundAction,
  renameRoundAction,
  saveGameAction,
  swapGamesAction,
} from './actions.ts';
import { backToTeamOf, backToTeamParam, removeTeamPanelAnchor } from './back-to-team.ts';
import { PlaceSelect } from './place-select.tsx';
import { waitingListAnchor } from './waiting-anchor.ts';
import {
  clockText,
  dayText,
  daysAfter,
  gamesInOrder,
  pageGrid,
  type Grid,
  type GridGame,
  type GridRound,
  type GridTeam,
  type RemovedGridGame,
} from './build-grid.ts';
import {
  addGameAnchor,
  addRoundAnchor,
  answerShown,
  swapAnchor,
  refusedAtOf,
  roundAnchor,
  savedAnchor,
  savedDetailOf,
  savedDetailOfNotice,
} from './grid-answer.ts';
import type { GameTyped, RefusedAt, SavedDetail } from './run-schedule-action.ts';
import { importLinkOf } from './import-link.ts';
import {
  addRoundProblemOf,
  gameProblemOf,
  noticeOf,
  whyNotSaved,
  type GameField,
} from './notice.ts';
import { publishedNotice } from './published-notice.ts';
import { SaidInView } from './said-in-view.tsx';
import { publishLines, publishWarnings, type PublishLine } from './publish-summary.ts';
import { RoundFacts, RoundRemoval, roundIsEmpty } from './round-parts.tsx';
import { ScheduleHeading } from './schedule-heading.tsx';
import { seasonControls } from './season-controls.ts';

type Basis = {
  readonly league: string;
  readonly seasonSlug: string;
  readonly seasonId: string;
  readonly basedOnRevision: number | null;
  readonly version: number | null;
  readonly draftId: string | null;
  /** The team "Remove this team" came from, carried by every form (step 2.180). */
  readonly fromTeam: string | null;
  /** What the viewer may do; the commands check again, this only hides what cannot work. */
  readonly canEdit: boolean;
  readonly canPublish: boolean;
  /**
   * Where a game that is not scheduled goes on from (step 2.158): a postponed one waits in
   * Admin → Games for its new date ("Waiting for a new date"); a cancelled one is put back
   * from its own page there.
   */
  readonly waitingHref: string;
  readonly gameHref: (gameId: string) => string;
  /** A game form's refusal, said beside it with every box as typed (step 2.155). */
  readonly refused: GameRefusal | undefined;
  /** A refused "Swap with", said beside its game. */
  readonly swapRefused: SwapRefusal | undefined;
};

/** A refused game form: which, what was typed, the box it is about and the sentence. */
type GameRefusal = {
  readonly at: Extract<RefusedAt, { readonly form: 'game' | 'add-game' }>;
  readonly field: GameField | 'form';
  readonly text: string;
  /** Someone else changed the draft meanwhile: what is saved now is said beside the boxes. */
  readonly changed?: true;
};

/** A refused "Swap with": the game it was asked on, the one chosen, and why. */
type SwapRefusal = { readonly gameId: string; readonly otherGameId: string; readonly text: string };

const recordings = ['final-score', 'box-score', 'live'] as const;

/** `/{league}/admin/schedule`: the hand-editing grid of rounds and games (P7 §4.3). */
export async function ScheduleBuilderPage({
  league,
  search: inAddress,
}: {
  /** The route's `[league]` value. */
  readonly league: string;
  readonly search: SearchParams;
}) {
  const view = await loadLeaguePage(league, 'admin', 'schedule');
  const addressee = view.context.league;
  const ports = await webPorts();
  const context = commandContextOf(view.context);
  // Every answer is said once, from the notice its form left (steps 2.185 and 2.155 part 6):
  // taking it clears it, so a reload, or Back to the page, says nothing old, and no answer
  // is ever read from the address. A removal or a put back is read from its own notice; any
  // other answer's words, a refusal's typed boxes too, are in the notice (answerShown).
  const noticeHolder = noticeHolderOf(context);
  const taken =
    noticeHolder === undefined ? undefined : savedNoticesHere().take(noticeHolder, 'schedule');
  const action = leagueUrl(addressee, 'admin-area', { area: 'schedule' });
  const search = answerShown(inAddress, taken, action);
  const holder = await ports.accessOf(context);
  // Every season the holder may be told of, the ones not public yet among them (a season is
  // scheduled before it is shown): the port lists only those (P4 §4).
  const seasons = await ports.scheduleAdmin.seasonsOf(addressee.id, holder);
  const asked = firstValue(search['season']);
  const chosen = chooseSeason(seasons, asked);
  const season = seasons.find((s) => s.id === chosen?.id);
  const notice = noticeOf(search);
  if (season === undefined) {
    return (
      <main className="admin-schedule">
        <PageHead title={t('schedule.admin.title')} />
        <EmptyPanel text={t('schedule.admin.noSeason')} />
      </main>
    );
  }
  const deps = ports.scheduleAdmin.deps;
  const [drafted, listed, seasonTeams] = await Promise.all([
    getScheduleDraft(context, { seasonId: season.id }, deps),
    listVenues(context, {}, deps),
    ports.scheduleAdmin.teamsOf(addressee.id, season.id),
  ]);
  // What the page lets you do, at the top right of its head: bring games in from a
  // spreadsheet. "Review and publish" sits beside "Draft in progress", in the bar that stays
  // in view, and the box is at the top of the grid (step 2.53).
  const binLink = await binLinkFor(addressee, context, 'games');
  const waitingHref = `${leagueUrl(addressee, 'admin-area', { area: 'games' })}#${waitingListAnchor}`;
  const headActions = () => (
    <div className="staff-actions">
      <a className="ui-button" href={importLinkOf(addressee)}>
        {t('schedule.admin.importLink')}
      </a>
      <a className="ui-button" href={venuesAddress(addressee)}>
        {t('schedule.admin.venuesLink')}
      </a>
      {/* The postponed games, to give each a new date (step 2.53, S-49). */}
      <a className="ui-button" href={waitingHref} data-to-waiting="">
        {t('schedule.admin.toWaitingHead')}
      </a>
      {binLink === undefined ? null : (
        <a className="ui-button" href={binLink}>
          {t('admin.bin.link.games')}
        </a>
      )}
    </div>
  );
  const heading = (top: ReactNode, firstRound: ReactNode = null) => (
    <ScheduleHeading seasons={seasons} season={season} action={action} actions={headActions()}>
      {/* An archived season (O-12): read-only, so seasonControls offers no change. */}
      {season.archived ? <ArchivedSeasonNotice season={season.name} /> : null}
      {firstRound}
      {top}
    </ScheduleHeading>
  );
  // "Published" says what is true for this season and this league (step 2.182, A-18).
  const published =
    firstValue(search['done']) === 'published'
      ? publishedNotice({
          seasonShown: season.isPublic,
          leagueShown: !isLeagueHidden(addressee.status),
          seasonName: season.name,
          mayShow: mayShowSeason(holder, season, addressee.status),
        })
      : undefined;
  const removedCount = Number(firstValue(search['removed']) ?? '0');
  const publishedToBin =
    Number.isInteger(removedCount) && removedCount > 0 && removedCount < 10000 ? removedCount : 0;
  const plainNotice =
    published !== undefined ? (
      <div
        className="ui-notice"
        role="status"
        data-kind="saved"
        data-notice="done"
        data-published=""
      >
        {firstValue(search['already']) === '1' ? (
          <p data-published-already="">{t('schedule.admin.publishedAlready')}</p>
        ) : null}
        <p>{published.text}</p>
        {publishedToBin === 0 ? null : (
          <p data-published-to-bin={publishedToBin}>
            {t.plural('schedule.admin.publishedToBin', publishedToBin)}
            {binLink === undefined ? null : (
              <>
                {' '}
                <a href={binLink}>{t('schedule.admin.publishedToBinLink')}</a>
              </>
            )}
          </p>
        )}
        {published.next === undefined ? null : published.next.kind === 'link' ? (
          <p>
            <a href={`${seasonSettingsAddress(addressee, season.slug)}#${visibilityAnchor}`}>
              {published.next.text}
            </a>
          </p>
        ) : (
          <p>{published.next.text}</p>
        )}
      </div>
    ) : notice === undefined ? null : (
      <IntoView
        words={notice.text}
        marks={{
          className: 'ui-notice',
          role: 'status',
          'data-notice': notice.kind,
          'data-kind': notice.kind === 'problem' ? 'error' : 'saved',
        }}
      >
        {notice.text}
      </IntoView>
    );
  if (!drafted.ok) {
    const key = noticeOf({ problem: drafted.error.code });
    return (
      <main className="admin-schedule">
        {heading(plainNotice)}
        <p className="ui-notice" data-kind="error" role="alert">
          {key?.text ?? t('schedule.admin.error.not-allowed')}
        </p>
      </main>
    );
  }
  const draft = drafted.value;
  const venues = listed.ok ? listed.value : [];
  // A team in the bin is named in its games ("Badgers (removed)"), never offered for one.
  const { grid, teams } = pageGrid(draft, seasonTeams, venues);
  // The team "Remove this team" sent the person here from, to go back to (step 2.180).
  const fromTeam = backToTeamOf(firstValue(search[backToTeamParam]), seasonTeams);
  const saved = savedDetailOfNotice(taken) ?? savedDetailOf(search);
  const refusedAt = refusedAtOf(search);
  // A refusal of a round's form is said beside that form, if it is on the page.
  const besideRound =
    refusedAt?.form === 'round' && grid.rounds.some((r) => r.id === refusedAt.roundId)
      ? refusedAt.roundId
      : undefined;
  const besideAdd = refusedAt?.form === 'add-round' ? refusedAt : undefined;
  const roundProblem = besideRound === undefined ? undefined : whyNotSaved(search);
  const addProblem = besideAdd === undefined ? undefined : addRoundProblemOf(search, besideAdd);
  // A refusal of a game's form is said beside that form, if it is on the page (step 2.155).
  const gameAt =
    refusedAt?.form === 'game'
      ? grid.allGames.some((g) => g.id === refusedAt.gameId && g.editable)
        ? refusedAt
        : undefined
      : refusedAt?.form === 'add-game' &&
          (refusedAt.typed.roundId === '' ||
            grid.rounds.some((r) => r.id === refusedAt.typed.roundId))
        ? refusedAt
        : undefined;
  const gameProblem =
    gameAt === undefined
      ? undefined
      : gameProblemOf(search, gameAt.typed, gameAt.form === 'add-game');
  const gameRefusal: GameRefusal | undefined =
    gameAt === undefined || gameProblem === undefined ? undefined : { at: gameAt, ...gameProblem };
  // A refused "Swap with" is said beside the game it was asked on, if it is on the page.
  const swapAt =
    refusedAt?.form === 'swap' && grid.allGames.some((g) => g.id === refusedAt.gameId && g.editable)
      ? refusedAt
      : undefined;
  const swapWhy = swapAt === undefined ? undefined : whyNotSaved(search);
  const swapRefusal: SwapRefusal | undefined =
    swapAt === undefined || swapWhy === undefined
      ? undefined
      : { gameId: swapAt.gameId, otherGameId: swapAt.otherGameId, text: swapWhy };
  const basis: Basis = {
    ...seasonControls(holder, season),
    league,
    seasonSlug: season.slug,
    seasonId: season.id,
    basedOnRevision: draft.latestRevision,
    version: draft.draft?.version ?? null,
    draftId: draft.draft?.id ?? null,
    fromTeam: fromTeam?.id ?? null,
    waitingHref,
    refused: gameRefusal,
    swapRefused: swapRefusal,
    gameHref: (gameId) => leagueUrl(addressee, 'admin-area', { area: 'games', subpath: [gameId] }),
  };
  const preview =
    draft.draft === null
      ? undefined
      : await previewSchedulePublish(context, { seasonId: season.id }, deps);
  // What publishing would change, counted once by core (publishChangeCount) from the reading
  // the publish box shows, where the viewer may see it; else the draft's own, counted alike.
  // The draft's line and the box both say this one number (step 2.185).
  const toPublish = preview !== undefined && preview.ok ? preview.value.toPublish : draft.toPublish;
  // Publishing is blocked by more than "nothing to publish" (step 2.185).
  const blocked =
    toPublish > 0 &&
    preview !== undefined &&
    preview.ok &&
    preview.value.blockers.some((b) => b.code !== 'nothing-to-publish');
  /** A game's name, live or struck, for a blocker that is about it. */
  const gameName = (gameId: string): string | undefined => {
    const g = [
      ...grid.allGames,
      ...grid.rounds.flatMap((r) => r.removed),
      ...grid.looseRemoved,
    ].find((x) => x.id === gameId);
    return g === undefined
      ? undefined
      : t('schedule.admin.gameVs', { away: g.awayName, home: g.homeName });
  };
  const saidBeside =
    basis.canEdit &&
    (besideRound !== undefined ||
      besideAdd !== undefined ||
      gameRefusal !== undefined ||
      swapRefusal !== undefined);
  const roundName = (r: GridRound) =>
    t('schedule.admin.round', { number: r.number, label: r.label });
  // "Saved", said beside what was saved (A-4); at the top only when that is not on the page.
  const here = savedHere(saved, grid, roundName, basis, action, {
    teams,
    removed: draft.removed,
    removedRounds: draft.result.removedRounds ?? [],
  });
  const top = saidBeside || here !== undefined ? null : plainNotice;
  const noRounds = grid.rounds.length === 0;
  // A season with no rounds: a calm panel under the intro, the first round's form open in it.
  const firstRound = noRounds ? (
    <section className="staff-panel" aria-labelledby="no-rounds" data-no-rounds="">
      <h2 id="no-rounds">{t('schedule.admin.noRounds')}</h2>
      {basis.canEdit ? (
        <>
          <p>{t('schedule.admin.noRoundsHelp')}</p>
          <AddRoundForm basis={basis} rounds={grid.rounds} typed={besideAdd} problem={addProblem} />
        </>
      ) : null}
    </section>
  ) : null;
  const savedAt = (place: SavedPlace) =>
    here !== undefined && samePlace(here.place, place) ? here.node : null;
  const savedGame = (gameId: string): SavedGame =>
    here !== undefined && samePlace(here.place, { game: gameId })
      ? { node: here.node, asks: here.asks === true }
      : undefined;

  // Nothing to review while the draft changes nothing (step 2.185): its line says so.
  const reviewHref =
    draft.draft !== null && toPublish > 0 && !blocked && (basis.canEdit || basis.canPublish)
      ? '#publish-heading'
      : null;
  const changes = preview !== undefined && preview.ok ? preview.value.games : [];
  // A move of court, venue or round only is named so (step 2.53 fix round).
  const lines = publishLines(changes, teams, {
    placeOf: (venueId, court) => {
      const venue = venues.find((v) => v.id === venueId);
      if (venue === undefined) return null;
      return court === null
        ? venue.name
        : t('schedule.admin.gameWhere', { venue: venue.name, court });
    },
    roundOf: (roundId) => {
      const round = draft.result.rounds.find((r) => r.id === roundId);
      return round === undefined
        ? null
        : t('schedule.admin.round', { number: round.number, label: round.label });
    },
  });
  const warnings =
    preview !== undefined && preview.ok
      ? publishWarnings(preview.value.clashes, grid.allGames, teams)
      : [];

  return (
    <main className="admin-schedule">
      {heading(top, firstRound)}
      {fromTeam === undefined ? null : (
        // Back to the team "Remove this team" sent the person here from (step 2.180).
        <p className="staff-buttons" data-back-to-team={fromTeam.id}>
          <a
            className="ui-button"
            data-kind="quiet"
            href={`${leagueUrl(addressee, 'admin-area', { area: 'teams', subpath: [fromTeam.id] })}#${removeTeamPanelAnchor}`}
          >
            {t('schedule.admin.backToTeam', { name: fromTeam.name })}
          </a>
        </p>
      )}
      {/* How the draft stands, in one line: a pill, then the sentence. */}
      {draft.draft !== null ? (
        // What publishing would change, counted as the publish box counts it (step 2.161):
        // a game removed and put back as it was is no change.
        // It stays in view down the grid, so the count is where the person is (step 2.53).
        <div className="admin-schedule-draft" data-draft-bar="" data-draft-count={toPublish}>
          <StaffPill kind="wait">{t('schedule.admin.draftPill')}</StaffPill>
          <span>
            {toPublish === 0
              ? t('schedule.admin.draftChangesNone')
              : t.plural('schedule.admin.draftChanges', toPublish)}
          </span>
          {/* Blocked: said here, never offered as if all were well (step 2.185). */}
          {blocked ? (
            <span data-draft-blocked="">
              {t('schedule.admin.draftBlocked')}{' '}
              <a href="#publish-heading">{t('schedule.admin.draftBlockedWhy')}</a>
            </span>
          ) : null}
          {reviewHref === null ? null : (
            <a className="ui-button" data-kind="main" data-review-publish="" href={reviewHref}>
              {t('schedule.admin.reviewPublish')}
            </a>
          )}
          {/* A draft that changes nothing loses nothing when thrown away: one tap, here. */}
          {toPublish === 0 && basis.canEdit ? <DiscardSame basis={basis} /> : null}
        </div>
      ) : (
        <p className="admin-schedule-draft">
          <StaffPill kind={season.isPublic ? 'good' : 'plain'}>
            {t(season.isPublic ? 'schedule.admin.publishedPill' : 'schedule.admin.hiddenPill')}
          </StaffPill>
          <span>
            {t(season.isPublic ? 'schedule.admin.noDraft' : 'schedule.admin.noDraftHidden')}
          </span>
        </p>
      )}
      {draft.draft?.outOfDate === true ? (
        <p className="ui-notice" data-kind="error" role="alert">
          {t('schedule.admin.draftOutOfDate')}
        </p>
      ) : null}
      {draft.rejected.length === 0 ? null : (
        <p className="ui-notice" data-kind="error" role="alert">
          {t.plural('schedule.admin.rejected', draft.rejected.length)}
        </p>
      )}
      {noRounds && grid.clashes.length === 0 ? null : grid.clashes.length === 0 ? (
        // No clash: one quiet line, not a panel of its own.
        <section className="admin-clashes" aria-labelledby="clashes-heading" data-clear="">
          <h2 id="clashes-heading" className="ui-visually-hidden">
            {t('schedule.admin.clashes')}
          </h2>
          <p className="staff-quiet">{t('schedule.admin.clashesNone')}</p>
        </section>
      ) : (
        <section
          className="ui-notice admin-clashes"
          data-kind="error"
          aria-labelledby="clashes-heading"
        >
          <h2 id="clashes-heading">{t('schedule.admin.clashes')}</h2>
          <ul data-clashes="">
            {grid.clashes.map((c) => (
              <li key={c.key}>{c.text}</li>
            ))}
          </ul>
        </section>
      )}
      {draft.draft === null || !(basis.canEdit || basis.canPublish) ? null : (
        <section aria-labelledby="publish-heading" className="staff-panel admin-publish">
          <h2 id="publish-heading">{t('schedule.admin.publish')}</h2>
          {!basis.canPublish || preview === undefined || !preview.ok ? null : (
            <PublishPanel
              preview={preview.value}
              basis={basis}
              count={toPublish}
              gameName={gameName}
              lines={lines}
              warnings={warnings}
            />
          )}
          {/* Throwing the draft away is apart from publishing it, and looks like neither.
              A draft that changes nothing: the box is one calm sentence, and the one tap
              that throws it away is in the bar above (step 2.53). */}
          {!basis.canEdit || toPublish === 0 ? null : (
            <details className="admin-discard">
              <summary>{t('schedule.admin.discard')}</summary>
              <form action={discardAction} className="staff-form">
                <p className="ui-field-help">{t('schedule.admin.discardNote')}</p>
                <BasisFields basis={basis} />
                <p className="staff-buttons">
                  <button type="submit" className="ui-button" data-kind="danger">
                    {t('schedule.admin.discardSubmit')}
                  </button>
                </p>
              </form>
            </details>
          )}
        </section>
      )}
      {savedAt({ afterRound: null })}
      {grid.rounds.map((round) => (
        <Fragment key={round.id}>
          <RoundSection
            round={round}
            grid={grid}
            teams={teams}
            venues={venues}
            basis={basis}
            rounds={grid.rounds}
            problem={besideRound === round.id ? roundProblem : undefined}
            typed={besideRound === round.id && refusedAt?.form === 'round' ? refusedAt : undefined}
            saved={savedAt({ round: round.id })}
            savedGame={savedGame}
            previousRoundId={grid.rounds[grid.rounds.indexOf(round) - 1]?.id ?? null}
          />
          {savedAt({ afterRound: round.id })}
        </Fragment>
      ))}
      {basis.canEdit && !noRounds ? (
        <AddRound basis={basis} rounds={grid.rounds} typed={besideAdd} problem={addProblem} />
      ) : null}
      <LooseGames
        grid={grid}
        teams={teams}
        venues={venues}
        basis={basis}
        saved={savedAt({ round: null })}
        savedGame={savedGame}
      />
    </main>
  );
}

function BasisFields({ basis }: { readonly basis: Basis }) {
  return (
    <>
      <input type="hidden" name="league" value={basis.league} />
      <input type="hidden" name="season" value={basis.seasonSlug} />
      <input type="hidden" name="seasonId" value={basis.seasonId} />
      <input type="hidden" name="basedOnRevision" value={basis.basedOnRevision ?? ''} />
      <input type="hidden" name="version" value={basis.version ?? ''} />
      <input type="hidden" name="draftId" value={basis.draftId ?? ''} />
      {/* A one-time token: a second post of this form (a double tap) saves once (step 2.155). */}
      <input type="hidden" name={requestTokenField} value={randomUUID()} />
      {basis.fromTeam === null ? null : (
        <input type="hidden" name={backToTeamParam} value={basis.fromTeam} />
      )}
    </>
  );
}

/**
 * A field of the grid's forms: its label above it (the staff area's field piece) and, after
 * a refusal about it, the sentence beside it that names it (step 2.155).
 */
function Field({
  label,
  children,
  wrong,
  now,
}: {
  readonly label: string;
  readonly children: ReactNode;
  readonly wrong?: string | undefined;
  /** What is saved now, after someone else changed it meanwhile (T-399). */
  readonly now?: ReactNode;
}) {
  return (
    <>
      <label className="staff-field">
        <span>{label}</span>
        {children}
      </label>
      {now}
      {wrong === undefined ? null : (
        <IntoView
          words={wrong}
          marks={{ className: 'ui-field-error', role: 'alert', 'data-notice': 'problem' }}
        >
          {wrong}
        </IntoView>
      )}
    </>
  );
}

/** How a game form's boxes are drawn: as typed after a refusal, the wrong one marked. */
type GameBoxes = {
  /** The box's value: as typed, after a refusal of this form; else `fallback`. */
  readonly value: (name: keyof GameTyped, fallback: string) => string;
  /** The props that mark the box a refusal is about (and put the focus there). */
  readonly mark: (name: GameField) => {
    readonly 'aria-invalid'?: true;
    readonly autoFocus?: true;
  };
  /** The sentence beside the box a refusal is about. */
  readonly wrong: (name: GameField) => string | undefined;
  /** The sentence at the top of the form when the refusal is about no one box. */
  readonly top: ReactNode;
  /**
   * After a refusal because someone else changed the draft (T-399): "Saved now: …" beside
   * the box, when what is saved differs from what was typed; else nothing.
   */
  readonly now: (name: keyof GameTyped, saved: string, shown: () => string) => ReactNode;
};

function gameBoxes(refused: GameRefusal | undefined): GameBoxes {
  return {
    value: (name, fallback) => (refused === undefined ? fallback : refused.at.typed[name]),
    mark: (name) => (refused?.field === name ? { 'aria-invalid': true, autoFocus: true } : {}),
    wrong: (name) => (refused?.field === name ? refused.text : undefined),
    top:
      refused?.field !== 'form' ? null : (
        <IntoView
          words={refused.text}
          marks={{
            className: 'ui-notice',
            'data-kind': 'error',
            role: 'alert',
            'data-notice': 'problem',
          }}
        >
          {refused.text}
        </IntoView>
      ),
    now: (name, saved, shown) =>
      refused?.changed !== true || refused.at.typed[name] === saved ? null : (
        <small className="ui-field-help" data-saved-now={name}>
          {t('schedule.admin.savedNow')} {shown()}
        </small>
      ),
  };
}

/** A place as its box shows it: the venue, and the court if there is one. */
function placeShown(venues: readonly VenueWithCourts[], value: string): string {
  const [venueId, court = ''] = value.split('|');
  const venue = venues.find((v) => v.id === venueId);
  if (venue === undefined) return t('schedule.admin.noPlaceOption');
  return court === ''
    ? t('schedule.admin.venueOnly', { venue: venue.name })
    : t('schedule.admin.venueCourt', { venue: venue.name, court });
}

function RecordingSelect({
  value,
  typed,
  marked,
}: {
  readonly value: GridGame['recording'];
  readonly typed?: string;
  readonly marked?: { readonly 'aria-invalid'?: true; readonly autoFocus?: true };
}) {
  return (
    <select name="recording" defaultValue={typed ?? value ?? ''} {...marked}>
      {value === null || value === undefined ? (
        <option value="">{t('schedule.admin.recording.rules')}</option>
      ) : null}
      {recordings.map((r) => (
        <option key={r} value={r}>
          {t(`schedule.admin.recording.${r}`)}
        </option>
      ))}
    </select>
  );
}

function TeamSelect({
  name,
  label,
  teams,
  value,
  boxes,
}: {
  readonly name: 'homeTeamId' | 'awayTeamId';
  readonly label: string;
  readonly teams: readonly GridTeam[];
  readonly value: string;
  readonly boxes: GameBoxes;
}) {
  return (
    <Field label={label} wrong={boxes.wrong(name)}>
      <select name={name} defaultValue={boxes.value(name, value)} required {...boxes.mark(name)}>
        <option value="">{t('schedule.admin.chooseTeam')}</option>
        {teams.map((team) => (
          <option key={team.id} value={team.id}>
            {team.name}
          </option>
        ))}
      </select>
    </Field>
  );
}

function RoundSection({
  round,
  grid,
  teams,
  venues,
  basis,
  rounds,
  problem,
  typed,
  saved,
  savedGame,
  previousRoundId,
}: {
  readonly round: GridRound;
  readonly grid: Grid;
  readonly teams: readonly GridTeam[];
  readonly venues: readonly VenueWithCourts[];
  readonly basis: Basis;
  readonly rounds: readonly GridRound[];
  /** Why the last change to this round was refused, said beside its forms. */
  readonly problem: string | undefined;
  /** A refused new name or day, as typed: kept in its box, the sentence beside it (2.155). */
  readonly typed: { readonly label?: string; readonly date?: string } | undefined;
  /** "Saved", when the last save was this round's. */
  readonly saved: ReactNode;
  readonly savedGame: (gameId: string) => SavedGame;
  /** Where "the round was removed" is said if this one is: after the round before it. */
  readonly previousRoundId: string | null;
}) {
  const headingId = roundAnchor(round.id);
  // The box a refusal of a new name or day is about, and the sentence beside it naming it.
  const boxWrong =
    problem === undefined
      ? undefined
      : typed?.label !== undefined
        ? ('label' as const)
        : typed?.date !== undefined
          ? ('date' as const)
          : undefined;
  const besideBox = (box: 'label' | 'date', field: string) =>
    boxWrong === box && problem !== undefined
      ? t('schedule.admin.fieldRefused', { field, why: problem })
      : undefined;
  const marked = (box: 'label' | 'date') =>
    boxWrong === box ? { 'aria-invalid': true as const, autoFocus: true as const } : {};
  return (
    <section aria-labelledby={headingId} data-round={round.id} className="staff-panel admin-round">
      {/* The round's head: its name, then its day (as the public pages write a day) and
          how many games it holds, as a pill. */}
      <div className="staff-panel-head">
        <h2 id={headingId}>
          {t('schedule.admin.round', { number: round.number, label: round.label })}
        </h2>
        <RoundFacts round={round} />
      </div>
      {saved}
      {problem === undefined || boxWrong !== undefined ? null : (
        <IntoView
          words={problem}
          marks={{
            className: 'ui-notice',
            'data-kind': 'error',
            role: 'alert',
            'data-notice': 'problem',
          }}
        >
          {problem}
        </IntoView>
      )}
      {basis.canEdit ? (
        <details open={problem !== undefined} className="admin-round-edit">
          <summary>{t('schedule.admin.roundEdit')}</summary>
          <div className="admin-round-forms">
            <form action={renameRoundAction} className="staff-form">
              <BasisFields basis={basis} />
              <input type="hidden" name="roundId" value={round.id} />
              <Field
                label={t('schedule.admin.renameRound')}
                wrong={besideBox('label', t('schedule.admin.renameRound'))}
              >
                <input
                  name="label"
                  defaultValue={typed?.label ?? round.label}
                  required
                  maxLength={120}
                  {...marked('label')}
                />
              </Field>
              <p className="staff-buttons">
                <button type="submit" className="ui-button">
                  {t('schedule.admin.renameRoundSubmit')}
                </button>
              </p>
            </form>
            <form action={changeRoundDateAction} className="staff-form">
              <BasisFields basis={basis} />
              <input type="hidden" name="roundId" value={round.id} />
              <Field
                label={t('schedule.admin.changeRoundDate')}
                wrong={besideBox('date', t('schedule.admin.changeRoundDate'))}
              >
                <input
                  type="date"
                  name="date"
                  defaultValue={typed?.date ?? round.date ?? ''}
                  required
                  {...marked('date')}
                />
              </Field>
              <p className="ui-field-help">{t('schedule.admin.changeRoundDateNote')}</p>
              <p className="staff-buttons">
                <button type="submit" className="ui-button">
                  {t('schedule.admin.changeRoundDateSubmit')}
                </button>
              </p>
            </form>
            <RoundRemoval
              round={round}
              action={removeRoundAction}
              fields={
                <>
                  <BasisFields basis={basis} />
                  <input type="hidden" name="roundId" value={round.id} />
                  <input type="hidden" name="afterRoundId" value={previousRoundId ?? ''} />
                </>
              }
            />
          </div>
        </details>
      ) : null}
      {/* Not while struck games stand in it: they are its rows (step 2.185). */}
      {roundIsEmpty(round) && round.removed.length === 0 ? (
        <p className="staff-quiet">{t('schedule.admin.noGamesInRound')}</p>
      ) : null}
      <GameList
        games={round.games}
        removed={round.removed}
        grid={grid}
        teams={teams}
        venues={venues}
        basis={basis}
        rounds={rounds}
        savedGame={savedGame}
      />
      {basis.canEdit ? <AddGame round={round} teams={teams} venues={venues} basis={basis} /> : null}
    </section>
  );
}

function LooseGames({
  grid,
  teams,
  venues,
  basis,
  saved,
  savedGame,
}: {
  readonly grid: Grid;
  readonly teams: readonly GridTeam[];
  readonly venues: readonly VenueWithCourts[];
  readonly basis: Basis;
  readonly saved: ReactNode;
  readonly savedGame: (gameId: string) => SavedGame;
}) {
  return (
    <section aria-labelledby="loose-heading" className="staff-panel admin-round">
      <h2 id="loose-heading">{t('schedule.admin.otherGames')}</h2>
      {saved}
      <GameList
        games={grid.looseGames}
        removed={grid.looseRemoved}
        grid={grid}
        teams={teams}
        venues={venues}
        basis={basis}
        rounds={grid.rounds}
        savedGame={savedGame}
      />
      {basis.canEdit ? <AddGame round={null} teams={teams} venues={venues} basis={basis} /> : null}
    </section>
  );
}

function GameList({
  games,
  removed,
  grid,
  teams,
  venues,
  basis,
  rounds,
  savedGame,
}: {
  readonly games: readonly GridGame[];
  /** Games of the published schedule the draft removes, in their places (step 2.185). */
  readonly removed: readonly RemovedGridGame[];
  readonly grid: Grid;
  readonly teams: readonly GridTeam[];
  readonly venues: readonly VenueWithCourts[];
  readonly basis: Basis;
  readonly rounds: readonly GridRound[];
  readonly savedGame: (gameId: string) => SavedGame;
}) {
  if (games.length === 0 && removed.length === 0) return null;
  return (
    <ol className="admin-slots">
      {gamesInOrder(games, removed).map((g) =>
        'roundGone' in g ? (
          <RemovedGameItem key={g.id} game={g} basis={basis} saved={savedGame(g.id)} />
        ) : (
          <GameItem
            key={g.id}
            game={g}
            grid={grid}
            teams={teams}
            venues={venues}
            basis={basis}
            rounds={rounds}
            saved={savedGame(g.id)}
          />
        ),
      )}
    </ol>
  );
}

/**
 * A game of the published schedule that the draft removes (step 2.185; DESIGN.md section 4:
 * "removed" is a bin with its way back): where it was, struck through, with "Removed in
 * this draft" and "Put it back", read from the draft itself, until the draft is published
 * or discarded. Right after the removal its answer stands here in place of that line.
 */
function RemovedGameItem({
  game,
  basis,
  saved,
}: {
  readonly game: RemovedGridGame;
  readonly basis: Basis;
  readonly saved: SavedGame;
}) {
  return (
    <li id={gameAnchor(game.id)} data-removed-game={game.id}>
      <p className="admin-slot-line">
        <Emblem name={game.awayName} size="small" />
        <Emblem name={game.homeName} size="small" />
        <strong>
          <del>{t('schedule.admin.gameVs', { away: game.awayName, home: game.homeName })}</del>
        </strong>
        <span>
          <del>{detailsOf(game)}</del>
        </span>
      </p>
      {saved?.node ?? (
        // One line and an outlined button: told by its strike, its bin and its words,
        // quieter than the round's games (step 2.185).
        <div className="ui-notice" data-kind="removed" data-put-back={game.id}>
          <div className="staff-buttons">
            <span>{removedLineOf(game)}</span>
            {/* Dropping a removal gives the draft the game back; not for a game whose team
                is in the bin, which the draft could then not publish (step 2.185). */}
            {basis.canEdit && !game.teamInBin ? (
              <PutBack
                gameId={game.id}
                game={t('schedule.admin.gameVs', { away: game.awayName, home: game.homeName })}
                basis={basis}
                // Where Games has its own "Put this game back" (a called-off game), the
                // button says which one it is (step 2.158).
                inDraft={game.status === 'postponed' || game.status === 'cancelled'}
              />
            ) : null}
          </div>
        </div>
      )}
    </li>
  );
}

/**
 * What a struck row says: removed in this draft, and what has happened to the game since
 * (played, started, postponed, cancelled), or that its round was removed too (S-60).
 */
function removedLineOf(game: RemovedGridGame): string {
  if (game.teamInBin) return t('schedule.admin.removedTeamInBin');
  if (game.status !== 'scheduled') return t(`schedule.admin.removedSince.${game.status}`);
  return game.roundGone === null
    ? t('schedule.admin.removedInDraft')
    : t('schedule.admin.removedInDraftNoRound', { round: game.roundGone });
}

/** A game's day, time, place and how it is recorded, as its row says them. */
function detailsOf(game: GridGame): string {
  const when = t('schedule.admin.gameWhen', {
    // Written as the public pages write a day and a time: "Sun, Nov 22, 6:00 PM".
    date: game.date === '' ? t('schedule.admin.noDate') : dayText(game.date),
    time: game.time === null ? t('schedule.admin.noTime') : clockText(game.time),
  });
  const place = game.placeLabel ?? t('schedule.admin.noPlace');
  return game.recording === null || game.recording === undefined
    ? t('schedule.admin.gameDetails', { when, place })
    : t('schedule.admin.gameDetailsRecording', {
        when,
        place,
        recording: t(`schedule.admin.recording.${game.recording}`),
      });
}

function GameItem({
  game,
  grid,
  venues,
  basis,
  rounds,
  saved,
}: {
  readonly game: GridGame;
  readonly grid: Grid;
  readonly teams: readonly GridTeam[];
  readonly venues: readonly VenueWithCourts[];
  readonly basis: Basis;
  readonly rounds: readonly GridRound[];
  /** "Saved", when the last save was this game's. */
  readonly saved: SavedGame;
}) {
  const others = grid.allGames.filter((o) => o.id !== game.id && o.editable);
  // While "Move it to … too?" is asked beside the game, its flag waits for the answer.
  const flagged = game.outsideRound && saved?.asks !== true;
  const round = rounds.find((r) => r.id === game.roundId);
  const refused =
    basis.refused?.at.form === 'game' && basis.refused.at.gameId === game.id
      ? basis.refused
      : undefined;
  const boxes = gameBoxes(refused);
  const swapRefused = basis.swapRefused?.gameId === game.id ? basis.swapRefused : undefined;
  return (
    <li id={gameAnchor(game.id)} data-game={game.id} data-clash={game.clashed ? 'yes' : 'no'}>
      {/* One row a game: its two teams' marks and names, then its day, time and place. */}
      <p className="admin-slot-line">
        <Emblem name={game.awayName} size="small" />
        <Emblem name={game.homeName} size="small" />
        <strong>{t('schedule.admin.gameVs', { away: game.awayName, home: game.homeName })}</strong>
        <span>{detailsOf(game)}</span>
      </p>
      {saved?.node}
      {game.clashed ? (
        <p role="status">
          <StaffPill kind="stop">{t('schedule.admin.clashFlag')}</StaffPill>
        </p>
      ) : null}
      {!flagged || game.offRoundDate === null || round === undefined ? null : (
        <div className="ui-notice" data-off-round-date={game.id}>
          <p role="status">
            <strong>
              {/* The day in words, as everywhere else on this page (step 2.103). */}
              {t('schedule.admin.offRoundDate', {
                round: round.label,
                date: dayText(game.offRoundDate),
              })}
            </strong>
          </p>
          {basis.canEdit && game.editable ? (
            <MoveToRoundDate
              game={game}
              date={game.offRoundDate}
              basis={basis}
              label={t('schedule.admin.moveToRoundDate', { date: dayText(game.offRoundDate) })}
            />
          ) : null}
        </div>
      )}
      {!basis.canEdit ? null : !game.editable ? (
        game.status === 'postponed' || game.status === 'cancelled' ? (
          // Where it goes from here (step 2.158): a postponed game waits in Games for its new
          // date; a cancelled one is put back from its own page there.
          <p className="staff-quiet" data-called-off={game.status}>
            {t(
              game.status === 'postponed'
                ? 'schedule.admin.gamePostponed'
                : 'schedule.admin.gameCancelled',
            )}{' '}
            <a href={game.status === 'postponed' ? basis.waitingHref : basis.gameHref(game.id)}>
              {t(
                game.status === 'postponed'
                  ? 'schedule.admin.toWaiting'
                  : 'schedule.admin.toPutBack',
              )}
            </a>
          </p>
        ) : (
          <p className="staff-quiet">{t('schedule.admin.gameLocked')}</p>
        )
      ) : (
        <details open={refused === undefined && swapRefused === undefined ? undefined : true}>
          <summary>{t('schedule.admin.edit')}</summary>
          <form action={saveGameAction} className="staff-form admin-slot-form">
            {boxes.top}
            <BasisFields basis={basis} />
            <input type="hidden" name="gameId" value={game.id} />
            <input
              type="hidden"
              name="wasSlot"
              value={[game.roundId ?? '', game.date, game.time ?? '', game.place].join('~')}
            />
            <input type="hidden" name="wasRecording" value={game.recording ?? ''} />
            <Field
              label={t('schedule.admin.roundField')}
              wrong={boxes.wrong('roundId')}
              now={boxes.now('roundId', game.roundId ?? '', () =>
                round === undefined
                  ? t('schedule.admin.noRound')
                  : t('schedule.admin.round', { number: round.number, label: round.label }),
              )}
            >
              <select
                name="roundId"
                defaultValue={boxes.value('roundId', game.roundId ?? '')}
                {...boxes.mark('roundId')}
              >
                <option value="">{t('schedule.admin.noRound')}</option>
                {rounds.map((r) => (
                  <option key={r.id} value={r.id}>
                    {t('schedule.admin.round', { number: r.number, label: r.label })}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label={t('schedule.admin.date')}
              wrong={boxes.wrong('date')}
              now={boxes.now('date', game.date, () => game.date)}
            >
              <input
                type="date"
                name="date"
                defaultValue={boxes.value('date', game.date)}
                required
                {...boxes.mark('date')}
              />
            </Field>
            <Field
              label={t('schedule.admin.time')}
              wrong={boxes.wrong('time')}
              now={boxes.now('time', game.time ?? '', () =>
                game.time === null ? t('schedule.admin.savedNowNothing') : game.time,
              )}
            >
              <input
                type="time"
                name="time"
                defaultValue={boxes.value('time', game.time ?? '')}
                {...boxes.mark('time')}
              />
            </Field>
            <Field
              label={t('schedule.admin.place')}
              wrong={boxes.wrong('place')}
              now={boxes.now('place', game.place, () => placeShown(venues, game.place))}
            >
              <PlaceSelect
                venues={venues}
                value={boxes.value('place', game.place)}
                marked={boxes.mark('place')}
              />
            </Field>
            <Field
              label={t('schedule.admin.recording')}
              wrong={boxes.wrong('recording')}
              now={boxes.now('recording', game.recording ?? '', () =>
                game.recording === null || game.recording === undefined
                  ? t('schedule.admin.recording.rules')
                  : t(`schedule.admin.recording.${game.recording}`),
              )}
            >
              <RecordingSelect
                value={game.recording}
                {...(refused === undefined ? {} : { typed: refused.at.typed.recording })}
                marked={boxes.mark('recording')}
              />
            </Field>
            {/* Save is the main button; "Remove game" is the outlined destructive one, apart. */}
            <p>
              <button type="submit" className="ui-button" data-kind="main">
                {t('schedule.admin.save')}
              </button>
            </p>
            <p>
              <button
                type="submit"
                formAction={removeGameAction}
                formNoValidate
                className="ui-button"
                data-kind="danger"
              >
                {t('schedule.admin.remove')}
              </button>
            </p>
          </form>
          {others.length === 0 ? null : (
            <form action={swapGamesAction} className="staff-form" id={swapAnchor(game.id)}>
              {swapRefused === undefined ? null : <MarkedFocus within={swapAnchor(game.id)} />}
              <BasisFields basis={basis} />
              <input type="hidden" name="gameId" value={game.id} />
              <Field
                label={t('schedule.admin.swapWith')}
                wrong={
                  swapRefused === undefined
                    ? undefined
                    : t('schedule.admin.fieldRefused', {
                        field: t('schedule.admin.swapWith'),
                        why: swapRefused.text,
                      })
                }
              >
                <select
                  name="otherGameId"
                  defaultValue={swapRefused?.otherGameId ?? ''}
                  required
                  {...(swapRefused === undefined
                    ? {}
                    : { 'aria-invalid': true as const, autoFocus: true as const })}
                >
                  <option value="">{t('schedule.admin.swapChoose')}</option>
                  {others.map((o) => (
                    <option key={o.id} value={o.id}>
                      {t('schedule.admin.swapOption', {
                        game: t('schedule.admin.gameVs', { away: o.awayName, home: o.homeName }),
                        date: o.date,
                      })}
                    </option>
                  ))}
                </select>
              </Field>
              <p className="ui-field-help">{t('schedule.admin.swapNote')}</p>
              <p className="staff-buttons">
                <button type="submit" className="ui-button">
                  {t('schedule.admin.swapSubmit')}
                </button>
              </p>
            </form>
          )}
        </details>
      )}
    </li>
  );
}

function AddGame({
  round,
  teams,
  venues,
  basis,
}: {
  readonly round: GridRound | null;
  readonly teams: readonly GridTeam[];
  readonly venues: readonly VenueWithCourts[];
  readonly basis: Basis;
}) {
  const roundId = round?.id ?? '';
  const refused =
    basis.refused?.at.form === 'add-game' && basis.refused.at.typed.roundId === roundId
      ? basis.refused
      : undefined;
  const boxes = gameBoxes(refused);
  return (
    <details
      data-add-game={round?.id ?? 'none'}
      id={addGameAnchor(roundId)}
      open={refused === undefined ? undefined : true}
    >
      <summary>{t('schedule.admin.addGame')}</summary>
      <form action={addGameAction} className="staff-form admin-slot-form">
        {boxes.top}
        <BasisFields basis={basis} />
        <input type="hidden" name="gameId" value={randomUUID()} />
        <input type="hidden" name="roundId" value={roundId} />
        <TeamSelect
          name="homeTeamId"
          label={t('schedule.admin.home')}
          teams={teams}
          value=""
          boxes={boxes}
        />
        <TeamSelect
          name="awayTeamId"
          label={t('schedule.admin.away')}
          teams={teams}
          value=""
          boxes={boxes}
        />
        <Field label={t('schedule.admin.date')} wrong={boxes.wrong('date')}>
          <input
            type="date"
            name="date"
            defaultValue={boxes.value('date', round?.date ?? '')}
            required
            {...boxes.mark('date')}
          />
        </Field>
        <Field label={t('schedule.admin.time')} wrong={boxes.wrong('time')}>
          <input
            type="time"
            name="time"
            defaultValue={boxes.value('time', '')}
            {...boxes.mark('time')}
          />
        </Field>
        <Field label={t('schedule.admin.place')} wrong={boxes.wrong('place')}>
          <PlaceSelect
            venues={venues}
            value={boxes.value('place', '')}
            marked={boxes.mark('place')}
          />
        </Field>
        <Field label={t('schedule.admin.recording')} wrong={boxes.wrong('recording')}>
          <RecordingSelect
            value={null}
            {...(refused === undefined ? {} : { typed: refused.at.typed.recording })}
            marked={boxes.mark('recording')}
          />
        </Field>
        <p className="staff-buttons">
          <button type="submit" className="ui-button" data-kind="main">
            {t('schedule.admin.addGameSubmit')}
          </button>
        </p>
      </form>
    </details>
  );
}

/** One button that moves a game to its round's date, keeping its round, time and place. */
function MoveToRoundDate({
  game,
  date,
  basis,
  label,
  main = false,
}: {
  readonly game: GridGame;
  readonly date: string;
  readonly basis: Basis;
  readonly label: string;
  /** The answer the question expects: drawn as the main button. */
  readonly main?: boolean;
}) {
  return (
    <form action={saveGameAction} className="admin-move-form">
      <BasisFields basis={basis} />
      <input type="hidden" name="gameId" value={game.id} />
      <input
        type="hidden"
        name="wasSlot"
        value={[game.roundId ?? '', game.date, game.time ?? '', game.place].join('~')}
      />
      <input type="hidden" name="roundId" value={game.roundId ?? ''} />
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="time" value={game.time ?? ''} />
      <input type="hidden" name="place" value={game.place} />
      <button type="submit" className="ui-button" data-kind={main ? 'main' : undefined}>
        {label}
      </button>
    </form>
  );
}

/**
 * "Put it back": one button that adds the removed game to the draft again with its own id
 * and its round, date, time, court and recording as they were. The form names only the
 * game: the server reads what it was from the draft (step 2.161).
 */
function PutBack({
  gameId,
  game,
  basis,
  main = false,
  inDraft = false,
}: {
  readonly gameId: string;
  /** The game's name, so the button is spoken with it (step 2.185). */
  readonly game: string;
  readonly basis: Basis;
  /** Filled only in the answer to a removal; on a struck row it is outlined (step 2.185). */
  readonly main?: boolean;
  /** Says "in the draft" on the button itself, not only in its spoken name. */
  readonly inDraft?: boolean;
}) {
  return (
    <form action={putBackGameAction}>
      <BasisFields basis={basis} />
      <input type="hidden" name="gameId" value={gameId} />
      <button
        type="submit"
        className="ui-button"
        data-kind={main ? 'main' : undefined}
        aria-label={t('schedule.admin.putBackNamed', { game })}
      >
        {t(inDraft ? 'schedule.admin.putBackInDraft' : 'schedule.admin.putBack')}
      </button>
    </form>
  );
}

/**
 * "Discard the draft" in one tap, for a draft that changes nothing (step 2.185): nothing
 * is lost. The same words do the same thing wherever they stand on the page.
 */
function DiscardSame({ basis }: { readonly basis: Basis }) {
  return (
    <form action={discardAction} data-discard-same="">
      <BasisFields basis={basis} />
      <button type="submit" className="ui-button">
        {t('schedule.admin.discard')}
      </button>
    </form>
  );
}

type AddRoundProblem = ReturnType<typeof addRoundProblemOf>;

/**
 * The "Add a round" form (step 2.160): a name and a date, the date suggested a week after
 * the last round's. After a refusal it keeps what was typed and says why beside the field
 * it is about.
 */
function AddRoundForm({
  basis,
  rounds,
  typed,
  problem,
}: {
  readonly basis: Basis;
  readonly rounds: readonly GridRound[];
  readonly typed: { readonly label: string; readonly date: string } | undefined;
  readonly problem: AddRoundProblem;
}) {
  const lastDate = rounds.findLast((r) => r.date !== null)?.date ?? null;
  const suggested = lastDate === null ? '' : (daysAfter(lastDate, 7) ?? '');
  const error = (field: 'label' | 'date' | 'form') =>
    problem?.field !== field ? null : (
      <IntoView
        words={problem.text}
        marks={{ className: 'ui-field-error', role: 'alert', 'data-notice': 'problem' }}
      >
        {problem.text}
      </IntoView>
    );
  return (
    <form action={addRoundAction} id={addRoundAnchor} data-add-round-form="" className="staff-form">
      <BasisFields basis={basis} />
      <input type="hidden" name="roundId" value={randomUUID()} />
      {/* Each field with its error and its help right under it, as one group. */}
      <div className="admin-field-group">
        <Field label={t('schedule.admin.addRoundName')}>
          <input
            name="label"
            defaultValue={typed?.label ?? ''}
            required
            maxLength={120}
            aria-describedby="add-round-name-help"
            aria-invalid={problem?.field === 'label' ? true : undefined}
          />
        </Field>
        {error('label')}
        <p id="add-round-name-help" className="ui-field-help">
          {t('schedule.admin.addRoundNameHelp')}
        </p>
      </div>
      <div className="admin-field-group">
        <Field label={t('schedule.admin.addRoundDate')}>
          <input
            type="date"
            name="date"
            defaultValue={typed === undefined || typed.date === '' ? suggested : typed.date}
            required
            aria-describedby="add-round-date-help"
            aria-invalid={problem?.field === 'date' ? true : undefined}
          />
        </Field>
        {error('date')}
        <p id="add-round-date-help" className="ui-field-help">
          {t('schedule.admin.addRoundNote')}
        </p>
      </div>
      {error('form')}
      <p className="staff-buttons">
        <button type="submit" className="ui-button" data-kind="main">
          {t('schedule.admin.addRoundSubmit')}
        </button>
      </p>
    </form>
  );
}

/**
 * "Add a round" under the grid's rounds: set apart from the last round by a rule, and
 * opened by a button-sized control. Open after a refusal.
 */
function AddRound(props: {
  readonly basis: Basis;
  readonly rounds: readonly GridRound[];
  readonly typed: { readonly label: string; readonly date: string } | undefined;
  readonly problem: AddRoundProblem;
}) {
  return (
    <section
      className="admin-add-round"
      aria-label={t('schedule.admin.addRound')}
      data-add-round-section=""
    >
      <details data-add-round="" open={props.problem !== undefined}>
        <summary className="ui-button" data-icon="plus">
          {t('schedule.admin.addRound')}
        </summary>
        <div className="staff-panel">
          <AddRoundForm {...props} />
        </div>
      </details>
    </section>
  );
}

/** "Saved" at a game, and whether it asks about the round's date. */
type SavedGame = { readonly node: ReactNode; readonly asks: boolean } | undefined;

/** Where "Saved" is said: in a round, at a game, after a round (null: before the first). */
type SavedPlace =
  | { readonly round: string | null }
  | { readonly game: string }
  | { readonly afterRound: string | null };

const samePlace = (a: SavedPlace, b: SavedPlace): boolean =>
  ('round' in a && 'round' in b && a.round === b.round) ||
  ('game' in a && 'game' in b && a.game === b.game) ||
  ('afterRound' in a && 'afterRound' in b && a.afterRound === b.afterRound);

/**
 * "Saved" beside what was saved, naming it (step 2.160, A-4): the address's anchor takes
 * the phone to it. A game moved to another round with its date left alone is offered the
 * round's date there, "No" keeping it as it is. Undefined when what it names is not on
 * the page: the page then says it at the top.
 */
function savedHere(
  saved: SavedDetail | undefined,
  grid: Grid,
  roundName: (round: GridRound) => string,
  basis: Basis,
  gridAddress: string,
  season: {
    readonly teams: readonly GridTeam[];
    /** The games the draft removes, each as it was just before (the draft's own record). */
    readonly removed: readonly ScheduleGame[];
    /** The rounds the draft removes: a game put back after its round went has no round (S-60). */
    readonly removedRounds: readonly ScheduleRound[];
  },
): { readonly place: SavedPlace; readonly node: ReactNode; readonly asks?: true } | undefined {
  if (saved === undefined) return undefined;
  // One notice in kinds told apart at a glance (step 2.103): saved, or removed with its
  // way back.
  const said = (text: string, more?: ReactNode, kind: 'saved' | 'removed' = 'saved') => (
    <SaidInView id={savedAnchor} kind={kind} words={text}>
      <p>{text}</p>
      {more}
    </SaidInView>
  );
  const gameName = (g: GridGame) =>
    t('schedule.admin.gameVs', { away: g.awayName, home: g.homeName });
  const roundOf = (id: string | null) => grid.rounds.find((r) => r.id === id);
  switch (saved.what) {
    case 'round-added':
    case 'round-saved': {
      const round = roundOf(saved.roundId);
      if (round === undefined) return undefined;
      const key =
        saved.what === 'round-added'
          ? 'schedule.admin.savedRoundAdded'
          : 'schedule.admin.savedRound';
      return { place: { round: round.id }, node: said(t(key, { round: roundName(round) })) };
    }
    case 'round-removed': {
      const after = roundOf(saved.afterRoundId)?.id ?? null;
      return {
        place: { afterRound: after },
        node: said(t('schedule.admin.savedRoundRemoved'), undefined, 'removed'),
      };
    }
    case 'game-removed': {
      const roundShown = roundOf(saved.roundId);
      const round = roundShown?.id ?? null;
      // What it was is the draft's own record of it, never the address (step 2.161).
      const removed = season.removed.find((g) => g.id === saved.gameId);
      const name = (id: string) => season.teams.find((team) => team.id === id)?.name;
      const home = removed === undefined ? undefined : name(removed.homeTeamId);
      const away = removed === undefined ? undefined : name(removed.awayTeamId);
      // "Put it back" only while the draft still removes it and it can be added again.
      if (removed === undefined || home === undefined || away === undefined || !basis.canEdit) {
        return {
          place: { round },
          node: said(t('schedule.admin.savedGameRemoved'), undefined, 'removed'),
        };
      }
      const game = t('schedule.admin.gameVs', { away, home });
      // Its round removed from the draft since (step 2.181): "Put it back" brings it back
      // under "Games with no round", and says so before the tap.
      const gone = season.removedRounds.find(
        (r) => r.id === removed.roundId && roundOf(r.id) === undefined,
      );
      const headline =
        gone !== undefined
          ? t('schedule.admin.savedGameRemovedRoundGone', { game, round: gone.label })
          : roundShown === undefined
            ? t('schedule.admin.savedGameRemovedNoRound', { game })
            : t('schedule.admin.savedGameRemovedNamed', { game, round: roundShown.label });
      // A game of the published schedule stays in the grid, struck through (step 2.185): the
      // answer stands at it. One only ever in the draft is gone: it is said in its round.
      const struck = [...grid.rounds.flatMap((r) => r.removed), ...grid.looseRemoved].find(
        (g) => g.id === removed.id,
      );
      const stays = struck !== undefined;
      // One of its teams is in the bin: putting it back could only fail, so it is not offered.
      const binned = struck?.teamInBin === true;
      const way = binned
        ? 'schedule.admin.removedTeamInBin'
        : gone !== undefined
          ? stays
            ? 'schedule.admin.removedPublishedNoRound'
            : 'schedule.admin.removedDraftOnlyNoRound'
          : stays
            ? 'schedule.admin.removedPublished'
            : 'schedule.admin.removedDraftOnly';
      return {
        place: stays ? { game: removed.id } : { round },
        node: said(
          headline,
          <div data-put-back={removed.id}>
            <p>{t(way)}</p>
            {binned ? null : <PutBack gameId={removed.id} game={game} basis={basis} main />}
          </div>,
          'removed',
        ),
      };
    }
    case 'game-already-back': {
      // "Put it back" tapped again, or on a page from before the first tap: nothing added.
      const game = grid.allGames.find((g) => g.id === saved.gameId);
      if (game === undefined) return undefined;
      return {
        place: { game: game.id },
        node: said(t('schedule.admin.savedGameAlreadyBack', { game: gameName(game) })),
      };
    }
    case 'game-put-back': {
      const game = grid.allGames.find((g) => g.id === saved.gameId);
      if (game === undefined) return undefined;
      const gone =
        game.roundId === null
          ? season.removedRounds.find((r) => r.id === saved.fromRoundId)
          : undefined;
      return {
        place: { game: game.id },
        node: said(
          gone === undefined
            ? t('schedule.admin.savedGamePutBack', { game: gameName(game) })
            : t('schedule.admin.savedGamePutBackNoRound', {
                game: gameName(game),
                round: gone.label,
              }),
        ),
      };
    }
    case 'game-saved':
    case 'game-round': {
      const game = grid.allGames.find((g) => g.id === saved.gameId);
      if (game === undefined) return undefined;
      const round = roundOf(game.roundId);
      if (saved.what === 'game-saved' || round === undefined) {
        return {
          place: { game: game.id },
          node: said(t('schedule.admin.savedGame', { game: gameName(game) })),
        };
      }
      const text = t('schedule.admin.savedGameRound', {
        game: gameName(game),
        round: roundName(round),
      });
      if (game.offRoundDate === null || !basis.canEdit || !game.editable) {
        return { place: { game: game.id }, node: said(text) };
      }
      // `kept` says nothing: it only makes the address differ from the grid's own, which no
      // longer holds the answer (step 2.155 part 6), so the browser draws the grid again
      // without the question rather than only moving to the game.
      const query = new URLSearchParams({ season: basis.seasonSlug, kept: game.id }).toString();
      const keep = `${gridAddress}?${query}#${gameAnchor(game.id)}`;
      return {
        place: { game: game.id },
        // The question offers the round's date: the game's own flag waits until it is answered.
        asks: true,
        node: said(
          text,
          <div data-follow-round-date={game.id}>
            <p>{t('schedule.admin.followRoundDate', { date: dayText(game.offRoundDate) })}</p>
            <MoveToRoundDate
              game={game}
              date={game.offRoundDate}
              basis={basis}
              main
              label={t('schedule.admin.followRoundDateYes', {
                date: dayText(game.offRoundDate),
              })}
            />
            <p>
              <a className="ui-button" href={keep}>
                {t('schedule.admin.followRoundDateNo', { date: dayText(game.date) })}
              </a>
            </p>
          </div>,
        ),
      };
    }
  }
}

function PublishPanel({
  preview,
  basis,
  count,
  gameName,
  lines,
  warnings,
}: {
  readonly preview: {
    readonly summary: {
      readonly gamesAdded: readonly string[];
      readonly gamesMoved: readonly string[];
      readonly gamesRemoved: readonly string[];
      readonly gamesRecordingChanged: readonly string[];
      readonly roundsRenamed: readonly string[];
      readonly roundsDateChanged: readonly string[];
      readonly roundsAdded: readonly string[];
      readonly roundsRemoved: readonly string[];
    };
    readonly teamCount: number;
    readonly peopleCount: number;
    readonly clashes: readonly unknown[];
    readonly games: readonly unknown[];
    readonly blockers: readonly { readonly code: string; readonly gameId?: string }[];
    readonly canPublish: boolean;
  };
  readonly basis: Basis;
  /** What publishing would change: the same number as the draft's line at the top. */
  readonly count: number;
  /** A game's name, for a blocker about it; undefined when it is not on the page. */
  readonly gameName: (gameId: string) => string | undefined;
  /** Each game publishing adds, moves or removes, named (step 2.53). */
  readonly lines: readonly PublishLine[];
  /** Each clash and game outside its round, said in the question; never a blocker (S-62). */
  readonly warnings: readonly string[];
}) {
  const s = preview.summary;
  // "Nothing to publish" is said once, calmly, in place of a row of zeros (step 2.185).
  const blockers = preview.blockers.filter((b) => b.code !== 'nothing-to-publish');
  const blocked =
    blockers.length === 0 ? null : (
      <div className="ui-notice" data-kind="error">
        <p>{t('schedule.admin.publishBlocked')}</p>
        <ul>
          {blockers.map((b, i) => {
            // A blocker about one game names it, with a way to its row (step 2.185).
            const name = b.gameId === undefined ? undefined : gameName(b.gameId);
            return (
              <li key={`${b.code}-${i}`}>
                {noticeOf({ blocker: b.code })?.text}{' '}
                {name === undefined || b.gameId === undefined ? null : (
                  <a href={`#${gameAnchor(b.gameId)}`}>
                    {t('schedule.admin.blockerGoTo', { game: name })}
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    );
  if (count === 0) {
    return (
      <>
        <p data-publish-nothing="">{t('schedule.admin.publishNothing')}</p>
        {blocked}
      </>
    );
  }
  return (
    <>
      <p data-publish-count={count}>
        <strong>{t.plural('schedule.admin.publishCount', count)}</strong>
      </p>
      {lines.length === 0 ? null : (
        <>
          <h3>{t('schedule.admin.publishGames')}</h3>
          <ul data-publish-games="">
            {lines.map((line) => (
              <li key={line.gameId} data-publish-game={line.gameId} data-change={line.kind}>
                <a href={`#${gameAnchor(line.gameId)}`}>{line.text}</a>
              </li>
            ))}
          </ul>
        </>
      )}
      {s.gamesRecordingChanged.length === 0 ? null : (
        <p>{t.plural('schedule.admin.publishRecorded', s.gamesRecordingChanged.length)}</p>
      )}
      {s.roundsAdded.length +
        s.roundsRemoved.length +
        s.roundsRenamed.length +
        s.roundsDateChanged.length ===
      0 ? null : (
        <p>
          {t('schedule.admin.publishRounds', {
            added: s.roundsAdded.length,
            removed: s.roundsRemoved.length,
            renamed: s.roundsRenamed.length,
            dates: s.roundsDateChanged.length,
          })}
        </p>
      )}
      <p data-publish-reach="">
        {t('schedule.admin.publishReach', {
          teams: preview.teamCount,
          people: preview.peopleCount,
        })}
      </p>
      {warnings.length === 0 || blockers.length > 0 ? null : (
        // A question, not a refusal: the admin may mean it (S-53, S-62).
        <div className="ui-notice" data-publish-ask="">
          {warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
          <p>
            <strong>{t('schedule.admin.askAnyway')}</strong>
          </p>
        </div>
      )}
      {blocked}
      {preview.canPublish ? (
        <form action={publishAction} className="staff-form">
          <BasisFields basis={basis} />
          <p className="staff-buttons">
            <button type="submit" className="ui-button" data-kind="main" data-publish-submit="">
              {t('schedule.admin.publishSubmit')}
            </button>
          </p>
        </form>
      ) : null}
    </>
  );
}
