// What the activity log's screen asks of the log (A-6, step 2.77): entries by one person,
// of one kind of thing, between two moments, a page newer or older than one already shown.
// The kinds are what an admin thinks in (teams, people, games, the schedule, standings,
// settings, who has access), worked out from each entry's command name, so no migration
// and no stored kind: a command's module says its kind, and the few commands that sit in
// another module than the thing they change are named here. The stores filter the same
// way: the database in SQL from `activityMatchOf`, the made-up ones with `pageOfActivity`.
import type { ActivityCursor, ActivityRecord } from './ports.ts';
import type { Scope } from './scopes.ts';

export const activityKinds = [
  'teams',
  'people',
  'games',
  'schedule',
  'standings',
  'settings',
  'access',
] as const;
export type ActivityKind = (typeof activityKinds)[number];

/** Which command names a kind takes: by module, plus some by name, less some by name. */
export type ActivityMatch = {
  readonly modules: readonly string[];
  readonly also: readonly string[];
  readonly except: readonly string[];
};

const binRestores = ['leagues.restore_team', 'leagues.restore_person', 'leagues.restore_game'];
const importedScores = 'imports.record_imported_scores';

const matches: Readonly<Record<ActivityKind, ActivityMatch>> = {
  teams: { modules: ['teams'], also: ['leagues.restore_team'], except: [] },
  people: { modules: ['people'], also: ['leagues.restore_person'], except: [] },
  games: { modules: ['games'], also: ['leagues.restore_game', importedScores], except: [] },
  schedule: {
    modules: ['scheduling', 'imports'],
    // A game back from the bin is a schedule revision too (A-19).
    also: ['leagues.restore_game'],
    except: [importedScores],
  },
  standings: { modules: ['standings'], also: [], except: [] },
  settings: { modules: ['leagues'], also: [], except: binRestores },
  access: { modules: ['access'], also: [], except: [] },
};

export const activityMatchOf = (kind: ActivityKind): ActivityMatch => matches[kind];

export function actionMatches(action: string, match: ActivityMatch): boolean {
  if (match.except.includes(action)) return false;
  return match.also.includes(action) || match.modules.includes(action.split('.')[0] ?? '');
}

/** The kind an entry is listed under; settings for a command no kind names. */
export const activityKindOf = (action: string): ActivityKind =>
  activityKinds.find((kind) => actionMatches(action, matches[kind])) ?? 'settings';

/** Everything but the page size and `before`, which the log's `list` already takes. */
export type ActivitySearch = {
  /** The entries just newer than this one, instead of older than `before`. */
  readonly after?: ActivityCursor;
  readonly actorAccountId?: string;
  readonly match?: ActivityMatch;
  /** From this moment (included) … */
  readonly from?: string;
  /** … to this one (left out). */
  readonly until?: string;
};

const newestFirst = (a: ActivityCursor, b: ActivityCursor) =>
  a.at === b.at ? (a.id < b.id ? 1 : a.id > b.id ? -1 : 0) : a.at < b.at ? 1 : -1;
const instant = (at: string) => new Date(at).getTime();

/**
 * One page of a made-up log, newest first, exactly as the database's query answers it:
 * the `limit` entries just older than `before`, or just newer than `after`.
 */
export function pageOfActivity(
  all: readonly ActivityRecord[],
  limit: number,
  before: ActivityCursor | undefined,
  scope: Scope,
  search: ActivitySearch = {},
): ActivityRecord[] {
  const kept = [...all].sort(newestFirst).filter((entry) => {
    if (
      scope.type !== 'league' &&
      (entry.details['scopeType'] !== scope.type || entry.details['scopeId'] !== scope.id)
    ) {
      return false;
    }
    if (search.actorAccountId !== undefined && entry.actorAccountId !== search.actorAccountId) {
      return false;
    }
    if (search.match !== undefined && !actionMatches(entry.action, search.match)) return false;
    if (search.from !== undefined && instant(entry.at) < instant(search.from)) return false;
    if (search.until !== undefined && instant(entry.at) >= instant(search.until)) return false;
    if (before !== undefined && newestFirst(entry, before) <= 0) return false;
    if (search.after !== undefined && newestFirst(entry, search.after) >= 0) return false;
    return true;
  });
  return search.after === undefined ? kept.slice(0, limit) : kept.slice(-limit);
}
