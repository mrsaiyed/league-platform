// "Give it a new date" on Admin → Games' "Waiting for a new date" (step 2.53, S-49, T-326):
// a postponed game's new date, time and court go into the season's schedule draft as the
// grid's own "Save" puts them (the same command, the same clash rules and sentences), and
// reach the public schedule when the schedule is published, as every change to a published
// schedule does (P7 §4.4). Publishing the move makes the game scheduled again. The form
// posts to the grid's own action, so the answer is said on the grid, beside the game.
import {
  getScheduleDraft,
  leagueUrl,
  listVenues,
  moveDraftGame,
  type CommandContext,
  type VenueWithCourts,
} from '@srleagues/core';
import { webPorts } from '../../server/container.ts';
import { t } from '../../server/messages.ts';
import { saveGameAction } from './actions.ts';
import { publishAnchor } from './back-to-team.ts';
import { clockText, dayText, placeValue } from './build-grid.ts';
import { PlaceSelect } from './place-select.tsx';
import { seasonControls } from './season-controls.ts';

/** What "Waiting for a new date" offers one game: the form, or its new date in the draft. */
/** What a form to the grid's own save names: the season and the draft it was read from. */
type DraftBasisFields = {
  readonly league: string;
  readonly seasonSlug: string;
  readonly seasonId: string;
  readonly basedOnRevision: number | null;
  readonly version: number | null;
  readonly draftId: string | null;
};

export type NewDate =
  | (DraftBasisFields & {
      readonly kind: 'form';
      readonly roundId: string | null;
      readonly time: string | null;
      readonly place: string;
      readonly venues: readonly VenueWithCourts[];
    })
  | (DraftBasisFields & {
      readonly kind: 'in-draft';
      readonly when: string;
      readonly publishHref: string;
    });

/** By game id; a game missing is one this person may not give a date (no schedule.edit). */
export type NewDates = ReadonlyMap<string, NewDate>;

/**
 * Reads, for each season the waiting games are in, its draft and venues, for whoever may edit
 * that season's schedule (the schedule's own rule, seasonControls).
 */
export async function readNewDates(
  league: string,
  addressee: Parameters<typeof leagueUrl>[0] & { readonly id: string },
  context: CommandContext,
  games: readonly { readonly id: string; readonly seasonId: string }[],
): Promise<NewDates> {
  const found = new Map<string, NewDate>();
  if (games.length === 0) return found;
  const ports = await webPorts();
  const holder = await ports.accessOf(context);
  const seasons = await ports.scheduleAdmin.seasonsOf(addressee.id, holder);
  const deps = ports.scheduleAdmin.deps;
  const listed = await listVenues(context, {}, deps);
  const venues = listed.ok ? listed.value : [];
  const schedule = leagueUrl(addressee, 'admin-area', { area: 'schedule' });
  for (const seasonId of new Set(games.map((g) => g.seasonId))) {
    const season = seasons.find((s) => s.id === seasonId);
    if (season === undefined || !seasonControls(holder, season).canEdit) continue;
    const drafted = await getScheduleDraft(context, { seasonId }, deps);
    if (!drafted.ok) continue;
    const draft = drafted.value;
    const query = new URLSearchParams({ season: season.slug });
    const basis: DraftBasisFields = {
      league,
      seasonSlug: season.slug,
      seasonId,
      basedOnRevision: draft.latestRevision,
      version: draft.draft?.version ?? null,
      draftId: draft.draft?.id ?? null,
    };
    for (const game of games.filter((g) => g.seasonId === seasonId)) {
      const now = draft.result.games.find((g) => g.id === game.id);
      if (now === undefined) continue;
      if (now.status === 'scheduled') {
        found.set(game.id, {
          ...basis,
          kind: 'in-draft',
          when:
            now.time === null
              ? dayText(now.date)
              : t('schedule.admin.gameWhen', {
                  date: dayText(now.date),
                  time: clockText(now.time),
                }),
          publishHref: `${schedule}?${query.toString()}#${publishAnchor}`,
        });
        continue;
      }
      found.set(game.id, {
        ...basis,
        kind: 'form',
        roundId: now.roundId,
        time: now.time,
        place: placeValue(now.venueId, now.court),
        venues,
      });
    }
  }
  return found;
}

/**
 * Whether this person may give a postponed game a new date: may edit the schedule of a season
 * of the league (the schedule's own rule, seasonControls). Postponing's "give it a new date
 * now" is offered, and taken, only then (step 2.53 fix round).
 */
export async function mayGiveNewDates(
  addressee: { readonly id: string },
  context: CommandContext,
): Promise<boolean> {
  const ports = await webPorts();
  const holder = await ports.accessOf(context);
  const seasons = await ports.scheduleAdmin.seasonsOf(addressee.id, holder);
  return seasons.some((s) => seasonControls(holder, s).canEdit);
}

/**
 * "Put it back on its date" while the draft gives the game a new date (step 2.53 fix round):
 * the drafted move is taken back too, so publishing does not move the game later. Only for
 * whoever may edit the season's schedule (the command's own rule); for anyone else, and when
 * the draft does not move the game, nothing is done and the move stays for the publisher.
 */
export async function takeBackNewDate(
  context: CommandContext,
  seasonId: string,
  gameId: string,
): Promise<void> {
  const deps = (await webPorts()).scheduleAdmin.deps;
  const drafted = await getScheduleDraft(context, { seasonId }, deps);
  if (!drafted.ok || drafted.value.draft === null) return;
  if (!drafted.value.summary.gamesMoved.includes(gameId)) return;
  await moveDraftGame(
    context,
    {
      seasonId,
      basedOnRevision: drafted.value.latestRevision,
      version: drafted.value.draft.version,
      draftId: drafted.value.draft.id,
      gameId,
      roundId: null,
      date: '',
      time: null,
      venueId: null,
      court: null,
      takeBack: true,
    },
    deps,
  );
}

/** The fields every form to the grid's own save carries. */
function BasisFields({
  basis,
  gameId,
}: {
  readonly basis: DraftBasisFields;
  readonly gameId: string;
}) {
  return (
    <>
      <input type="hidden" name="league" value={basis.league} />
      <input type="hidden" name="season" value={basis.seasonSlug} />
      <input type="hidden" name="seasonId" value={basis.seasonId} />
      <input type="hidden" name="basedOnRevision" value={basis.basedOnRevision ?? ''} />
      <input type="hidden" name="version" value={basis.version ?? ''} />
      <input type="hidden" name="draftId" value={basis.draftId ?? ''} />
      <input type="hidden" name="gameId" value={gameId} />
    </>
  );
}

/** One waiting game's "Give it a new date", or the date the draft gives it already. */
export function NewDateForm({
  gameId,
  newDate,
}: {
  readonly gameId: string;
  readonly newDate: NewDate;
}) {
  if (newDate.kind === 'in-draft') {
    return (
      <div className="ui-stack" data-new-date-drafted={gameId}>
        <p className="staff-quiet">
          {t('schedule.admin.newDate.inDraft', { when: newDate.when })}{' '}
          <a href={newDate.publishHref} data-new-date-publish="">
            {t('schedule.admin.newDate.publish')}
          </a>
        </p>
        <form action={saveGameAction} data-new-date-take-back={gameId}>
          <BasisFields basis={newDate} gameId={gameId} />
          <input type="hidden" name="takeBack" value="yes" />
          <button type="submit" className="ui-button" data-kind="quiet">
            {t('schedule.admin.newDate.takeBack')}
          </button>
        </form>
      </div>
    );
  }
  return (
    <form
      action={saveGameAction}
      className="staff-form admin-slot-form"
      data-new-date-form={gameId}
    >
      <fieldset className="ui-stack">
        <legend>{t('schedule.admin.newDate.title')}</legend>
        <BasisFields basis={newDate} gameId={gameId} />
        <input type="hidden" name="roundId" value={newDate.roundId ?? ''} />
        {/* Never the slot sent: so a new date is always put in the draft, even its old one. */}
        <input type="hidden" name="wasSlot" value="" />
        <label className="staff-field">
          <span>{t('schedule.admin.date')}</span>
          <input type="date" name="date" required data-new-date-date="" />
        </label>
        <label className="staff-field">
          <span>{t('schedule.admin.time')}</span>
          <input type="time" name="time" defaultValue={newDate.time ?? ''} data-new-date-time="" />
        </label>
        <label className="staff-field">
          <span>{t('schedule.admin.place')}</span>
          <PlaceSelect venues={newDate.venues} value={newDate.place} />
        </label>
        <p className="staff-quiet">{t('schedule.admin.newDate.note')}</p>
        <p>
          <button type="submit" className="ui-button" data-kind="main" data-new-date-save="">
            {t('schedule.admin.newDate.save')}
          </button>
        </p>
      </fieldset>
    </form>
  );
}
