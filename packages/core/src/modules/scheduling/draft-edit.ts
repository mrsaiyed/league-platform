// What every schedule draft edit shares (P7 §4.3, A-8, A-9): the checks that the edit
// is based on what the admin saw, the one change applied with the clash rules of step
// 2.9, and the draft saved with its version. The commands in ./commands each build one
// change and hand it here.
import { z } from 'zod';
import { recordActivity } from '../access/index.ts';
import { fail, ok, type CommandContext, type Result } from '../../command/index.ts';
import {
  emptyDraft,
  maxDraftBytes,
  parseDraftDocument,
  type DraftDocument,
} from './draft-document.ts';
import type { SchedulingTx } from './ports.ts';
import { applyDraft } from './rules/apply-draft.ts';
import { applyDraftChange } from './rules/apply-change.ts';
import type { ChangeError, Clash, DraftChange, ScheduleSlot } from './rules/schedule-types.ts';

/**
 * What an edit says it was based on: the season, the schedule revision the admin was
 * looking at (null if none was published yet) and the draft's version (null if there was
 * no draft yet) with its id. All must still be current, or the edit is refused.
 */
export const draftBasis = {
  seasonId: z.uuid(),
  basedOnRevision: z.number().int().positive().nullable(),
  version: z.number().int().positive().nullable(),
  /** Which draft the version belongs to (null if there was none): a new draft after a discard is another. */
  draftId: z.uuid().nullable(),
};

export type DraftEditError =
  | {
      readonly code:
        | 'season-not-found'
        /** The draft was saved by someone else since the admin read it, or was discarded. */
        | 'changed-since-read'
        /** A schedule revision was published since: the draft must be read again or discarded. */
        | 'revision-out-of-date'
        | 'draft-unreadable'
        | 'draft-too-large'
        | 'unknown-team'
        | 'unknown-venue'
        | 'unknown-court';
    }
  | { readonly code: 'change-refused'; readonly reason: ChangeError };

export type DraftEditValue = {
  /** The draft's id and version after this edit: what the next edit names. */
  readonly draftId: string;
  readonly version: number;
  readonly basedOnRevision: number | null;
  /** The clashes the edit causes, among the games it touched. */
  readonly clashes: readonly Clash[];
};

/** Venue and court of a slot must be there: a venue not in the bin, and one of its courts by name. */
export async function checkSlotPlace(
  tx: SchedulingTx,
  slot: Pick<ScheduleSlot, 'venueId' | 'court'>,
): Promise<DraftEditError | undefined> {
  if (slot.venueId === null) {
    return slot.court === null ? undefined : { code: 'unknown-court' };
  }
  const venue = await tx.scheduling.findVenue(slot.venueId);
  if (venue === undefined || venue.binned) return { code: 'unknown-venue' };
  if (slot.court === null) return undefined;
  const courts = await tx.scheduling.listCourts(venue.id);
  return courts.some((c) => c.name === slot.court) ? undefined : { code: 'unknown-court' };
}

export async function editDraft(args: {
  context: CommandContext;
  tx: SchedulingTx;
  action: string;
  input: {
    seasonId: string;
    basedOnRevision: number | null;
    version: number | null;
    draftId: string | null;
  };
  change: DraftChange;
  /** Further checks on what the change names, run once the basis is known to be current. */
  check?: () => Promise<DraftEditError | undefined>;
}): Promise<Result<DraftEditValue, DraftEditError>> {
  const { context, tx, input, change } = args;
  const store = tx.scheduling;
  if ((await store.findSeason(input.seasonId)) === undefined) {
    return fail({ code: 'season-not-found' });
  }
  const latest = await store.latestRevision(input.seasonId);
  if (input.basedOnRevision !== latest) return fail({ code: 'revision-out-of-date' });

  const draft = await store.findDraft(input.seasonId);
  let document: DraftDocument = emptyDraft;
  if (draft === undefined) {
    if (input.version !== null || input.draftId !== null) {
      return fail({ code: 'changed-since-read' });
    }
  } else {
    if (input.draftId !== draft.id || input.version !== draft.version) {
      return fail({ code: 'changed-since-read' });
    }
    if (draft.basedOnRevision !== latest) return fail({ code: 'revision-out-of-date' });
    const parsed = parseDraftDocument(draft.changes);
    if (parsed === undefined) return fail({ code: 'draft-unreadable' });
    document = parsed;
  }

  const refused = await args.check?.();
  if (refused !== undefined) return fail(refused);

  // The draft so far is replayed on the published schedule; the new change must fit on it.
  const published = await store.loadSchedule(input.seasonId);
  const sofar = applyDraft(published, document.changes, []).state;
  const applied = applyDraftChange(sofar, change, []);
  if (!applied.ok) return fail({ code: 'change-refused', reason: applied.error });

  const next: DraftDocument = { version: 1, changes: [...document.changes, change] };
  if (new TextEncoder().encode(JSON.stringify(next)).length > maxDraftBytes) {
    return fail({ code: 'draft-too-large' });
  }

  let draftId: string;
  let version: number;
  if (draft === undefined) {
    const inserted = await store.insertDraft(input.seasonId, next, latest);
    if (inserted === 'no-season') return fail({ code: 'season-not-found' });
    if (inserted === 'exists') return fail({ code: 'changed-since-read' });
    ({ id: draftId, version } = inserted);
  } else {
    const saved = await store.updateDraft(input.seasonId, draft.id, next, draft.version);
    if (saved === undefined) return fail({ code: 'changed-since-read' });
    draftId = draft.id;
    version = saved;
  }

  await recordActivity(tx, context, {
    action: args.action,
    target: { type: 'season', id: input.seasonId },
    details: { change: change.kind },
  });
  return ok({ draftId, version, basedOnRevision: latest, clashes: applied.clashes });
}
