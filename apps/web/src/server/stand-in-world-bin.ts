// The made-up world's bin, as far as a screen uses it (step 2.50): a person taken off the
// league list is put back on it from the notice that says they were removed (A-5: one
// wrong tap has its way back). Only a person is found and brought back here; the rest of
// the bin (its list, teams, games, the nightly purge) is not on the stand-in yet and says
// so if asked. A person comes back as they were: the row was only marked, never changed,
// and taking someone off the list needs them on no roster, so they are on none.
import type { BinStore } from '@srleagues/core';
import { replacedAt } from './stand-in-world-rows.ts';
import type { LeagueWorld } from './stand-in-world-state.ts';

const notYet = (name: string) => async (): Promise<never> => {
  throw new Error(`Not on the stand-in yet: ${name}.`);
};

export function worldBinStore(s: LeagueWorld): BinStore {
  return {
    list: notYet('bin.list'),
    seasonProgramId: notYet('bin.seasonProgramId'),
    findTeam: notYet('bin.findTeam'),
    findPerson: async (personId) => {
      const found = s.people.find((p) => p.id === personId);
      return found === undefined ? undefined : { binned: found.binned };
    },
    findGame: notYet('bin.findGame'),
    restoreTeam: notYet('bin.restoreTeam'),
    restorePerson: async (personId) => {
      const at = s.people.findIndex((p) => p.id === personId);
      const found = s.people[at];
      if (found === undefined) return false;
      if (found.binned) {
        s.people = replacedAt(s.people, at, {
          ...found,
          binned: false,
          version: found.version + 1,
        });
      }
      return true;
    },
    restoreGame: notYet('bin.restoreGame'),
    purge: notYet('bin.purge'),
  };
}
