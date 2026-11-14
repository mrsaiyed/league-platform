// Starts a fixtures import (P7 §4 "Also", O-4, T-80): the admin's file is checked for size,
// an `imports` row is made in `reading`, and the job that reads it is recorded in the same
// transaction (T-130). The job carries the import's id only (T-131); the file's text rides in
// the row until the worker has read it, then the report replaces it, so the file is never
// kept, never served and never in a job.
import { z } from 'zod';
import { defineCommand, fail, ok, type Result } from '../../command/index.ts';
import { recordActivity } from '../access/index.ts';
import { maxReportBytes } from './import-documents.ts';
import { mayImportInto } from './policy.ts';
import type { ImportsTx } from './ports.ts';
import { importsRunJob } from './read-fixture-import.ts';
import { fixtureFileLimits } from './read-fixtures.ts';

export type StartFixtureImportError = {
  readonly code: 'season-not-found' | 'file-too-large' | 'no-account';
};

export const startFixtureImport = defineCommand({
  name: 'imports.start_fixture_import',
  permission: 'schedule.import',
  input: z.object({
    seasonId: z.uuid(),
    fileName: z.string().trim().min(1).max(255).nullable(),
    /** The file saved as CSV, as text. */
    fileText: z.string().min(1),
  }),
  allowed: (context, input, tx: ImportsTx) =>
    mayImportInto(context, tx, 'schedule.import', input.seasonId),
  run: async ({
    context,
    input,
    tx,
  }): Promise<Result<{ importId: string }, StartFixtureImportError>> => {
    if (context.accountId === null) return fail({ code: 'no-account' });
    if (
      input.fileText.length > fixtureFileLimits.maxCharacters ||
      new TextEncoder().encode(JSON.stringify(input.fileText)).length > maxReportBytes
    ) {
      return fail({ code: 'file-too-large' });
    }
    const started = await tx.imports.insert({
      seasonId: input.seasonId,
      accountId: context.accountId,
      fileName: input.fileName,
      report: { version: 1, upload: input.fileText },
    });
    if (started === 'no-season') return fail({ code: 'season-not-found' });
    await tx.jobs.enqueue({
      type: importsRunJob,
      leagueId: context.leagueId,
      ids: { importId: started.id },
      dedupeKey: started.id,
    });
    await recordActivity(tx, context, {
      action: 'imports.start_fixture_import',
      target: { type: 'import', id: started.id },
    });
    return ok({ importId: started.id });
  },
});
