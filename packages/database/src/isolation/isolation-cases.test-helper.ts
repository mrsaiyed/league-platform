// The cases the two-league harness runs (T-65): every query in ../queries and every
// command in core's registry. Importing this file registers them.
import { setLeagueName } from '@srleagues/core';
import {
  findCurrentLeague,
  findProgramBySlug,
  listPrograms,
  updateLeagueName,
} from '../queries/index.ts';
import { harnessTx, registerCommandCase } from './command-cases.test-helper.ts';
import { registerIsolationCase } from './isolation-registry.test-helper.ts';

registerIsolationCase({
  subject: listPrograms,
  name: 'list the programs',
  run: (scope) => listPrograms(scope),
});

registerIsolationCase({
  subject: findProgramBySlug,
  name: "find by a short name only the target's program has",
  run: (scope, target) => findProgramBySlug(scope, target.programSlug),
});

registerIsolationCase({
  subject: findProgramBySlug,
  name: 'find by a short name both leagues use (the default program)',
  run: (scope) => findProgramBySlug(scope, 'main'),
});

registerIsolationCase({
  subject: findCurrentLeague,
  name: "read the scope's league",
  run: (scope) => findCurrentLeague(scope),
});

registerIsolationCase({
  subject: updateLeagueName,
  name: "rename the scope's league",
  run: (scope) => updateLeagueName(scope, 'Renamed by the harness', 1),
});

// Commands -----------------------------------------------------------------------

registerCommandCase(setLeagueName, harnessTx, {
  name: "set the league's name as its owner",
  input: () => ({ name: 'Renamed by the harness', version: 1 }),
});
