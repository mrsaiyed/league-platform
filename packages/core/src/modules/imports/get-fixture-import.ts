// Shows an import for the preview and the result (P7 §4 "Also"): where it stands, the
// problems in plain words and what it will add or did add. The uploaded text is never
// returned, even while it is still being read (T-80).
import { z } from 'zod';
import { defineCommand, fail, ok, type Result } from '../../command/index.ts';
import { parseCreatedFixtures, parseFixtureReport } from './import-documents.ts';
import { maySeeImport } from './policy.ts';
import type { ImportStatus, ImportsTx } from './ports.ts';
import type { DraftFixture, RowProblem } from './read-fixtures.ts';

export type GetFixtureImportError = { readonly code: 'import-not-found' };

/** How many games the preview lists; the rest are counted. */
export const previewGameLimit = 100;

export type FixtureImportView = {
  readonly id: string;
  readonly seasonId: string;
  readonly status: ImportStatus;
  readonly fileName: string | null;
  readonly version: number;
  readonly appliedAt: string | null;
  readonly undoneAt: string | null;
  /** Why the whole file was refused, or null. */
  readonly fileProblem: string | null;
  readonly rowsRead: number;
  readonly columnsFound: readonly string[];
  readonly gameCount: number;
  readonly scoreCount: number;
  readonly games: readonly DraftFixture[];
  readonly problems: readonly RowProblem[];
  readonly omittedProblems: number;
  readonly problemsNote: string | null;
  readonly warnings: readonly RowProblem[];
  /** Once applied: scores recorded so far and still waiting for publication. */
  readonly scoresRecorded: number;
  readonly scoresWaiting: number;
};

export const getFixtureImport = defineCommand({
  name: 'imports.get_fixture_import',
  permission: 'schedule.import',
  input: z.object({ importId: z.uuid() }),
  allowed: async (context, input, tx: ImportsTx) => {
    const found = await tx.imports.find(input.importId);
    return maySeeImport(context, tx, found?.seasonId ?? null);
  },
  run: async ({ input, tx }): Promise<Result<FixtureImportView, GetFixtureImportError>> => {
    const found = await tx.imports.find(input.importId);
    if (found === undefined || found.kind !== 'fixtures' || found.seasonId === null) {
      return fail({ code: 'import-not-found' });
    }
    const report = parseFixtureReport(found.report);
    const created = parseCreatedFixtures(found.created);
    return ok({
      id: found.id,
      seasonId: found.seasonId,
      status: found.status,
      fileName: found.fileName,
      version: found.version,
      appliedAt: found.appliedAt,
      undoneAt: found.undoneAt,
      fileProblem: report?.fileProblem ?? null,
      rowsRead: report?.rowsRead ?? 0,
      columnsFound: report?.columnsFound ?? [],
      gameCount: report?.fixtures.length ?? 0,
      scoreCount: report?.fixtures.filter((f) => f.finalScore !== null).length ?? 0,
      games: report?.fixtures.slice(0, previewGameLimit) ?? [],
      problems: report?.problems ?? [],
      omittedProblems: report?.omittedProblems ?? 0,
      problemsNote: report?.problemsNote ?? null,
      warnings: report?.warnings ?? [],
      scoresRecorded: created?.scores.filter((s) => s.recorded).length ?? 0,
      scoresWaiting: created?.scores.filter((s) => !s.recorded).length ?? 0,
    });
  },
});
