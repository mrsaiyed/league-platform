// A league's state as the leagues table holds it, checked against core's list of
// states (the table's own check allows only those).
import { leagueStatuses, type LeagueStatus } from '@srleagues/core';

export function leagueStatusOf(value: string): LeagueStatus {
  const status = leagueStatuses.find((known) => known === value);
  if (status === undefined) {
    throw new Error('A league has a state the leagues table does not allow.');
  }
  return status;
}
