// When each open question was first asked (step 2.221; record 094 [placeholder number]),
// kept on the server with the asking form's one-time token. A question's "Yes" is taken
// only once it has been read for long enough (call-off-step.ts); the time it is measured
// from is this one, never a field of the form: a hand-made post with an old time is asked
// again like any other, and a "Yes" tapped too soon asks again from the FIRST time, so the
// wait never starts again.
//
// Kept in this server's memory, as the answers to saves are (same-request.ts; the web app
// runs as one server, T-270). After a restart a question's "Yes" asks once more.
import { createHash } from 'node:crypto';
import { requestTokenField } from './same-request.ts';

const tokenShape = /^[0-9a-f-]{16,64}$/i;

/**
 * The key a question is known by: who asked and in which league, as the session says (not
 * the form), the asking form's one-time token, the game and the change. Undefined when the
 * post carries no token: such a question is never taken as read.
 */
export function questionKeyOf(
  context: { readonly leagueId: string; readonly accountId: string | null },
  fields: Readonly<Record<string, string | undefined>>,
): string | undefined {
  const token = (fields[requestTokenField] ?? '').trim();
  if (!tokenShape.test(token)) return undefined;
  return createHash('sha256')
    .update(
      JSON.stringify([
        context.leagueId,
        context.accountId ?? '',
        token,
        fields['gameId'] ?? '',
        fields['act'] ?? '',
      ]),
    )
    .digest('hex');
}

export type QuestionTimes = {
  /** The time kept for this question, if it is still kept. */
  readonly of: (key: string | undefined) => number | undefined;
  /** Keeps the time this question was asked. */
  readonly keep: (key: string | undefined, at: number) => void;
  /** Forgets the question: answered "No", or its change ran. */
  readonly forget: (key: string | undefined) => void;
};

export function questionTimes(options: {
  /** How long a question's time is kept (ms). */
  readonly keepMs: number;
  /** The most kept; the oldest go first. */
  readonly most: number;
  readonly now?: () => number;
}): QuestionTimes {
  const now = options.now ?? Date.now;
  const kept = new Map<string, number>();
  const prune = () => {
    const oldest = now() - options.keepMs;
    for (const [key, at] of kept) {
      if (kept.size < options.most && at >= oldest) break;
      kept.delete(key);
    }
  };
  return {
    of: (key) => {
      if (key === undefined) return undefined;
      const at = kept.get(key);
      return at !== undefined && at >= now() - options.keepMs ? at : undefined;
    },
    keep: (key, at) => {
      if (key === undefined) return;
      // Kept newest last, so the oldest are pruned first.
      kept.delete(key);
      prune();
      kept.set(key, at);
    },
    forget: (key) => {
      if (key !== undefined) kept.delete(key);
    },
  };
}

const holderKey = '__srleaguesQuestionTimes';
type Holder = { [holderKey]?: QuestionTimes };

/** This server's open questions. On globalThis: Next.js may load a file more than once. */
export function questionTimesHere(): QuestionTimes {
  const holder = globalThis as Holder;
  holder[holderKey] ??= questionTimes({ keepMs: 60 * 60_000, most: 5000 });
  return holder[holderKey];
}
