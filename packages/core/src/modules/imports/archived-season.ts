// The imports module's half of "an archived season is read-only" (O-12, step 2.130,
// T-377): starting an import into a season, applying it, recording its scores and undoing
// it name one of these, and the command framework refuses them with `season-archived`.
// Discarding an import that was never applied changes no season and stays open.
import type { ImportsStore } from './ports.ts';

type ArchiveReader = { readonly imports: Pick<ImportsStore, 'find' | 'seasonArchived'> };

export async function seasonArchivedForImport(
  input: { readonly seasonId: string },
  tx: ArchiveReader,
): Promise<boolean> {
  return tx.imports.seasonArchived(input.seasonId);
}

export async function importInArchivedSeason(
  input: { readonly importId: string },
  tx: ArchiveReader,
): Promise<boolean> {
  const found = await tx.imports.find(input.importId);
  return (
    found !== undefined && found.seasonId !== null && tx.imports.seasonArchived(found.seasonId)
  );
}
