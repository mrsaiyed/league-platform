import {
  allows,
  getScheduleDraft,
  leagueScope,
  leagueUrl,
  listVenues,
  previewSchedulePublish,
  type VenueWithCourts,
} from '@srleagues/core';
import { randomUUID } from 'node:crypto';
import { Fragment, type ReactNode } from 'react';
import { webPorts } from '../../server/container.ts';
import { commandContextOf } from '../../server/context.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { t } from '../../server/messages.ts';
import { chooseSeason, firstValue, type SearchParams } from '../stats-pages/index.ts';
import {
  addGameAction,
  addRoundAction,
  changeRoundDateAction,
  discardAction,
  publishAction,
  removeGameAction,
  removeRoundAction,
  renameRoundAction,
  saveGameAction,
  swapGamesAction,
} from './actions.ts';
import {
  buildGrid,
  dayText,
  daysAfter,
  type Grid,
  type GridGame,
  type GridRound,
  type GridTeam,
} from './build-grid.ts';
import {
  addRoundAnchor,
  gameAnchor,
  refusedAtOf,
  roundAnchor,
  savedAnchor,
  savedDetailOf,
} from './grid-answer.ts';
import type { SavedDetail } from './run-schedule-action.ts';
import { importLinkOf } from './import-link.ts';
import { addRoundProblemOf, noticeOf, whyNotSaved } from './notice.ts';
import { ScheduleHeading } from './schedule-heading.tsx';
import { visibleSeasons } from './visible-seasons.ts';

type Basis = {
  readonly league: string;
  readonly seasonSlug: string;
  readonly seasonId: string;
  readonly basedOnRevision: number | null;
  readonly version: number | null;
  readonly draftId: string | null;
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
  // Every season, the ones not public yet too (a season is scheduled before it is shown),
  // but one not public only to someone who may read its program's schedule (P4 §4).
  const seasons = visibleSeasons(holder, await ports.scheduleAdmin.seasonsOf(addressee.id));
  const asked = firstValue(search['season']);
  const chosen = chooseSeason(seasons, asked);
  const season = seasons.find((s) => s.id === chosen?.id);
  const notice = noticeOf(search);
  const action = leagueUrl(addressee, 'admin-area', { area: 'schedule' });
  if (season === undefined) {
    return (
      <main>
        <h1>{t('schedule.admin.title')}</h1>
        <p>{t('schedule.admin.noSeason')}</p>
      </main>
    );
  }
  const deps = ports.scheduleAdmin.deps;
  const [drafted, listed, teams] = await Promise.all([
    getScheduleDraft(context, { seasonId: season.id }, deps),
    listVenues(context, {}, deps),
    ports.scheduleAdmin.teamsOf(addressee.id, season.id),
  ]);
  const importLink = (
    <p>
      <a href={importLinkOf(addressee)}>{t('schedule.admin.importLink')}</a>
    </p>
  );
  const heading = (top: ReactNode, firstRound: ReactNode = null) => (
    <ScheduleHeading seasons={seasons} season={season} action={action}>
      {firstRound}
      {importLink}
      {top}
    </ScheduleHeading>
  );
  const plainNotice =
    notice === undefined ? null : (
      <p
        className="ui-notice"
        role="status"
        data-notice={notice.kind}
        {...(notice.kind === 'problem' ? { 'data-kind': 'error' } : {})}
      >
        {notice.text}
      </p>
    );
  if (!drafted.ok) {
    const key = noticeOf({ problem: drafted.error.code });
    return (
      <main>
        {heading(plainNotice)}
        <p role="alert">{key?.text ?? t('schedule.admin.error.not-allowed')}</p>
      </main>
    );
  }
  const draft = drafted.value;
  const venues = listed.ok ? listed.value : [];
  const grid = buildGrid(draft, teams, venues);
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
  const mayDo = (permission: 'schedule.edit' | 'schedule.publish'): boolean =>
    holder !== undefined && allows(holder, permission, leagueScope);
  const basis: Basis = {
    canEdit: mayDo('schedule.edit'),
    canPublish: mayDo('schedule.publish'),
    league,
    seasonSlug: season.slug,
    seasonId: season.id,
    basedOnRevision: draft.latestRevision,
    version: draft.draft?.version ?? null,
    draftId: draft.draft?.id ?? null,
  };
  const preview =
    draft.draft === null
      ? undefined
      : await previewSchedulePublish(context, { seasonId: season.id }, deps);
  const saidBeside = basis.canEdit && (besideRound !== undefined || besideAdd !== undefined);
  const roundName = (r: GridRound) =>
    t('schedule.admin.round', { number: r.number, label: r.label });
  // "Saved", said beside what was saved (A-4); at the top only when that is not on the page.
  const here = savedHere(saved, grid, roundName, basis, action);
  const top = saidBeside || here !== undefined ? null : plainNotice;
  const noRounds = grid.rounds.length === 0;
  // A season with no rounds: a calm panel under the intro, the first round's form open in it.
  const firstRound = noRounds ? (
    <section className="ui-notice" aria-labelledby="no-rounds" data-no-rounds="">
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
    <main>
      {heading(top, firstRound)}
      {draft.draft !== null ? (
        <p>{t.plural('schedule.admin.draftChanges', draft.draft.changeCount)}</p>
      ) : season.isPublic ? (
        <p>{t('schedule.admin.noDraft')}</p>
      ) : (
        <p>{t('schedule.admin.noDraftHidden')}</p>
      )}
      {draft.draft?.outOfDate === true ? (
        <p role="alert">{t('schedule.admin.draftOutOfDate')}</p>
      ) : null}
      {draft.rejected.length === 0 ? null : (
        <p role="alert">{t.plural('schedule.admin.rejected', draft.rejected.length)}</p>
      )}
      {noRounds && grid.clashes.length === 0 ? null : (
        <section aria-labelledby="clashes-heading">
          <h2 id="clashes-heading">{t('schedule.admin.clashes')}</h2>
          {grid.clashes.length === 0 ? (
            <p>{t('schedule.admin.clashesNone')}</p>
          ) : (
            <ul data-clashes="">
              {grid.clashes.map((c) => (
                <li key={c.key}>{c.text}</li>
              ))}
            </ul>
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
        <section aria-labelledby="publish-heading">
          <h2 id="publish-heading">{t('schedule.admin.publish')}</h2>
          {!basis.canPublish || preview === undefined || !preview.ok ? null : (
            <PublishPanel preview={preview.value} basis={basis} />
          )}
          {basis.canEdit ? (
            <details>
              <summary>{t('schedule.admin.discard')}</summary>
              <p>{t('schedule.admin.discardNote')}</p>
              <form action={discardAction}>
                <BasisFields basis={basis} />
                <button type="submit">{t('schedule.admin.discardSubmit')}</button>
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
    </>
  );
}

const fieldStyle = { display: 'grid', gap: '0.25rem', marginBlock: '0.5rem' } as const;
const wide = { maxWidth: '100%', boxSizing: 'border-box', minHeight: '2.5rem' } as const;

function Field({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <label style={fieldStyle}>
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
    <select name="place" defaultValue={value} style={wide}>
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
    <select name="recording" defaultValue={value ?? ''} style={wide}>
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
      <select name={name} defaultValue={value} required style={wide}>
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
    <section aria-labelledby={headingId} data-round={round.id}>
      <h2 id={headingId}>
        {t('schedule.admin.round', { number: round.number, label: round.label })}
      </h2>
      <p>
        {round.date === null
          ? t('schedule.admin.roundNoDate')
          : t('schedule.admin.roundDate', { date: round.date })}{' '}
        {t.plural('schedule.admin.roundGames', round.games.length)}
      </p>
      {saved}
      {problem === undefined ? null : (
        <p className="ui-notice" data-kind="error" role="alert" data-notice="problem">
          {problem}
        </p>
      )}
      {basis.canEdit ? (
        <details open={problem !== undefined}>
          <summary>{t('schedule.admin.roundEdit')}</summary>
          <form action={renameRoundAction}>
            <BasisFields basis={basis} />
            <input type="hidden" name="roundId" value={round.id} />
            <Field label={t('schedule.admin.renameRound')}>
              <input
                name="label"
                defaultValue={round.label}
                required
                maxLength={120}
                style={wide}
              />
            </Field>
            <button type="submit">{t('schedule.admin.renameRoundSubmit')}</button>
          </form>
          <form action={changeRoundDateAction}>
            <BasisFields basis={basis} />
            <input type="hidden" name="roundId" value={round.id} />
            <Field label={t('schedule.admin.changeRoundDate')}>
              <input
                type="date"
                name="date"
                defaultValue={round.date ?? ''}
                required
                style={wide}
              />
            </Field>
            <p>{t('schedule.admin.changeRoundDateNote')}</p>
            <button type="submit">{t('schedule.admin.changeRoundDateSubmit')}</button>
          </form>
          {round.games.length === 0 ? (
            <form action={removeRoundAction} data-remove-round={round.id}>
              <BasisFields basis={basis} />
              <input type="hidden" name="roundId" value={round.id} />
              <input type="hidden" name="afterRoundId" value={previousRoundId ?? ''} />
              <p>{t('schedule.admin.removeRoundNote')}</p>
              <button type="submit" className="ui-button" data-kind="danger">
                {t('schedule.admin.removeRound')}
              </button>
            </form>
          ) : (
            <p data-remove-round-blocked={round.id}>
              {t.plural('schedule.admin.removeRoundBlocked', round.games.length)}
            </p>
          )}
        </details>
      ) : null}
      {round.games.length === 0 ? <p>{t('schedule.admin.noGamesInRound')}</p> : null}
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
    <section aria-labelledby="loose-heading">
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
    <ol style={{ paddingInlineStart: '1.25rem' }}>
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
    date: game.date === '' ? t('schedule.admin.noDate') : game.date,
    time: game.time ?? t('schedule.admin.noTime'),
  });
  const place = game.placeLabel ?? t('schedule.admin.noPlace');
  return (
    <li id={gameAnchor(game.id)} data-game={game.id} data-clash={game.clashed ? 'yes' : 'no'}>
      <p>
        <strong>{t('schedule.admin.gameVs', { away: game.awayName, home: game.homeName })}</strong>
        <br />
        {game.recording === null || game.recording === undefined
          ? t('schedule.admin.gameDetails', { when, place })
          : t('schedule.admin.gameDetailsRecording', {
              when,
              place,
              recording: t(`schedule.admin.recording.${game.recording}`),
            })}
      </p>
      {saved?.node}
      {game.clashed ? (
        <p role="status">
          <strong>{t('schedule.admin.clashFlag')}</strong>
        </p>
      ) : null}
      {!flagged || game.offRoundDate === null || round === undefined ? null : (
        <div data-off-round-date={game.id}>
          <p role="status">
            <strong>
              {t('schedule.admin.offRoundDate', { round: round.label, date: game.offRoundDate })}
            </strong>
          </p>
          {basis.canEdit && game.editable ? (
            <MoveToRoundDate
              game={game}
              date={game.offRoundDate}
              basis={basis}
              label={t('schedule.admin.moveToRoundDate', { date: game.offRoundDate })}
            />
          ) : null}
        </div>
      )}
      {!basis.canEdit ? null : !game.editable ? (
        <p>
          {game.status === 'postponed' || game.status === 'cancelled'
            ? t('schedule.admin.gameNotScheduled', { status: game.status })
            : t('schedule.admin.gameLocked')}
        </p>
      ) : (
        <details>
          <summary>{t('schedule.admin.edit')}</summary>
          <form action={saveGameAction}>
            <BasisFields basis={basis} />
            <input type="hidden" name="gameId" value={game.id} />
            <input
              type="hidden"
              name="wasSlot"
              value={[game.roundId ?? '', game.date, game.time ?? '', game.place].join('~')}
            />
            <input type="hidden" name="wasRecording" value={game.recording ?? ''} />
            <Field label={t('schedule.admin.roundField')}>
              <select name="roundId" defaultValue={game.roundId ?? ''} style={wide}>
                <option value="">{t('schedule.admin.noRound')}</option>
                {rounds.map((r) => (
                  <option key={r.id} value={r.id}>
                    {t('schedule.admin.round', { number: r.number, label: r.label })}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('schedule.admin.date')}>
              <input type="date" name="date" defaultValue={game.date} required style={wide} />
            </Field>
            <Field label={t('schedule.admin.time')}>
              <input type="time" name="time" defaultValue={game.time ?? ''} style={wide} />
            </Field>
            <Field label={t('schedule.admin.place')}>
              <PlaceSelect venues={venues} value={game.place} />
            </Field>
            <Field label={t('schedule.admin.recording')}>
              <RecordingSelect value={game.recording} />
            </Field>
            <button type="submit">{t('schedule.admin.save')}</button>{' '}
            <button type="submit" formAction={removeGameAction} formNoValidate>
              {t('schedule.admin.remove')}
            </button>
          </form>
          {others.length === 0 ? null : (
            <form action={swapGamesAction}>
              <BasisFields basis={basis} />
              <input type="hidden" name="gameId" value={game.id} />
              <Field label={t('schedule.admin.swapWith')}>
                <select name="otherGameId" defaultValue="" required style={wide}>
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
              <p>{t('schedule.admin.swapNote')}</p>
              <button type="submit">{t('schedule.admin.swapSubmit')}</button>
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
      <form action={addGameAction}>
        <BasisFields basis={basis} />
        <input type="hidden" name="gameId" value={randomUUID()} />
        <input type="hidden" name="roundId" value={round?.id ?? ''} />
        <TeamSelect name="homeTeamId" label={t('schedule.admin.home')} teams={teams} value="" />
        <TeamSelect name="awayTeamId" label={t('schedule.admin.away')} teams={teams} value="" />
        <Field label={t('schedule.admin.date')}>
          <input type="date" name="date" defaultValue={round?.date ?? ''} required style={wide} />
        </Field>
        <Field label={t('schedule.admin.time')}>
          <input type="time" name="time" style={wide} />
        </Field>
        <Field label={t('schedule.admin.place')}>
          <PlaceSelect venues={venues} value="" />
        </Field>
        <Field label={t('schedule.admin.recording')}>
          <RecordingSelect value={null} />
        </Field>
        <button type="submit">{t('schedule.admin.addGameSubmit')}</button>
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
    <form action={saveGameAction}>
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
    <form action={addRoundAction} id={addRoundAnchor} data-add-round-form="">
      <BasisFields basis={basis} />
      <input type="hidden" name="roundId" value={randomUUID()} />
      <Field label={t('schedule.admin.addRoundName')}>
        <input
          name="label"
          defaultValue={typed?.label ?? ''}
          required
          maxLength={120}
          aria-describedby="add-round-name-help"
          style={wide}
        />
      </Field>
      {error('label')}
      <p id="add-round-name-help" className="ui-field-help">
        {t('schedule.admin.addRoundNameHelp')}
      </p>
      <Field label={t('schedule.admin.addRoundDate')}>
        <input
          type="date"
          name="date"
          defaultValue={typed === undefined || typed.date === '' ? suggested : typed.date}
          required
          aria-describedby="add-round-date-help"
          style={wide}
        />
      </Field>
      {error('date')}
      <p id="add-round-date-help" className="ui-field-help">
        {t('schedule.admin.addRoundNote')}
      </p>
      {error('form')}
      <p>
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
    <section aria-label={t('schedule.admin.addRound')} data-add-round-section="">
      <hr />
      <details data-add-round="" open={props.problem !== undefined}>
        <summary className="ui-button">{t('schedule.admin.addRound')}</summary>
        <AddRoundForm {...props} />
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
): { readonly place: SavedPlace; readonly node: ReactNode; readonly asks?: true } | undefined {
  if (saved === undefined) return undefined;
  const said = (text: string, more?: ReactNode) => (
    <div id={savedAnchor} className="ui-notice" role="status" data-notice="done">
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
      return { place: { afterRound: after }, node: said(t('schedule.admin.savedRoundRemoved')) };
    }
    case 'game-removed': {
      const round = roundOf(saved.roundId)?.id ?? null;
      return { place: { round }, node: said(t('schedule.admin.savedGameRemoved')) };
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
        <p>{t.plural('schedule.admin.publishClashes', preview.clashes.length)}</p>
      )}
      {preview.blockers.length > 0 ? (
        <>
          <p>{t('schedule.admin.publishBlocked')}</p>
          <ul>
            {preview.blockers.map((b, i) => (
              <li key={`${b.code}-${i}`}>{noticeOf({ blocker: b.code })?.text}</li>
            ))}
          </ul>
        </>
      ) : null}
      {preview.canPublish ? (
        <form action={publishAction}>
          <BasisFields basis={basis} />
          <button type="submit">{t('schedule.admin.publishSubmit')}</button>
        </form>
      ) : null}
    </>
  );
}
