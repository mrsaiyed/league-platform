// The cases the two-league harness runs (T-65): every query in ../queries, and from
// step 1.10 every command. Importing this file registers them.
import { findProgramBySlug, listPrograms } from '../queries/index.ts';
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
