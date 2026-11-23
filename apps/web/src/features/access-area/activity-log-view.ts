// The activity log's screen (step 2.77, A-6): what its address asks for, and each entry
// as the lines the page draws: who, what in the activity messages' plain sentence, when,
// why when the entry keeps a reason, whether a season was shown to visitors or hidden
// again, and the way to the bin while a removed thing is still in it. Plain functions,
// tested without a server; the page fills in the words (T-187).
import { activityKinds, type ActivityKind, type ActivityRecord } from '@srleagues/core';

type Query = Readonly<Record<string, string | string[] | undefined>>;
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const day = /^\d{4}-\d{2}-\d{2}$/;
const cursorText = /^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\|([0-9a-f-]{36})$/i;

/** What the screen's address asks for: the filters, and the page older or newer than one. */
export type LogAsked = {
  readonly who?: string;
  readonly kind?: ActivityKind;
  /** Days in the league's time zone, both included. */
  readonly from?: string;
  readonly to?: string;
  readonly before?: { readonly at: string; readonly id: string };
  readonly after?: { readonly at: string; readonly id: string };
};

const isKind = (value: string | undefined): value is ActivityKind =>
  activityKinds.some((kind) => kind === value);

function cursorOf(value: string | undefined) {
  const found = value === undefined ? null : cursorText.exec(value);
  return found === null ? undefined : { at: found[1] ?? '', id: found[2] ?? '' };
}

/** Only what is well formed is kept: anything else is as if it was not asked. */
export function logAskedOf(query: Query): LogAsked {
  const who = one(query['who']);
  const kind = one(query['kind']);
  const from = one(query['from']);
  const to = one(query['to']);
  const before = cursorOf(one(query['before']));
  const after = before === undefined ? cursorOf(one(query['after'])) : undefined;
  return {
    ...(who !== undefined && uuid.test(who) ? { who: who.toLowerCase() } : {}),
    ...(isKind(kind) ? { kind } : {}),
    ...(from !== undefined && day.test(from) ? { from } : {}),
    ...(to !== undefined && day.test(to) ? { to } : {}),
    ...(before === undefined ? {} : { before }),
    ...(after === undefined ? {} : { after }),
  };
}

/** The address's own pairs for the same filters, with a page older or newer than one. */
export function logQueryOf(
  asked: LogAsked,
  page?: { readonly before?: Cursor; readonly after?: Cursor },
): Record<string, string> {
  return {
    ...(asked.who === undefined ? {} : { who: asked.who }),
    ...(asked.kind === undefined ? {} : { kind: asked.kind }),
    ...(asked.from === undefined ? {} : { from: asked.from }),
    ...(asked.to === undefined ? {} : { to: asked.to }),
    ...(page?.before === undefined ? {} : { before: `${page.before.at}|${page.before.id}` }),
    ...(page?.after === undefined ? {} : { after: `${page.after.at}|${page.after.id}` }),
  };
}
type Cursor = { readonly at: string; readonly id: string };

/** The day after a day (YYYY-MM-DD), for a span that includes its last day. */
export function dayAfter(of: string): string {
  const [y, m, d] = of.split('-').map(Number);
  return new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, (d ?? 1) + 1)).toISOString().slice(0, 10);
}

/** The entries that moved one thing, their target, to the bin. */
const removals = new Set(['teams.remove_team', 'people.remove_person']);

export type LogLine = {
  readonly id: string;
  readonly at: string;
  /** null: nobody, the league's own nightly work (T-51). */
  readonly actorAccountId: string | null;
  /** The message key of what was done, and the values its sentence takes. */
  readonly summary: string;
  readonly values: Readonly<Record<string, string>>;
  /** The reason the person gave, when the entry keeps one. */
  readonly reason?: string;
  /** A season's status it was given: shown to visitors, or hidden from them again. */
  readonly seasonStatus?: string;
  /** The removed thing's id, while it is still in the bin. */
  readonly inBin?: string;
};

/** An entry as the page draws it; `binned` is the ids of what is in the bin now. */
export function logLineOf(entry: ActivityRecord, binned: ReadonlySet<string>): LogLine {
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(entry.details)) {
    if (value !== null) values[key] = String(value);
  }
  const reason = entry.details['reason'];
  const status = entry.details['status'];
  const removal = removals.has(entry.action);
  const target = entry.targetId;
  return {
    id: entry.id,
    at: entry.at,
    actorAccountId: entry.actorAccountId,
    summary: entry.summary,
    values,
    ...(typeof reason === 'string' && reason.trim() !== '' ? { reason } : {}),
    ...(entry.action === 'leagues.update_season' && typeof status === 'string'
      ? { seasonStatus: status }
      : {}),
    ...(removal && target !== null && binned.has(target) ? { inBin: target } : {}),
  };
}
