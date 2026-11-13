// The two-league harness's cases for seasons and their rules (step 2.15, T-65): every
// query added for them and every command of the same step. Imported by
// isolation-cases.test-helper.ts, which registers the rest.
import { defaultSeasonRules } from '@srleagues/contracts';
import {
  getSeason,
  setSeasonRosterSettings,
  setSeasonRules,
  updateSeason as updateSeasonCommand,
} from '@srleagues/core';
import { countPrograms, findSeason, updateSeason } from '../queries/index.ts';
import { harnessTx, registerCommandCase } from './command-cases.test-helper.ts';
import { registerIsolationCase } from './isolation-registry.test-helper.ts';

registerIsolationCase({
  subject: findSeason,
  name: "find the target's season",
  run: (scope, target) => findSeason(scope, target.seasonId),
});

registerIsolationCase({
  subject: updateSeason,
  name: "rename the target's season",
  run: (scope, target) => updateSeason(scope, target.seasonId, { name: 'Harness renamed' }, 1),
});

registerIsolationCase({
  subject: countPrograms,
  name: "count the scope's programs",
  run: (scope) => countPrograms(scope),
});

registerCommandCase(getSeason, harnessTx, {
  name: "see the target's season",
  input: (target) => ({ seasonId: target.seasonId }),
});

registerCommandCase(updateSeasonCommand, harnessTx, {
  name: "rename the target's season",
  input: (target) => ({ seasonId: target.seasonId, version: 1, name: 'Harness renamed' }),
});

registerCommandCase(setSeasonRules, harnessTx, {
  name: "set the target's season's rules",
  input: (target) => ({
    seasonId: target.seasonId,
    version: 1,
    rules: defaultSeasonRules(),
  }),
});

registerCommandCase(setSeasonRosterSettings, harnessTx, {
  name: "switch on unique jerseys in the target's season",
  input: (target) => ({ seasonId: target.seasonId, version: 1, uniqueJerseys: true }),
});
