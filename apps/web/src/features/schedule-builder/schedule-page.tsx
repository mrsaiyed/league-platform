import {
  gameAnchor,
  getScheduleDraft,
  isLeagueHidden,
  leagueUrl,
  listVenues,
  previewSchedulePublish,
  publishChangeCount,
  type ScheduleGame,
  type ScheduleRound,
  type VenueWithCourts,
} from '@srleagues/core';
import { Emblem, EmptyPanel, PageHead } from '@srleagues/ui';
import { randomUUID } from 'node:crypto';
import { Fragment, type ReactNode } from 'react';
import { webPorts } from '../../server/container.ts';
import { commandContextOf } from '../../server/context.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { t } from '../../server/messages.ts';
import {
  mayShowSeason,
  seasonSettingsAddress,
  visibilityAnchor,
} from '../season-settings/index.ts';
import { StaffPill } from '../staff/index.ts';
import { chooseSeason, firstValue, type SearchParams } from '../stats-pages/index.ts';
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
import {
  clockText,
  dayText,
  daysAfter,
  pageGrid,
  type Grid,
  type GridGame,
  type GridRound,
  type GridTeam,
} from './build-grid.ts';
import {
  addRoundAnchor,
  refusedAtOf,
  roundAnchor,
  savedAnchor,
  savedDetailOf,
} from './grid-answer.ts';
import type { SavedDetail } from './run-schedule-action.ts';
import { importLinkOf } from './import-link.ts';
import { addRoundProblemOf, noticeOf, whyNotSaved } from './notice.ts';
import { publishedNotice } from './published-notice.ts';
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
};

const recordings = ['final-score', 'box-score', 'live'] as const;

/** `/{league}/admin/schedule`: the hand-editing grid of rounds and games (P7 §4.3). */
export async function ScheduleBuilderPage({
  league,
  search,
}: {
  /** The route's `[league]` value. */
  readonly league: string;
  readonly search: SearchParams;
}) {
  const view = await loadLeaguePage(league, 'admin', 'schedule');
  const addressee = view.context.league;
  const ports = await webPorts();
  const context = commandContextOf(view.context);
  const holder = await ports.accessOf(context);
  // Every season the holder may be told of, the ones not public yet among them (a season is
  // scheduled before it is shown): the port lists only those (P4 §4).
  const seasons = await ports.scheduleAdmin.seasonsOf(addressee.id, holder);
  const asked = firstValue(search['season']);
  const chosen = chooseSeason(seasons, asked);
  const season = seasons.find((s) => s.id === chosen?.id);
  const notice = noticeOf(search);
  const action = leagueUrl(addressee, 'admin-area', { area: 'schedule' });
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
  // spreadsheet and, while a draft is waiting, go to "Review and publish" (the box itself
  // is at the foot of the grid; its place is step 2.53's).
  const headActions = (reviewHref: string | null) => (
    <div className="staff-actions">
      <a className="ui-button" href={importLinkOf(addressee)}>
        {t('schedule.admin.importLink')}
      </a>
      {reviewHref === null ? null : (
        <a className="ui-button" data-kind="main" href={reviewHref}>
          {t('schedule.admin.reviewPublish')}
        </a>
      )}
    </div>
  );
  const heading = (
    top: ReactNode,
    firstRound: ReactNode = null,
    reviewHref: string | null = null,
  ) => (
    <ScheduleHeading
      seasons={seasons}
      season={season}
      action={action}
      actions={headActions(reviewHref)}
    >
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
  const plainNotice =
    published !== undefined ? (
      <div
        className="ui-notice"
        role="status"
        data-kind="saved"
        data-notice="done"
        data-published=""
      >
        <p>{published.text}</p>
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
      <p
        className="ui-notice"
        role="status"
        data-notice={notice.kind}
        data-kind={notice.kind === 'problem' ? 'error' : 'saved'}
      >
        {notice.text}
      </p>
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
  const saved = savedDetailOf(search);
  const refusedAt = refusedAtOf(search);
  // A refusal of a round's form is said beside that form, if it is on the page.
  const besideRound =
    refusedAt?.form === 'round' && grid.rounds.some((r) => r.id === refusedAt.roundId)
      ? refusedAt.roundId
      : undefined;
  const besideAdd = refusedAt?.form === 'add-round' ? refusedAt : undefined;
  const roundProblem = besideRound === undefined ? undefined : whyNotSaved(search);
  const addProblem = besideAdd === undefined ? undefined : addRoundProblemOf(search, besideAdd);
  const basis: Basis = {
    ...seasonControls(holder, season),
    league,
    seasonSlug: season.slug,
    seasonId: season.id,
    basedOnRevision: draft.latestRevision,
    version: draft.draft?.version ?? null,
    draftId: draft.draft?.id ?? null,
    fromTeam: fromTeam?.id ?? null,
  };
  const preview =
    draft.draft === null
      ? undefined
      : await previewSchedulePublish(context, { seasonId: season.id }, deps);
  // The same summary the publish box shows, where the viewer may see it; else the draft's own.
  const toPublish = publishChangeCount(
    preview !== undefined && preview.ok ? preview.value.summary : draft.summary,
  );
  const saidBeside = basis.canEdit && (besideRound !== undefined || besideAdd !== undefined);
  const roundName = (r: GridRound) =>
    t('schedule.admin.round', { number: r.number, label: r.label });
  // "Saved", said beside what was saved (A-4); at the top only when that is not on the page.
  const here = savedHere(saved, grid, roundName, basis, action, {
    teams,
    published: new Set(draft.published.games.map((g) => g.id)),
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

  return (
    <main className="admin-schedule">
      {heading(
        top,
        firstRound,
        draft.draft !== null && (basis.canEdit || basis.canPublish) ? '#publish-heading' : null,
      )}
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
        <p className="admin-schedule-draft" data-draft-count={toPublish}>
          <StaffPill kind="wait">{t('schedule.admin.draftPill')}</StaffPill>
          <span>
            {toPublish === 0
              ? t('schedule.admin.draftChangesNone')
              : t.plural('schedule.admin.draftChanges', toPublish)}
          </span>
        </p>
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
      {draft.draft === null || !(basis.canEdit || basis.canPublish) ? null : (
        <section aria-labelledby="publish-heading" className="staff-panel admin-publish">
          <h2 id="publish-heading">{t('schedule.admin.publish')}</h2>
          {!basis.canPublish || preview === undefined || !preview.ok ? null : (
            <PublishPanel preview={preview.value} basis={basis} />
          )}
          {/* Throwing the draft away is apart from publishing it, and looks like neither. */}
          {basis.canEdit ? (
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
          ) : null}
        </section>
      )}
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
      {basis.fromTeam === null ? null : (
        <input type="hidden" name={backToTeamParam} value={basis.fromTeam} />
      )}
    </>
  );
}

/** A field of the grid's forms: its label above it (the staff area's field piece). */
function Field({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <label className="staff-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function PlaceSelect({
  venues,
  value,
}: {
  readonly venues: readonly VenueWithCourts[];
  readonly value: string;
}) {
  return (
    <select name="place" defaultValue={value}>
      <option value="">{t('schedule.admin.noPlaceOption')}</option>
      {venues.flatMap((v) => [
        <option key={v.id} value={`${v.id}|`}>
          {t('schedule.admin.venueOnly', { venue: v.name })}
        </option>,
        ...v.courts.map((c) => (
          <option key={c.id} value={`${v.id}|${c.name}`}>
            {t('schedule.admin.venueCourt', { venue: v.name, court: c.name })}
          </option>
        )),
      ])}
    </select>
  );
}

function RecordingSelect({ value }: { readonly value: GridGame['recording'] }) {
  return (
    <select name="recording" defaultValue={value ?? ''}>
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
}: {
  readonly name: string;
  readonly label: string;
  readonly teams: readonly GridTeam[];
  readonly value: string;
}) {
  return (
    <Field label={label}>
      <select name={name} defaultValue={value} required>
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
  /** "Saved", when the last save was this round's. */
  readonly saved: ReactNode;
  readonly savedGame: (gameId: string) => SavedGame;
  /** Where "the round was removed" is said if this one is: after the round before it. */
  readonly previousRoundId: string | null;
}) {
  const headingId = roundAnchor(round.id);
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
      {problem === undefined ? null : (
        <p className="ui-notice" data-kind="error" role="alert" data-notice="problem">
          {problem}
        </p>
      )}
      {basis.canEdit ? (
        <details open={problem !== undefined} className="admin-round-edit">
          <summary>{t('schedule.admin.roundEdit')}</summary>
          <div className="admin-round-forms">
            <form action={renameRoundAction} className="staff-form">
              <BasisFields basis={basis} />
              <input type="hidden" name="roundId" value={round.id} />
              <Field label={t('schedule.admin.renameRound')}>
                <input name="label" defaultValue={round.label} required maxLength={120} />
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
              <Field label={t('schedule.admin.changeRoundDate')}>
                <input type="date" name="date" defaultValue={round.date ?? ''} required />
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
      {roundIsEmpty(round) ? (
        <p className="staff-quiet">{t('schedule.admin.noGamesInRound')}</p>
      ) : null}
      <GameList
        games={round.games}
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
  grid,
  teams,
  venues,
  basis,
  rounds,
  savedGame,
}: {
  readonly games: readonly GridGame[];
  readonly grid: Grid;
  readonly teams: readonly GridTeam[];
  readonly venues: readonly VenueWithCourts[];
  readonly basis: Basis;
  readonly rounds: readonly GridRound[];
  readonly savedGame: (gameId: string) => SavedGame;
}) {
  if (games.length === 0) return null;
  return (
    <ol className="admin-slots">
      {games.map((g) => (
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
      ))}
    </ol>
  );
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
  const when = t('schedule.admin.gameWhen', {
    // Written as the public pages write a day and a time: "Sun, Nov 22, 6:00 PM".
    date: game.date === '' ? t('schedule.admin.noDate') : dayText(game.date),
    time: game.time === null ? t('schedule.admin.noTime') : clockText(game.time),
  });
  const place = game.placeLabel ?? t('schedule.admin.noPlace');
  return (
    <li id={gameAnchor(game.id)} data-game={game.id} data-clash={game.clashed ? 'yes' : 'no'}>
      {/* One row a game: its two teams' marks and names, then its day, time and place. */}
      <p className="admin-slot-line">
        <Emblem name={game.awayName} size="small" />
        <Emblem name={game.homeName} size="small" />
        <strong>{t('schedule.admin.gameVs', { away: game.awayName, home: game.homeName })}</strong>
        <span>
          {game.recording === null || game.recording === undefined
            ? t('schedule.admin.gameDetails', { when, place })
            : t('schedule.admin.gameDetailsRecording', {
                when,
                place,
                recording: t(`schedule.admin.recording.${game.recording}`),
              })}
        </span>
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
        <p className="staff-quiet">
          {game.status === 'postponed' || game.status === 'cancelled'
            ? t('schedule.admin.gameNotScheduled', { status: game.status })
            : t('schedule.admin.gameLocked')}
        </p>
      ) : (
        <details>
          <summary>{t('schedule.admin.edit')}</summary>
          <form action={saveGameAction} className="staff-form admin-slot-form">
            <BasisFields basis={basis} />
            <input type="hidden" name="gameId" value={game.id} />
            <input
              type="hidden"
              name="wasSlot"
              value={[game.roundId ?? '', game.date, game.time ?? '', game.place].join('~')}
            />
            <input type="hidden" name="wasRecording" value={game.recording ?? ''} />
            <Field label={t('schedule.admin.roundField')}>
              <select name="roundId" defaultValue={game.roundId ?? ''}>
                <option value="">{t('schedule.admin.noRound')}</option>
                {rounds.map((r) => (
                  <option key={r.id} value={r.id}>
                    {t('schedule.admin.round', { number: r.number, label: r.label })}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('schedule.admin.date')}>
              <input type="date" name="date" defaultValue={game.date} required />
            </Field>
            <Field label={t('schedule.admin.time')}>
              <input type="time" name="time" defaultValue={game.time ?? ''} />
            </Field>
            <Field label={t('schedule.admin.place')}>
              <PlaceSelect venues={venues} value={game.place} />
            </Field>
            <Field label={t('schedule.admin.recording')}>
              <RecordingSelect value={game.recording} />
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
            <form action={swapGamesAction} className="staff-form">
              <BasisFields basis={basis} />
              <input type="hidden" name="gameId" value={game.id} />
              <Field label={t('schedule.admin.swapWith')}>
                <select name="otherGameId" defaultValue="" required>
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
  return (
    <details data-add-game={round?.id ?? 'none'}>
      <summary>{t('schedule.admin.addGame')}</summary>
      <form action={addGameAction} className="staff-form admin-slot-form">
        <BasisFields basis={basis} />
        <input type="hidden" name="gameId" value={randomUUID()} />
        <input type="hidden" name="roundId" value={round?.id ?? ''} />
        <TeamSelect name="homeTeamId" label={t('schedule.admin.home')} teams={teams} value="" />
        <TeamSelect name="awayTeamId" label={t('schedule.admin.away')} teams={teams} value="" />
        <Field label={t('schedule.admin.date')}>
          <input type="date" name="date" defaultValue={round?.date ?? ''} required />
        </Field>
        <Field label={t('schedule.admin.time')}>
          <input type="time" name="time" />
        </Field>
        <Field label={t('schedule.admin.place')}>
          <PlaceSelect venues={venues} value="" />
        </Field>
        <Field label={t('schedule.admin.recording')}>
          <RecordingSelect value={null} />
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
function PutBack({ gameId, basis }: { readonly gameId: string; readonly basis: Basis }) {
  return (
    <form action={putBackGameAction}>
      <BasisFields basis={basis} />
      <input type="hidden" name="gameId" value={gameId} />
      <button type="submit" className="ui-button" data-kind="main">
        {t('schedule.admin.putBack')}
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
      <p className="ui-field-error" role="alert" data-notice="problem">
        {problem.text}
      </p>
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
    /** The games of the published schedule: removing one changes the public one on publishing. */
    readonly published: ReadonlySet<string>;
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
    <div id={savedAnchor} className="ui-notice" data-kind={kind} role="status" data-notice="done">
      <p>{text}</p>
      {more}
    </div>
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
      // Already back (a reload after "Put it back"): said at the game, truthfully.
      const back = grid.allGames.find((g) => g.id === saved.gameId);
      if (back !== undefined) {
        const goneFrom =
          back.roundId === null
            ? season.removedRounds.find((r) => r.id === saved.roundId)
            : undefined;
        return {
          place: { game: back.id },
          node: said(
            goneFrom === undefined
              ? t('schedule.admin.savedGamePutBack', { game: gameName(back) })
              : t('schedule.admin.savedGamePutBackNoRound', {
                  game: gameName(back),
                  round: goneFrom.label,
                }),
          ),
        };
      }
      // What it was is the draft's own record of it, never the address (step 2.161).
      const removed = season.removed.find((g) => g.id === saved.gameId);
      const name = (id: string) => season.teams.find((team) => team.id === id)?.name;
      const home = removed === undefined ? undefined : name(removed.homeTeamId);
      const away = removed === undefined ? undefined : name(removed.awayTeamId);
      // "Put it back" only while the draft still removes it and it can be added again.
      if (
        removed === undefined ||
        home === undefined ||
        away === undefined ||
        removed.status !== 'scheduled' ||
        !basis.canEdit
      ) {
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
      const published = season.published.has(removed.id);
      const way =
        gone !== undefined
          ? published
            ? 'schedule.admin.removedPublishedNoRound'
            : 'schedule.admin.removedDraftOnlyNoRound'
          : published
            ? 'schedule.admin.removedPublished'
            : 'schedule.admin.removedDraftOnly';
      return {
        place: { round },
        node: said(
          headline,
          <div data-put-back={removed.id}>
            <p>{t(way)}</p>
            <PutBack gameId={removed.id} basis={basis} />
          </div>,
          'removed',
        ),
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
      const query = new URLSearchParams({ season: basis.seasonSlug }).toString();
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
    readonly blockers: readonly { readonly code: string }[];
    readonly canPublish: boolean;
  };
  readonly basis: Basis;
}) {
  const s = preview.summary;
  return (
    <>
      <p>
        {t('schedule.admin.publishSummary', {
          added: s.gamesAdded.length,
          moved: s.gamesMoved.length,
          removed: s.gamesRemoved.length,
          recorded: s.gamesRecordingChanged.length,
          teams: preview.teamCount,
          people: preview.peopleCount,
        })}
      </p>
      <p>
        {t('schedule.admin.publishRounds', {
          added: s.roundsAdded.length,
          removed: s.roundsRemoved.length,
          renamed: s.roundsRenamed.length,
          dates: s.roundsDateChanged.length,
        })}
      </p>
      {preview.clashes.length === 0 ? null : (
        <p className="ui-notice">
          {t.plural('schedule.admin.publishClashes', preview.clashes.length)}
        </p>
      )}
      {preview.blockers.length > 0 ? (
        <div className="ui-notice" data-kind="error">
          <p>{t('schedule.admin.publishBlocked')}</p>
          <ul>
            {preview.blockers.map((b, i) => (
              <li key={`${b.code}-${i}`}>{noticeOf({ blocker: b.code })?.text}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {preview.canPublish ? (
        <form action={publishAction} className="staff-form">
          <BasisFields basis={basis} />
          <p className="staff-buttons">
            <button type="submit" className="ui-button" data-kind="main">
              {t('schedule.admin.publishSubmit')}
            </button>
          </p>
        </form>
      ) : null}
    </>
  );
}
