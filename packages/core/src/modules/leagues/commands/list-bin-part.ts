// The part of the bin the acting person may bring back (A-5, step 2.77, T-308): whoever
// may remove a kind of thing may restore it, so a scheduler, a registrar or an admin
// limited to one program must be able to FIND what they may restore. Each thing is shown
// when its own restore would allow this person: a team with `teams.manage`, a game with
// `schedule.publish`, a division with `bin.restore`, each at its season's program; a
// person with `people.manage`, a venue or court with `venues.manage`, league-wide. The
// owner and admins see the whole bin, as `leagues.list_bin` gives it. `kinds` says which
// kinds this person may restore anywhere, so the screen refuses someone who may restore
// nothing. Changes nothing; allowed in any state of the league, as the whole list is.
import { z } from 'zod';
import {
  accessOfAccount,
  allows,
  leagueScope,
  type Permission,
  type Scope,
} from '../../access/index.ts';
import { defineCommand, ok, type Result } from '../../../command/index.ts';
import { binSeasonScope } from '../bin-policy.ts';
import { binKeepDays, removedForGoodAt, type BinKind, type BinTx } from '../bin.ts';
import type { BinList } from './list-bin.ts';

export type BinPart = BinList & { readonly kinds: readonly BinKind[] };

/** What each kind's restore needs (the restore commands name the same). */
const restoreNeeds: Readonly<Record<BinKind, Permission>> = {
  team: 'teams.manage',
  division: 'bin.restore',
  game: 'schedule.publish',
  person: 'people.manage',
  venue: 'venues.manage',
  court: 'venues.manage',
};

/** Things of a season are restored at its program; the rest league-wide. */
const bySeason: ReadonlySet<BinKind> = new Set<BinKind>(['team', 'division', 'game']);

export const listBinPart = defineCommand({
  name: 'leagues.list_bin_part',
  permission: 'signed-in',
  input: z.object({}),
  allowed: async (context, _input, tx: BinTx) =>
    context.accountId !== null && (await tx.access.ownerAccountId()) !== undefined,
  run: async ({ context, tx }): Promise<Result<BinPart, never>> => {
    const holder =
      context.accountId === null ? undefined : await accessOfAccount(tx, context.accountId);
    const kinds = (Object.keys(restoreNeeds) as BinKind[]).filter(
      (kind) =>
        holder !== undefined &&
        (holder.isOwner ||
          holder.grants.some(
            (grant) =>
              grant.revokedAt === null &&
              allows(holder, restoreNeeds[kind], grant.scope) &&
              (bySeason.has(kind) || grant.scope.type === 'league'),
          )),
    );
    const scopes = new Map<string, Scope>();
    const scopeOf = async (seasonId: string): Promise<Scope> => {
      const known = scopes.get(seasonId);
      if (known !== undefined) return known;
      const found = await binSeasonScope(tx, seasonId);
      scopes.set(seasonId, found);
      return found;
    };
    const items = [];
    for (const item of await tx.bin.list()) {
      if (holder === undefined || !kinds.includes(item.kind)) continue;
      const scope =
        bySeason.has(item.kind) && item.seasonId !== null
          ? await scopeOf(item.seasonId)
          : leagueScope;
      if (!allows(holder, restoreNeeds[item.kind], scope)) continue;
      items.push({
        ...item,
        removedForGoodAt:
          item.kept || item.kind === 'game' ? null : removedForGoodAt(item.binnedAt),
      });
    }
    return ok({ keepDays: binKeepDays, kinds, items });
  },
});
