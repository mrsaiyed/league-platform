// A save sent twice is the same request (T-271, record 067). Every form that saves carries
// a one-time token, made as the form is drawn (requestTokenField). The server keeps the
// answer to each (who sent it, the token and exactly what the form held) for ten minutes:
// a second post of the same form (a double tap, the browser sending it again) waits for
// the first and is given the same answer, so it does nothing more and is never answered
// as if someone else had changed things. The same form with something changed is a new
// request: a person who corrects a refused field and saves again is not given the old
// refusal.
//
// The answers are kept in this server's memory: the web app runs as one server (T-270).
// The commands' own checks (a stale version is refused) still stop a repeat this server
// does not know, as after a restart; the games area also reads such a refusal against the
// game as it is now (run-game-action.ts, run-box-score-action.ts).
import { createHash } from 'node:crypto';

/** The hidden field that carries a form's one-time token. */
export const requestTokenField = 'requestToken';

const tokenShape = /^[0-9a-f-]{16,64}$/i;

/**
 * The key a form's post is known by: who sent it and in which league, as the session says
 * (not the form), its token and what it held (the framework's own `$ACTION…` fields left
 * out). Undefined when it carries no token, so it is not kept.
 */
export function requestKeyOf(
  context: { readonly leagueId: string; readonly accountId: string | null },
  fields: Readonly<Record<string, string | undefined>>,
): string | undefined {
  const token = (fields[requestTokenField] ?? '').trim();
  if (!tokenShape.test(token)) return undefined;
  const held = Object.entries(fields)
    .filter(([name, value]) => !name.startsWith('$ACTION') && value !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return createHash('sha256')
    .update(JSON.stringify([context.leagueId, context.accountId ?? '', held]))
    .digest('hex');
}

export type SameRequests<T> = {
  /**
   * The answer to this request: the first one's, if it was sent before; else run's. With
   * `holds`, a kept answer whose request has finished is given only while `holds` says it is
   * still true (a thing said brought back that is in the bin again): otherwise it runs again.
   */
  readonly once: (
    key: string | undefined,
    run: () => Promise<T>,
    holds?: (answer: T) => Promise<boolean>,
  ) => Promise<T>;
};

export function sameRequests<T>(options: {
  /** How long an answer is kept (ms). */
  readonly keepMs: number;
  /** The most answers kept; the oldest that have come go first, never one still running. */
  readonly most: number;
  readonly now?: () => number;
}): SameRequests<T> {
  const now = options.now ?? Date.now;
  type Entry = { readonly at: number; readonly answer: Promise<T>; running: boolean };
  const kept = new Map<string, Entry>();
  const prune = () => {
    const oldest = now() - options.keepMs;
    for (const [key, entry] of kept) {
      if (kept.size < options.most && entry.at >= oldest) break;
      // A request still running keeps its place: its repeat must wait for it.
      if (!entry.running) kept.delete(key);
    }
  };
  const start = (key: string, run: () => Promise<T>): Promise<T> => {
    kept.delete(key);
    prune();
    const entry: Entry = { at: now(), answer: run(), running: true };
    kept.set(key, entry);
    entry.answer.then(
      () => {
        entry.running = false;
      },
      () => {
        entry.running = false;
        // A request that failed outright (it threw) is not an answer: the next try runs.
        // Only this entry goes; a newer one under the same key stays.
        if (kept.get(key) === entry) kept.delete(key);
      },
    );
    return entry.answer;
  };
  return {
    once: (key, run, holds) => {
      if (key === undefined) return run();
      const found = kept.get(key);
      if (found === undefined || (!found.running && found.at < now() - options.keepMs)) {
        return start(key, run);
      }
      if (found.running || holds === undefined) return found.answer;
      return found.answer.then(async (answer) => {
        if (await holds(answer)) return answer;
        // No longer true: run again, unless another post of it already did meanwhile.
        const current = kept.get(key);
        return current !== undefined && current !== found ? current.answer : start(key, run);
      });
    },
  };
}

const holderKey = '__srleaguesSameRequests';
type Holder = { [holderKey]?: SameRequests<unknown> };

/**
 * This server's answers to saves. Kept on globalThis, not in this module: Next.js may load
 * a file more than once in one process (container.ts). The answers are of every kind of
 * save, so the caller names the kind it reads back: a key holds what its own form held.
 */
export function sameRequestsHere<T>(): SameRequests<T> {
  const holder = globalThis as Holder;
  holder[holderKey] ??= sameRequests<unknown>({ keepMs: 10 * 60_000, most: 5000 });
  const store = holder[holderKey];
  return {
    once: (k, run, holds) =>
      store.once(
        k,
        run,
        holds === undefined ? undefined : (answer) => holds(answer as T),
      ) as Promise<T>,
  };
}
