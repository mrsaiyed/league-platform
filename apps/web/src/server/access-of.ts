// accessOf (ports.ts) for any storage: runs the access module's myAccess query in
// the command shape, so the stand-in and the database answer through the same code.
import {
  myAccess,
  type AccessHolder,
  type AccessTx,
  type CommandContext,
  type CommandDeps,
} from '@srleagues/core';

export function accessOfVia(
  deps: CommandDeps<AccessTx>,
): (context: CommandContext) => Promise<AccessHolder | undefined> {
  return async (context) => {
    const accountId = context.accountId;
    if (accountId === null) return undefined;
    const result = await myAccess(context, {}, deps);
    // Refused: nobody is signed in, or the league is in the bin or out of sight.
    if (!result.ok) return undefined;
    return { accountId, isOwner: result.value.isOwner, grants: result.value.grants };
  };
}
