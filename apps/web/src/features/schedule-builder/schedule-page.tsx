import {
  allows,
  getScheduleDraft,
  leagueScope,
  leagueUrl,
  listVenues,
  previewSchedulePublish,
  type VenueWithCourts,
} from '@srleagues/core';
import { OptionPicker } from '@srleagues/ui';
import { displayLabels } from '@srleagues/site';
import { randomUUID } from 'node:crypto';
import type { ReactNode } from 'react';
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
import { addRoundAnchor, refusedAtOf, roundAnchor, savedDetailOf } from './grid-answer.ts';
import type { SavedDetail } from './run-schedule-action.ts';
import { importLinkOf } from './import-link.ts';
import { noticeOf } from './notice.ts';

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
  // Every season, the ones not public yet too: a season is scheduled before it is shown.
  const seasons = await ports.scheduleAdmin.seasonsOf(addressee.id);
  const asked = firstValue(search['season']);
  const season = chooseSeason(seasons, asked);
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
  const labels = displayLabels(t);
  const heading = (top: ReactNode) => (
    <>
      <h1>{t('schedule.admin.title')}</h1>
      <OptionPicker
        name="season"
        label={labels.season}
        submitLabel={labels.show}
        action={action}
        value={season.slug}
        options={seasons.map((s) => ({
          value: s.slug,
          label: s.isPublic ? s.name : t('schedule.admin.seasonNotPublic', { name: s.name }),
        }))}
      />
      <p>{t('schedule.admin.seasonName', { name: season.name })}</p>
      <p>{t('schedule.admin.intro')}</p>
      <p>
        <a href={importLinkOf(addressee)}>{t('schedule.admin.importLink')}</a>
      </p>
      {top}
    </>
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
  const problemText = notice?.kind === 'problem' ? notice.text : undefined;
  const holder = await ports.accessOf(context);
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
  const savedTop = savedNotice(saved, grid, roundName, basis, action);
  const top = saidBeside ? null : (savedTop ?? plainNotice);

  return (
    <main>
      {heading(top)}
      {draft.draft === null ? (
        <p>{t('schedule.admin.noDraft')}</p>
      ) : (
        <p>{t.plural('schedule.admin.draftChanges', draft.draft.changeCount)}</p>
      )}
      {draft.draft?.outOfDate === true ? (
        <p role="alert">{t('schedule.admin.draftOutOfDate')}</p>
      ) : null}
      {draft.rejected.length === 0 ? null : (
        <p role="alert">{t.plural('schedule.admin.rejected', draft.rejected.length)}</p>
      )}
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
      {grid.rounds.length === 0 ? (
        <>
          <p>{t('schedule.admin.noRounds')}</p>
          {basis.canEdit ? <p>{t('schedule.admin.noRoundsHelp')}</p> : null}
        </>
      ) : null}
      {grid.rounds.map((round) => (
        <RoundSection
          key={round.id}
          round={round}
          grid={grid}
          teams={teams}
          venues={venues}
          basis={basis}
          rounds={grid.rounds}
          problem={besideRound === round.id ? problemText : undefined}
        />
      ))}
      {basis.canEdit ? (
        <AddRound
          basis={basis}
          rounds={grid.rounds}
          typed={besideAdd}
          problem={besideAdd === undefined ? undefined : problemText}
        />
      ) : null}
      <LooseGames grid={grid} teams={teams} venues={venues} basis={basis} />
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
}: {
  readonly round: GridRound;
  readonly grid: Grid;
  readonly teams: readonly GridTeam[];
  readonly venues: readonly VenueWithCourts[];
  readonly basis: Basis;
  readonly rounds: readonly GridRound[];
  /** Why the last change to this round was refused, said beside its forms. */
  readonly problem: string | undefined;
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
              <p>{t('schedule.admin.removeRoundNote')}</p>
              <button type="submit">{t('schedule.admin.removeRound')}</button>
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
}: {
  readonly grid: Grid;
  readonly teams: readonly GridTeam[];
  readonly venues: readonly VenueWithCourts[];
  readonly basis: Basis;
}) {
  return (
    <section aria-labelledby="loose-heading">
      <h2 id="loose-heading">{t('schedule.admin.otherGames')}</h2>
      <GameList
        games={grid.looseGames}
        grid={grid}
        teams={teams}
        venues={venues}
        basis={basis}
        rounds={grid.rounds}
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
}: {
  readonly games: readonly GridGame[];
  readonly grid: Grid;
  readonly teams: readonly GridTeam[];
  readonly venues: readonly VenueWithCourts[];
  readonly basis: Basis;
  readonly rounds: readonly GridRound[];
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
}: {
  readonly game: GridGame;
  readonly grid: Grid;
  readonly teams: readonly GridTeam[];
  readonly venues: readonly VenueWithCourts[];
  readonly basis: Basis;
  readonly rounds: readonly GridRound[];
}) {
  const others = grid.allGames.filter((o) => o.id !== game.id && o.editable);
  const round = rounds.find((r) => r.id === game.roundId);
  const when = t('schedule.admin.gameWhen', {
    date: game.date === '' ? t('schedule.admin.noDate') : game.date,
    time: game.time ?? t('schedule.admin.noTime'),
  });
  const place = game.placeLabel ?? t('schedule.admin.noPlace');
  return (
    <li data-game={game.id} data-clash={game.clashed ? 'yes' : 'no'}>
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
      {game.clashed ? (
        <p role="status">
          <strong>{t('schedule.admin.clashFlag')}</strong>
        </p>
      ) : null}
      {!game.outsideRound || game.offRoundDate === null || round === undefined ? null : (
        <div data-off-round-date={game.id}>
          <p role="status">
            <strong>
              {t('schedule.admin.offRoundDate', {
                round: t('schedule.admin.round', { number: round.number, label: round.label }),
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
}: {
  readonly game: GridGame;
  readonly date: string;
  readonly basis: Basis;
  readonly label: string;
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
      <button type="submit">{label}</button>
    </form>
  );
}

/**
 * "Add a round" at the foot of the grid (step 2.160): a name and a date, the date
 * suggested a week after the last round's. Open when the season has no rounds, and
 * after a refusal, with what was typed kept and the reason beside it.
 */
function AddRound({
  basis,
  rounds,
  typed,
  problem,
}: {
  readonly basis: Basis;
  readonly rounds: readonly GridRound[];
  readonly typed: { readonly label: string; readonly date: string } | undefined;
  readonly problem: string | undefined;
}) {
  const lastDate = rounds.findLast((r) => r.date !== null)?.date ?? null;
  const suggested = lastDate === null ? '' : (daysAfter(lastDate, 7) ?? '');
  return (
    <details
      id={addRoundAnchor}
      data-add-round=""
      open={rounds.length === 0 || problem !== undefined}
    >
      <summary>{t('schedule.admin.addRound')}</summary>
      <form action={addRoundAction}>
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
        <p id="add-round-name-help" className="ui-field-help">
          {t('schedule.admin.addRoundNameHelp')}
        </p>
        <Field label={t('schedule.admin.addRoundDate')}>
          <input
            type="date"
            name="date"
            defaultValue={typed?.date ?? suggested}
            required
            style={wide}
          />
        </Field>
        {problem === undefined ? null : (
          <p className="ui-field-error" role="alert" data-notice="problem">
            {problem}
          </p>
        )}
        <p>{t('schedule.admin.addRoundNote')}</p>
        <button type="submit">{t('schedule.admin.addRoundSubmit')}</button>
      </form>
    </details>
  );
}

/**
 * The words at the top after a save the address names (step 2.160): which round was
 * added, or which game went to which round and, when it is not on that round's date, the
 * offer to move it there too, "No" keeping it where it is.
 */
function savedNotice(
  saved: SavedDetail | undefined,
  grid: Grid,
  roundName: (round: GridRound) => string,
  basis: Basis,
  gridAddress: string,
): ReactNode {
  if (saved === undefined) return undefined;
  const said = (text: string, more?: ReactNode) => (
    <>
      <p className="ui-notice" role="status" data-notice="done">
        {text}
      </p>
      {more}
    </>
  );
  switch (saved.what) {
    case 'round-removed':
      return said(t('schedule.admin.savedRoundRemoved'));
    case 'round-added': {
      const round = grid.rounds.find((r) => r.id === saved.roundId);
      return round === undefined
        ? undefined
        : said(t('schedule.admin.savedRoundAdded', { round: roundName(round) }));
    }
    case 'game-round': {
      const game = grid.allGames.find((g) => g.id === saved.gameId);
      const round = grid.rounds.find((r) => r.id === game?.roundId);
      if (game === undefined || round === undefined) return undefined;
      const text = t('schedule.admin.savedGameRound', {
        game: t('schedule.admin.gameVs', { away: game.awayName, home: game.homeName }),
        round: roundName(round),
      });
      if (game.offRoundDate === null || !basis.canEdit || !game.editable) return said(text);
      const keep = `${gridAddress}?${new URLSearchParams({ season: basis.seasonSlug }).toString()}`;
      return said(
        text,
        <div data-follow-round-date={game.id}>
          <p>{t('schedule.admin.followRoundDate', { date: dayText(game.offRoundDate) })}</p>
          <MoveToRoundDate
            game={game}
            date={game.offRoundDate}
            basis={basis}
            label={t('schedule.admin.followRoundDateYes', { date: dayText(game.offRoundDate) })}
          />
          <p>
            <a href={keep}>{t('schedule.admin.followRoundDateNo', { date: dayText(game.date) })}</a>
          </p>
        </div>,
      );
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
