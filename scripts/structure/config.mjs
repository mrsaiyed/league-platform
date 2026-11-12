// What the structure checks enforce. Each entry points at the spec rule it comes
// from (docs/specs/v1/technical/T2-repo-and-code-structure.md, T9 §3). When the
// spec changes, change this file in the same change.

/**
 * T-21: which workspaces each workspace may import. Keys and values are workspace
 * folders. `*` means every package (only the two apps, which wire everything).
 * A workspace that is not listed here fails the check until it is given a row.
 */
export const allowedDependencies = {
  'packages/contracts': [],
  'packages/sports': ['packages/contracts'],
  'packages/core': ['packages/contracts', 'packages/sports'],
  'packages/database': [
    'packages/core',
    'packages/contracts',
    'packages/sports',
    'packages/observability',
  ],
  'packages/providers': ['packages/core', 'packages/contracts', 'packages/observability'],
  'packages/ui': [],
  'packages/site': ['packages/contracts', 'packages/ui'],
  'packages/emails': ['packages/contracts', 'packages/ui'],
  'packages/observability': ['packages/contracts'],
  'apps/web': ['*'],
  'apps/worker': ['*'],
};

/**
 * T-21 and the T2 §2 table: outside libraries the pure layers may use. Workspaces
 * not listed may use any library. Node built-ins count as outside libraries here:
 * core gets clocks, ids, files and network through its ports.
 */
export const allowedLibraries = {
  'packages/contracts': ['zod'],
  'packages/sports': [],
  'packages/core': ['zod'],
};

/**
 * Extra libraries tests may use in a pure layer, beside Node built-ins. Tests are
 * `*.test.ts`, `*.spec.ts`, `*.test-helper.ts` and files in a `testing/` folder.
 * `@scope/*` covers a whole scope.
 */
export const testLibraries = ['vitest', '@vitest/*', 'fast-check'];

/** Workspaces where React and JSX files are not allowed (T2 §2: core has no React). */
export const noJsxWorkspaces = ['packages/contracts', 'packages/sports', 'packages/core'];

/** T-22: folders whose sub-folders are modules, each used only through its own index.ts. */
export const moduleRoots = ['packages/core/src/modules'];

/**
 * Files from before stage 1 that break T-22 or T-27 (they import other packages by
 * path, and store.ts names the Al-Hadi team). Only those two rules are waived; the
 * others still apply and pass. A test fails if a listed file stops breaking a rule,
 * so the list only shrinks: remove a file when it is rewritten, never add one.
 */
export const legacyFiles = [
  'packages/database/src/live-stats/postgres.ts',
  'packages/database/src/live-stats/repository.ts',
  'packages/database/src/varsity/store.ts',
  'packages/sports/src/basketball/scorer.ts',
];

/** Folders outside the workspaces that are also scanned (T2 §1: migrations and seed). */
export const extraRoots = ['supabase'];

/** Folders never scanned: installed or generated files. */
export const skippedFolders = [
  'node_modules',
  'dist',
  'build',
  'coverage',
  'out',
  '.next',
  '.turbo',
  '.vinext',
  '.wrangler',
];

/**
 * T-27: leagues we know by name. A hyphen means "an optional separator here", so
 * `al-hadi` also catches `alhadi`, `al_hadi`, `Al Hadi` and `AlHadi`. Matching
 * ignores case and looks inside identifiers too (`isFarajLeague`).
 */
export const knownLeagueNames = ['faraj', 'al-hadi', 'tcsaal'];

/** T-27: where made-up or reference data may name a league (T2 §1, T9 §11). */
export const leagueNamesAllowedIn = ['supabase/seed/', '/seed/', '/fixtures/', '/__fixtures__/'];

/** SQL may be written only here (T2 §1–2). */
export const sqlAllowedIn = ['packages/database/', 'supabase/'];

/** Database drivers and query builders: importing one is writing SQL. */
export const databaseLibraries = [
  'pg',
  'postgres',
  '@electric-sql/pglite',
  '@electric-sql/pglite-socket',
  '@neondatabase/serverless',
  '@vercel/postgres',
  'drizzle-orm',
  'kysely',
  'knex',
  '@prisma/client',
  'pg-promise',
  'slonik',
  'typeorm',
  'sequelize',
  'better-sqlite3',
  'sqlite3',
  'mysql2',
];

/**
 * T-34: the only files that may put a league into an address by hand: the one
 * address helper and the one place that reads the league from a request. Neither
 * exists yet; the step that writes them puts them at these paths or updates this list.
 */
export const addressHelperFiles = [
  'packages/core/src/modules/leagues/rules/league-url.ts',
  'packages/core/src/modules/leagues/rules/league-url.test.ts',
  'apps/web/src/server/context.ts',
  'apps/web/src/server/context.test.ts',
];

/**
 * T-30 and the T2 §2 table: workspaces that never read settings or secrets. Core
 * and sports get everything through their inputs; contracts must never read them.
 */
export const noSettingsWorkspaces = [
  'packages/contracts',
  'packages/sports',
  'packages/core',
  'packages/ui',
  'packages/site',
];

/** T-30: workspaces whose every file may end up in the browser. */
export const browserWorkspaces = ['packages/ui', 'packages/site'];

/** T-30: folders inside the apps whose files are served to the browser as they are. */
export const browserFolders = ['apps/web/public/'];

/** T-30: workspaces that hold server-only code and must never be imported by browser code. */
export const serverOnlyWorkspaces = ['packages/database', 'packages/providers'];
