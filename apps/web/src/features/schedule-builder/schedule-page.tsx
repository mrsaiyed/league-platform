import {
  getScheduleDraft,
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
  changeRoundDateAction,
  discardAction,
  publishAction,
  removeGameAction,
  renameRoundAction,
  saveGameAction,
  swapGamesAction,
} from './actions.ts';
import {
  buildGrid,
  type Grid,
  type GridGame,
  type GridRound,
  type GridTeam,
} from './build-grid.ts';
import { importLinkOf } from './import-link.ts';
import { noticeOf } from './notice.ts';

type Basis = {
  readonly league: string;
  readonly seasonSlug: string;
  readonly seasonId: string;
  readonly basedOnRevision: number | null;
  readonly version: number | null;
  readonly draftId: string | null;
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
  const seasons = await ports.publicStats.seasonsOf(addressee.id);
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
  const heading = (
    <>
      <h1>{t('schedule.admin.title')}</h1>
      <OptionPicker
        name="season"
        label={labels.season}
        submitLabel={labels.show}
        action={action}
        value={season.slug}
        options={seasons.map((s) => ({ value: s.slug, label: s.name }))}
      />
      <p>{t('schedule.admin.seasonName', { name: season.name })}</p>
      <p>{t('schedule.admin.intro')}</p>
      <p>
        <a href={importLinkOf(addressee)}>{t('schedule.admin.importLink')}</a>
      </p>
      {notice === undefined ? null : (
        <p role="status" data-notice={notice.kind}>
          {notice.text}
        </p>
      )}
    </>
  );
  if (!drafted.ok) {
    const key = noticeOf({ problem: drafted.error.code });
    return (
      <main>
        {heading}
        <p role="alert">{key?.text ?? t('schedule.admin.error.not-allowed')}</p>
      </main>
    );
  }
  const draft = drafted.value;
  const venues = listed.ok ? listed.value : [];
  const grid = buildGrid(draft, teams, venues);
  const basis: Basis = {
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

  return (
    <main>
      {heading}
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
      {grid.rounds.length === 0 ? <p>{t('schedule.admin.noRounds')}</p> : null}
      {grid.rounds.map((round) => (
        <RoundSection
          key={round.id}
          round={round}
          grid={grid}
          teams={teams}
          venues={venues}
          basis={basis}
          rounds={grid.rounds}
        />
      ))}
      <LooseGames grid={grid} teams={teams} venues={venues} basis={basis} />
      {draft.draft === null ? null : (
        <section aria-labelledby="publish-heading">
          <h2 id="publish-heading">{t('schedule.admin.publish')}</h2>
          {preview === undefined || !preview.ok ? null : (
            <PublishPanel preview={preview.value} basis={basis} />
          )}
          <details>
            <summary>{t('schedule.admin.discard')}</summary>
            <p>{t('schedule.admin.discardNote')}</p>
            <form action={discardAction}>
              <BasisFields basis={basis} />
              <button type="submit">{t('schedule.admin.discardSubmit')}</button>
            </form>
          </details>
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
}: {
  readonly round: GridRound;
  readonly grid: Grid;
  readonly teams: readonly GridTeam[];
  readonly venues: readonly VenueWithCourts[];
  readonly basis: Basis;
  readonly rounds: readonly GridRound[];
}) {
  const headingId = `round-${round.id}`;
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
      <details>
        <summary>{t('schedule.admin.renameRound')}</summary>
        <form action={renameRoundAction}>
          <BasisFields basis={basis} />
          <input type="hidden" name="roundId" value={round.id} />
          <Field label={t('schedule.admin.renameRound')}>
            <input name="label" defaultValue={round.label} required maxLength={120} style={wide} />
          </Field>
          <button type="submit">{t('schedule.admin.renameRoundSubmit')}</button>
        </form>
        <form action={changeRoundDateAction}>
          <BasisFields basis={basis} />
          <input type="hidden" name="roundId" value={round.id} />
          <Field label={t('schedule.admin.changeRoundDate')}>
            <input type="date" name="date" defaultValue={round.date ?? ''} required style={wide} />
          </Field>
          <p>{t('schedule.admin.changeRoundDateNote')}</p>
          <button type="submit">{t('schedule.admin.changeRoundDateSubmit')}</button>
        </form>
      </details>
      {round.games.length === 0 ? <p>{t('schedule.admin.noGamesInRound')}</p> : null}
      <GameList
        games={round.games}
        grid={grid}
        teams={teams}
        venues={venues}
        basis={basis}
        rounds={rounds}
      />
      <AddGame round={round} teams={teams} venues={venues} basis={basis} />
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
      <AddGame round={null} teams={teams} venues={venues} basis={basis} />
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
  const when = t('schedule.admin.gameWhen', {
    date: game.date === '' ? t('schedule.admin.noDate') : game.date,
    time: game.time ?? t('schedule.admin.noTime'),
  });
  return (
    <li data-game={game.id} data-clash={game.clashed ? 'yes' : 'no'}>
      <p>
        <strong>{t('schedule.admin.gameVs', { away: game.awayName, home: game.homeName })}</strong>
        <br />
        {when}
        {', '}
        {game.placeLabel ?? t('schedule.admin.noPlace')}
        {game.recording === null || game.recording === undefined
          ? null
          : `, ${t(`schedule.admin.recording.${game.recording}`)}`}
      </p>
      {game.clashed ? (
        <p role="status">
          <strong>{t('schedule.admin.clashFlag')}</strong>
        </p>
      ) : null}
      {!game.editable ? (
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
                      {`${t('schedule.admin.gameVs', { away: o.awayName, home: o.homeName })}, ${o.date}`}
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
