// What the worker does for `imports.run` (T7 §2, T-137): reads an import's uploaded text once
// with the fixture reader of step 2.10 and replaces it with the report. A job run twice does
// no harm: only an import still `reading` is read, so the second run finds it done and
// changes nothing. The worker acts for nobody (T-226), so this is a function the worker
// calls inside its transaction for the job's league, not a command.
import {
  failedReport,
  maxReportBytes,
  reportDocumentOf,
  uploadedText,
} from './import-documents.ts';
import type { ImportsTx } from './ports.ts';
import { readFixtureSheet } from './read-fixtures.ts';

/** The job type that reads an uploaded import (T7 §2); its ids are `{ importId }`. */
export const importsRunJob = 'imports.run';

export type ReadFixtureImportResult = 'read' | 'nothing-to-do';

export async function readFixtureImport(
  tx: ImportsTx,
  importId: string,
): Promise<ReadFixtureImportResult> {
  const found = await tx.imports.find(importId);
  if (found === undefined || found.kind !== 'fixtures' || found.status !== 'reading') {
    return 'nothing-to-do';
  }
  const text = uploadedText(found.report);
  if (text === undefined || found.seasonId === null) {
    await tx.imports.save(
      found.id,
      { status: 'failed', report: failedReport('The file could not be found. Upload it again.') },
      found.version,
    );
    return 'read';
  }
  const names = await tx.imports.seasonNames(found.seasonId);
  let report = reportDocumentOf(readFixtureSheet(text, names));
  if (new TextEncoder().encode(JSON.stringify(report)).length > maxReportBytes) {
    report = failedReport(
      'This file has too many games to preview at once. Split it into smaller files.',
    );
  }
  const failed = report.fileProblem !== null || report.fixtures.length === 0;
  await tx.imports.save(
    found.id,
    {
      status: failed ? 'failed' : 'ready',
      report,
    },
    found.version,
  );
  return 'read';
}
