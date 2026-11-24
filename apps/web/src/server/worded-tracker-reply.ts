// The tracker's reply as it goes out (step 2.241, T-187): the games module refuses a play
// of a statistic the season does not keep with its code and the statistic as plain data
// (`notKept`); the sentence the tracker lists it with is worded here, from the message
// files, for every tracker, an older one that reads the refusal as a game rule included.
import type { CommandReply } from '@srleagues/contracts';
import type { TrackerCommandsApplied } from '@srleagues/core';
import { t, type TextKey } from './messages.ts';

const notKeptWords: Readonly<Record<string, TextKey>> = {
  turnovers: 'tracker.refused.notKept.turnovers',
};

/** The reply in the protocol's shape, each refusal for a statistic not kept worded. */
export function wordedTrackerReply({ notKept, ...reply }: TrackerCommandsApplied): CommandReply {
  if (notKept === undefined) return reply;
  return {
    ...reply,
    results: reply.results.map((result) => {
      const statistic = Object.hasOwn(notKept, result.commandId)
        ? notKept[result.commandId]
        : undefined;
      if (result.status !== 'refused' || statistic === undefined) return result;
      const key = notKeptWords[statistic] ?? 'tracker.refused.notKept.other';
      return { ...result, reason: { ...result.reason, message: t(key) } };
    }),
  };
}
