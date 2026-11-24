// The teams module's half of "an archived season is read-only" (O-12, step 2.130,
// T-377): every team and roster change names one of these, and the command framework
// refuses it with `season-archived`. A team or entry that is not there is not refused
// here: the command's own not-found answer stands.
import type { TeamsStore } from './ports.ts';

type ArchiveReader = {
  readonly teams: Pick<TeamsStore, 'find' | 'findRosterEntry' | 'seasonArchived'>;
};

export async function seasonArchivedForTeams(
  input: { readonly seasonId: string },
  tx: ArchiveReader,
): Promise<boolean> {
  return tx.teams.seasonArchived(input.seasonId);
}

export async function teamInArchivedSeason(
  input: { readonly teamId: string },
  tx: ArchiveReader,
): Promise<boolean> {
  const team = await tx.teams.find(input.teamId);
  return team !== undefined && (await tx.teams.seasonArchived(team.seasonId));
}

export async function entryInArchivedSeason(
  input: { readonly rosterEntryId: string },
  tx: ArchiveReader,
): Promise<boolean> {
  const entry = await tx.teams.findRosterEntry(input.rosterEntryId);
  return entry !== undefined && teamInArchivedSeason({ teamId: entry.teamId }, tx);
}
