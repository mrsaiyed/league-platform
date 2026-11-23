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
  /** A day box whose value was not a real day from 2000 to 2100: not asked, and said so. */
  readonly unclear?: readonly ('from' | 'to')[];
};

/** A real day (YYYY-MM-DD) from 2000 to 2100: anything else is not a filter. */
export function isRealDay(text: string | undefined): text is string {
  if (text === undefined || !day.test(text)) return false;
  const [y, m, d] = text.split('-').map(Number);
  if (y === undefined || m === undefined || d === undefined || y < 2000 || y > 2100) return false;
  return new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10) === text;
}

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
  const unclear = (
    [
      ['from', from],
      ['to', to],
    ] as const
  )
    .filter(([, value]) => value !== undefined && value !== '' && !isRealDay(value))
    .map(([name]) => name);
  return {
    ...(who !== undefined && uuid.test(who) ? { who: who.toLowerCase() } : {}),
    ...(isKind(kind) ? { kind } : {}),
    ...(isRealDay(from) ? { from } : {}),
    ...(isRealDay(to) ? { to } : {}),
    ...(before === undefined ? {} : { before }),
    ...(after === undefined ? {} : { after }),
    ...(unclear.length === 0 ? {} : { unclear }),
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

/** The day after a real day (YYYY-MM-DD), for a span that includes its last day. */
export function dayAfter(of: string): string | undefined {
  if (!isRealDay(of)) return undefined;
  const [y, m, d] = of.split('-').map(Number);
  return new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, (d ?? 1) + 1)).toISOString().slice(0, 10);
}

/** The kinds of thing an entry can point at, by the entry's target or details. */
export type LogThingKind =
  | 'team'
  | 'person'
  | 'game'
  | 'season'
  | 'division'
  | 'venue'
  | 'adjustment';
export type LogThingAsk = { readonly kind: LogThingKind; readonly id: string };

/** A thing as it is named now (apps/web's adminAccess.thingsNamed). */
export type LogThingName =
  | {
      readonly kind: 'team' | 'season' | 'division' | 'venue' | 'adjustment';
      readonly id: string;
      /** For an adjustment, its team's name. */
      readonly name: string;
    }
  | {
      readonly kind: 'person';
      readonly id: string;
      readonly firstName: string;
      readonly lastName: string;
    }
  | {
      readonly kind: 'game';
      readonly id: string;
      readonly homeName: string;
      readonly awayName: string;
      readonly startsAt: string | null;
    };

const targetKinds: readonly string[] = ['team', 'person', 'game', 'season', 'division', 'venue'];

/** What the entry points at, to be named: a standings adjustment by its team. */
export function thingOf(entry: ActivityRecord): LogThingAsk | undefined {
  const team = entry.details['team'];
  const adjustment = entry.details['adjustment'];
  if (entry.action === 'standings.add_adjustment' && typeof team === 'string') {
    return { kind: 'team', id: team };
  }
  if (entry.action === 'standings.remove_adjustment' && typeof adjustment === 'string') {
    return { kind: 'adjustment', id: adjustment };
  }
  const type = entry.targetType;
  if (type === null || entry.targetId === null || !targetKinds.includes(type)) return undefined;
  return { kind: type as LogThingKind, id: entry.targetId };
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
  /** A publish that removed games, while one of its season's removed games is in the bin. */
  readonly gamesInBin?: true;
  /** What the entry points at, to be named in its sentence when it can still be found. */
  readonly thing?: LogThingAsk;
};

/** An entry as the page draws it; `binned` is the ids of what is in the bin now. */
export function logLineOf(
  entry: ActivityRecord,
  binned: ReadonlySet<string>,
  /** The seasons with a removed game in the bin (a publish's removals lead there). */
  gameSeasonsInBin: ReadonlySet<string> = new Set(),
): LogLine {
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(entry.details)) {
    if (value !== null) values[key] = String(value);
  }
  const reason = entry.details['reason'];
  const status = entry.details['status'];
  const removal = removals.has(entry.action);
  const target = entry.targetId;
  const thing = thingOf(entry);
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
    ...(entry.action === 'scheduling.publish_schedule' &&
    Number(entry.details['gamesRemoved'] ?? 0) > 0 &&
    target !== null &&
    gameSeasonsInBin.has(target)
      ? { gamesInBin: true as const }
      : {}),
    ...(thing === undefined ? {} : { thing }),
  };
}
