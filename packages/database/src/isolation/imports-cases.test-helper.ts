// The two-league harness's cases for the fixtures import (step 2.22, T-65): every query in
// ../queries for it and every command of the same step. Imported by
// isolation-cases.test-helper.ts. The seeded season has an applied import (its draft's one
// change, a score waiting for the upcoming game) and a ready one with a single game.
import {
  applyFixtureImport,
  discardFixtureImport,
  getFixtureImport,
  recordImportedScores,
  startFixtureImport,
  undoFixtureImport,
} from '@srleagues/core';
import { findImport, insertImport, listSeasonNames, updateImport } from '../queries/index.ts';
import { harnessTx, registerCommandCase } from './command-cases.test-helper.ts';
import { registerIsolationCase } from './isolation-registry.test-helper.ts';

// Queries -----------------------------------------------------------------------------

registerIsolationCase({
  subject: findImport,
  name: "find the target's applied import",
  run: (scope, target) => findImport(scope, target.importId),
});

registerIsolationCase({
  subject: listSeasonNames,
  name: "list the names the target's season's file may use",
  run: (scope, target) => listSeasonNames(scope, target.seasonId),
});

registerIsolationCase({
  subject: insertImport,
  name: "start an import in the target's season",
  run: (scope, target) =>
    insertImport(scope, {
      seasonId: target.seasonId,
      accountId: target.ownerId,
      fileName: 'fixtures.csv',
      report: { version: 1, upload: 'Date,Home,Away' },
    }),
});

registerIsolationCase({
  subject: updateImport,
  name: "save the target's ready import",
  run: (scope, target) =>
    updateImport(
      scope,
      target.readyImportId,
      {
        status: 'failed',
        report: { version: 1, fileProblem: 'The file is empty.', fixtures: [], problems: [] },
      },
      1,
    ),
});

// Commands ----------------------------------------------------------------------------

registerCommandCase(startFixtureImport, harnessTx, {
  name: "upload a fixtures file for the target's season",
  input: (target) => ({
    seasonId: target.seasonId,
    fileName: 'fixtures.csv',
    fileText: 'Date,Home,Away\n2027-01-02,A,B',
  }),
});

registerCommandCase(applyFixtureImport, harnessTx, {
  name: "apply the target's ready import",
  input: (target) => ({ importId: target.readyImportId, version: 1 }),
});

registerCommandCase(undoFixtureImport, harnessTx, {
  name: "undo the target's applied import",
  input: (target) => ({ importId: target.importId, version: 1 }),
});

registerCommandCase(recordImportedScores, harnessTx, {
  name: "record the scores of the target's applied import",
  input: (target) => ({ importId: target.importId }),
});

registerCommandCase(getFixtureImport, harnessTx, {
  name: "read the target's ready import",
  input: (target) => ({ importId: target.readyImportId }),
});

registerCommandCase(discardFixtureImport, harnessTx, {
  name: "give up on the target's unread import",
  input: (target) => ({ importId: target.readingImportId }),
});
