// Gives up on an import that is stuck `reading` (T-80): the uploaded text is replaced by an
// empty failed report, so the file does not stay in the row if the worker never reads it. An
// import already read, applied or undone is left as it is.
import { z } from 'zod';
import { defineCommand, fail, ok, type Result } from '../../command/index.ts';
import { recordActivity } from '../access/index.ts';
import { mayImportInto } from './policy.ts';
import type { ImportsTx } from './ports.ts';
import { discardUnreadImport } from './read-fixture-import.ts';

export type DiscardFixtureImportError = { readonly code: 'import-not-found' | 'not-reading' };

export const discardFixtureImport = defineCommand({
  name: 'imports.discard_fixture_import',
  permission: 'schedule.import',
  input: z.object({ importId: z.uuid() }),
  allowed: async (context, input, tx: ImportsTx) => {
    const found = await tx.imports.find(input.importId);
    return mayImportInto(context, tx, 'schedule.import', found?.seasonId ?? null);
  },
  run: async ({
    context,
    input,
    tx,
  }): Promise<Result<Record<string, never>, DiscardFixtureImportError>> => {
    const found = await tx.imports.find(input.importId);
    if (found === undefined || found.kind !== 'fixtures') return fail({ code: 'import-not-found' });
    if (!(await discardUnreadImport(tx, found.id))) return fail({ code: 'not-reading' });
    await recordActivity(tx, context, {
      action: 'imports.discard_fixture_import',
      target: { type: 'import', id: found.id },
    });
    return ok({});
  },
});
