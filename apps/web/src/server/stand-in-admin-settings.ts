// THE ADMIN LEAGUE SETTINGS SCREEN'S LOCAL STAND-IN. FOR LOCAL WORK AND TESTS ONLY.
//
// Made-up stored settings held in this process's memory (T-201), one set per league, so
// the League settings screen (step 2.48) can be used with no database. The real settings
// commands run on it, so every rule (who may change a setting, its limits, the version
// check) is the product's own: only the storage is made up. A transaction works on a
// copy that is kept only if the work returns, as the database's does, and transactions
// run one after another.
//
// Gone when the database's leagues store is wired to the web app.
import {
  leagueStatuses,
  type AccessReader,
  type ActivityEntry,
  type CommandDeps,
  type DivisionsStore,
  type LeaguesStore,
  type LeaguesTx,
  type SettingPlace,
} from '@srleagues/core';
import type { AdminSettingsPorts } from './admin-settings.ts';

type Row = {
  readonly place: SettingPlace;
  readonly key: string;
  document: { readonly version: number; readonly value: unknown };
  version: number;
};
type LeagueState = { settings: Row[]; activity: ActivityEntry[] };

export type StandInAdminSettingsOptions = {
  /** What a permission check reads for one league: the league's owner, state and grants. */
  readonly accessOf: (leagueId: string) => AccessReader;
  /** Where the commands' T-196 lines go. */
  readonly log: CommandDeps<LeaguesTx>['log'];
};

/** A store of which only the named parts are made up; any other part is a mistake to call. */
function partial<Store extends object>(name: string, made: Partial<Store>): Store {
  return new Proxy(made as Store, {
    get(target, property, receiver) {
      if (property in target) return Reflect.get(target, property, receiver) as unknown;
      throw new Error(`The settings stand-in has no ${name}.${String(property)}.`);
    },
  });
}

const samePlace = (a: SettingPlace, b: SettingPlace) => JSON.stringify(a) === JSON.stringify(b);

function txOver(leagueId: string, s: LeagueState, access: AccessReader): LeaguesTx {
  const leagues = partial<LeaguesStore>('leagues', {
    // The permission check asks who the league is and whether it may be changed.
    currentLeague: async () => {
      const status = await access.leagueStatus();
      const ownerAccountId = await access.ownerAccountId();
      const known = leagueStatuses.find((candidate) => candidate === status);
      return known === undefined || ownerAccountId === undefined
        ? undefined
        : { id: leagueId, name: '', slug: '', status: known, ownerAccountId, version: 1 };
    },
    isPlatformStaff: async () => false,
    settingRows: async (key, places) =>
      s.settings
        .filter(
          (r) =>
            r.key === key &&
            (r.place.level === 'league' ||
              (r.place.level === 'program' && r.place.programId === places.programId) ||
              (r.place.level === 'season' && r.place.seasonId === places.seasonId)),
        )
        .map((r) => ({ level: r.place.level, document: r.document, version: r.version })),
    writeSetting: async (place, key, document, version) => {
      const row = s.settings.find((r) => r.key === key && samePlace(r.place, place));
      if (row === undefined) {
        if (version !== null) return undefined;
        s.settings.push({ place, key, document, version: 1 });
        return 1;
      }
      if (row.version !== version) return undefined;
      row.document = document;
      row.version += 1;
      return row.version;
    },
    clearSetting: async (place, key, version) => {
      const at = s.settings.findIndex(
        (r) => r.key === key && samePlace(r.place, place) && r.version === version,
      );
      if (at < 0) return false;
      s.settings.splice(at, 1);
      return true;
    },
    // Only the league level is used by this screen: no program or season is in the stand-in.
    findProgram: async () => undefined,
    seasonProgramId: async () => undefined,
  });
  return {
    jobs: { enqueue: async () => undefined },
    leagues,
    divisions: partial<DivisionsStore>('divisions', {}),
    access,
    activity: { record: async (entry) => void s.activity.push(entry), list: async () => [] },
  };
}

export function standInAdminSettings(options: StandInAdminSettingsOptions): AdminSettingsPorts {
  const states = new Map<string, LeagueState>();
  const stateOf = (leagueId: string): LeagueState => {
    let found = states.get(leagueId);
    if (found === undefined) {
      found = { settings: [], activity: [] };
      states.set(leagueId, found);
    }
    return found;
  };

  // One transaction at a time, so two requests cannot overwrite each other's copy.
  let queue: Promise<unknown> = Promise.resolve();
  const serially = <T>(work: () => Promise<T>): Promise<T> => {
    const next = queue.then(work, work);
    queue = next.catch(() => undefined);
    return next;
  };

  const deps: CommandDeps<LeaguesTx> = {
    transaction: (context, work) =>
      serially(async () => {
        const draft = structuredClone(stateOf(context.leagueId));
        const result = await work(
          txOver(context.leagueId, draft, options.accessOf(context.leagueId)),
        );
        states.set(context.leagueId, draft);
        return result;
      }),
    events: [],
    log: options.log,
    now: () => performance.now(),
  };
  return { deps };
}
