// Undoes an applied fixtures import (O-4): takes exactly the games it added out of the
// season's schedule draft, while nothing has changed the draft since. If the draft was
// edited, published or discarded after the import, nothing is touched and the admin is told
// to remove the games by hand: removing exactly what the import created is only certain
// while the draft is as the import left it.
import { z } from 'zod';
import { defineCommand, fail, ok, type Result } from '../../command/index.ts';
import { recordActivity } from '../access/index.ts';
import { parseDraftDocument } from '../scheduling/index.ts';
import { parseCreatedFixtures } from './import-documents.ts';
import { mayImportInto } from './policy.ts';
import type { ImportsTx } from './ports.ts';

export type UndoFixtureImportError = {
  readonly code:
    | 'import-not-found'
    | 'changed-since-read'
    | 'not-applied'
    | 'record-unreadable'
    | 'draft-changed';
};

export const undoFixtureImport = defineCommand({
  name: 'imports.undo_fixture_import',
  permission: 'schedule.import',
  input: z.object({ importId: z.uuid(), version: z.number().int().positive() }),
  allowed: async (context, input, tx: ImportsTx) => {
    const found = await tx.imports.find(input.importId);
    return mayImportInto(context, tx, 'schedule.import', found?.seasonId ?? null);
  },
  run: async ({
    context,
    input,
    tx,
  }): Promise<Result<{ gamesRemoved: number }, UndoFixtureImportError>> => {
    const found = await tx.imports.find(input.importId);
    if (found === undefined || found.kind !== 'fixtures' || found.seasonId === null) {
      return fail({ code: 'import-not-found' });
    }
    if (found.version !== input.version) return fail({ code: 'changed-since-read' });
    if (found.status !== 'applied') return fail({ code: 'not-applied' });
    const created = parseCreatedFixtures(found.created);
    if (created === undefined) return fail({ code: 'record-unreadable' });

    const store = tx.scheduling;
    const draft = await store.findDraft(found.seasonId);
    if (
      draft === undefined ||
      draft.id !== created.draftId ||
      draft.version !== created.draftVersion
    ) {
      return fail({ code: 'draft-changed' });
    }
    const document = parseDraftDocument(draft.changes);
    if (
      document === undefined ||
      document.changes.length !== created.changesBefore + created.changesAdded
    ) {
      return fail({ code: 'draft-changed' });
    }

    const kept = { version: 1 as const, changes: document.changes.slice(0, created.changesBefore) };
    if (created.draftStarted && kept.changes.length === 0) {
      if (!(await store.deleteDraft(found.seasonId, draft.id, draft.version))) {
        return fail({ code: 'draft-changed' });
      }
    } else if (
      (await store.updateDraft(found.seasonId, draft.id, kept, draft.version)) === undefined
    ) {
      return fail({ code: 'draft-changed' });
    }
    if ((await tx.imports.save(found.id, { status: 'undone' }, found.version)) === undefined) {
      return fail({ code: 'changed-since-read' });
    }
    await recordActivity(tx, context, {
      action: 'imports.undo_fixture_import',
      target: { type: 'import', id: found.id },
      details: { games: created.changesAdded },
    });
    return ok({ gamesRemoved: created.changesAdded });
  },
});
