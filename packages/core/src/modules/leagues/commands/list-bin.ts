// What is in the bin, with the moment each thing goes for good (A-5, T-51), for the bin
// screen. Changes nothing; allowed in a league that is archived or suspended too.
import { z } from 'zod';
import { defineCommand, ok, type Result } from '../../../command/index.ts';
import { maySeeBin } from '../bin-policy.ts';
import { binKeepDays, removedForGoodAt, type BinListing, type BinTx } from '../bin.ts';

export type BinList = { readonly keepDays: number; readonly items: readonly BinListing[] };

export const listBin = defineCommand({
  name: 'leagues.list_bin',
  permission: 'bin.restore',
  input: z.object({}),
  allowed: (context, _input, tx: BinTx) => maySeeBin(context, tx),
  run: async ({ tx }): Promise<Result<BinList, never>> => {
    const items = await tx.bin.list();
    return ok({
      keepDays: binKeepDays,
      items: items.map((item) => ({ ...item, removedForGoodAt: removedForGoodAt(item.binnedAt) })),
    });
  },
});
