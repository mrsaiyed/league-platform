// Each structure check (scripts/structure) is proven two ways: it catches a
// violation planted in a throwaway repository (and nothing else fires), and the
// real repository passes. Every fixture runs all six checks, so a false positive
// from any rule fails the test that planted something else.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkStructure, report } from '../scripts/structure/index.mjs';
import { legacyFiles } from '../scripts/structure/config.mjs';
import { lex } from '../scripts/structure/source.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspaces = [
  'apps/web',
  'apps/worker',
  'packages/contracts',
  'packages/sports',
  'packages/core',
  'packages/database',
  'packages/providers',
  'packages/ui',
  'packages/site',
  'packages/emails',
  'packages/observability',
];

/** A repository with every workspace (each with package.json and index.ts) plus `files`. */
function fixture(t, files, { extraWorkspaces = [], skipIndex = [], rootWorkspaces } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'structure-check-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  };
  const all = [...workspaces, ...extraWorkspaces];
  write(
    'package.json',
    JSON.stringify({ name: 'fixture', private: true, workspaces: rootWorkspaces ?? all }),
  );
  for (const dir of all) {
    const pkg = { name: '@srleagues/' + path.basename(dir), exports: { '.': './index.ts' } };
    write(dir + '/package.json', JSON.stringify(pkg));
    if (!skipIndex.includes(dir)) write(dir + '/index.ts', 'export {};\n');
  }
  for (const [rel, text] of Object.entries(files)) write(rel, text);
  return root;
}

/** Every violation of every rule, as "file:line [rule] message". */
function found(t, files, options) {
  return checkStructure(fixture(t, files, options)).violations.map(
    (v) => `${v.file}:${v.line} [${v.rule}] ${v.message}`,
  );
}

/** The violations are exactly `expected` ("file:line [rule]"), each with its message fragment. */
function assertExactly(list, expected) {
  const keys = list.map((line) => line.slice(0, line.indexOf(']') + 1));
  assert.deepEqual(
    [...keys].sort(),
    expected.map(([key]) => key).sort(),
    `violations were:\n${list.join('\n') || '(none)'}`,
  );
  for (const [key, fragment] of expected) {
    if (!fragment) continue;
    assert.ok(
      list.some((line) => line.startsWith(key) && line.includes(fragment)),
      `expected ${key} to mention "${fragment}", got:\n${list.join('\n')}`,
    );
  }
}

test('the real repository passes every structure check', () => {
  const { violations, fileCount } = checkStructure(repoRoot);
  assert.deepEqual(violations, []);
  assert.ok(fileCount > 10);
});

test('every legacy exemption is still needed', () => {
  const { violations } = checkStructure(repoRoot, { config: { legacyFiles: [] } });
  const failing = new Set(violations.map((v) => v.file));
  for (const file of legacyFiles) {
    assert.ok(failing.has(file), `${file} passes now: remove it from legacyFiles`);
  }
  for (const v of violations) {
    assert.ok(legacyFiles.includes(v.file), `${v.file} fails without being listed`);
    assert.ok(['T-22', 'T-27'].includes(v.rule), `legacy files only skip T-22 and T-27: ${v.rule}`);
  }
});

test('lexer: comments are ignored; strings, templates, imports and type-only imports are found', () => {
  const src = [
    "import { a } from './a.ts'; // from 'not-an-import'",
    "/* import 'nor-this' */ const re = /'[\"]/g; const b = x / 2;",
    'const t = sql`SELECT ${`/${inner}`} FROM t`;',
    "export * from '@srleagues/core';",
    "const lazy = await import('pg');",
    "import type { T } from './types.ts';",
    "import { type U, type V } from './more-types.ts';",
    "import { type W, value } from './mixed.ts';",
    "export type { X } from './x.ts';",
    "type Y = typeof import('./y.ts');",
  ].join('\n');
  const { imports, literals, code, bare } = lex(src);
  assert.deepEqual(
    imports.map((i) => `${i.spec}${i.typeOnly ? ' (type)' : ''}`),
    [
      './a.ts',
      '@srleagues/core',
      'pg',
      './types.ts (type)',
      './more-types.ts (type)',
      './mixed.ts',
      './x.ts (type)',
      './y.ts (type)',
    ],
  );
  assert.ok(!code.includes('not-an-import') && !code.includes('nor-this'));
  const outer = literals.find((l) => l.tag === 'sql');
  assert.equal(outer.value, 'SELECT ${`/${inner}`} FROM t');
  assert.ok(literals.some((l) => l.kind === 'template' && l.value === '/${inner}'));
  assert.ok(bare.includes('inner') && !bare.includes('SELECT'));
  assert.equal(code.split('\n').length, 10);
});

test('workspaces: globs are expanded, exports["."] is honored, and none found fails loudly', (t) => {
  const root = fixture(
    t,
    {
      'packages/ui/package.json': JSON.stringify({
        name: '@srleagues/ui',
        exports: { '.': { import: './src/main.ts' } },
      }),
      'packages/ui/src/main.ts': 'export const Button = 1;\n',
      'packages/site/package.json': JSON.stringify({
        name: '@srleagues/site',
        exports: { '.': './src/missing.ts' },
      }),
      'apps/web/src/a.ts': "import '@srleagues/ui';\nimport '@srleagues/site';\n",
    },
    { rootWorkspaces: ['apps/*', 'packages/*'] },
  );
  const result = checkStructure(root);
  assert.equal(result.fileCount > 20, true);
  assertExactly(
    result.violations.map((v) => `${v.file}:${v.line} [${v.rule}] ${v.message}`),
    [['apps/web/src/a.ts:2 [T-22]', "'@srleagues/site' has no entry file"]],
  );

  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'structure-empty-'));
  t.after(() => fs.rmSync(empty, { recursive: true, force: true }));
  fs.writeFileSync(path.join(empty, 'package.json'), JSON.stringify({ workspaces: ['nope/*'] }));
  assert.throws(() => checkStructure(empty), /found no workspaces/);
});

test('T-21 catches imports against the dependency direction', (t) => {
  assertExactly(
    found(t, {
      'packages/core/src/a.ts': "import { db } from '@srleagues/database';\n",
      'packages/core/src/b.ts': "import { x } from '../../database/index.ts';\n",
      'packages/contracts/src/c.ts': "import { add } from '@srleagues/core';\n",
      'packages/ui/src/d.ts': "import { add } from '@srleagues/core';\n",
      'apps/web/src/e.ts': "import { job } from '@srleagues/worker';\n",
      'packages/core/src/f.ts': "import x from '../../../apps/live-stats/service.ts';\n",
    }),
    [
      ['packages/core/src/a.ts:1 [T-21]', 'core may not import database'],
      ['packages/core/src/b.ts:1 [T-21]', 'core may not import database'],
      ['packages/core/src/b.ts:1 [T-22]', 'reaches into packages/database by path'],
      ['packages/contracts/src/c.ts:1 [T-21]', 'contracts may not import core'],
      ['packages/ui/src/d.ts:1 [T-21]', 'ui may not import core'],
      ['apps/web/src/e.ts:1 [T-21]', 'web may not import worker'],
      ['packages/core/src/f.ts:1 [T-21]', 'points outside the workspaces'],
    ],
  );
});

test('T-21 keeps React, vendor libraries and Node built-ins out of core', (t) => {
  assertExactly(
    found(t, {
      'packages/core/src/a.ts': "import React from 'react';\n",
      'packages/core/src/b.ts': "import Stripe from 'stripe';\n",
      'packages/core/src/c.ts': "import { readFile } from 'node:fs/promises';\n",
      'packages/core/src/view.tsx': 'export const V = () => null;\n',
      'packages/sports/src/d.ts': "import { z } from 'zod';\n",
      'packages/core/src/e.ts': "import { it } from 'vitest';\n",
    }),
    [
      ['packages/core/src/a.ts:1 [T-21]', "core may not use the library 'react'"],
      ['packages/core/src/b.ts:1 [T-21]', "core may not use the library 'stripe'"],
      ['packages/core/src/c.ts:1 [T-21]', "core may not use the Node built-in 'node:fs/promises'"],
      ['packages/core/src/view.tsx:1 [T-21]', 'core has no React'],
      ['packages/sports/src/d.ts:1 [T-21]', "sports may not use the library 'zod'"],
      ['packages/core/src/e.ts:1 [T-21]', "core may not use the library 'vitest'"],
    ],
  );
});

test('T-21 allows the directions and libraries the spec allows', (t) => {
  const test = "import { it } from 'vitest';\nimport fc from 'fast-check';\n";
  assertExactly(
    found(t, {
      'packages/core/src/a.ts': "import { z } from 'zod';\nimport '@srleagues/contracts';\n",
      'packages/core/src/a.test.ts': test + "import fs from 'node:fs';\n",
      'packages/core/src/a.spec.ts': test,
      'packages/core/src/build.test-helper.ts': "import { expect } from '@vitest/expect';\n",
      'packages/core/src/testing/two-leagues.ts': test,
      'packages/database/src/b.ts':
        "import { add } from '@srleagues/core';\nimport pg from 'pg';\n",
      'packages/providers/src/email.ts':
        "import { Resend } from 'resend';\nimport Stripe from 'stripe';\n",
      'packages/site/src/c.ts': "import { Button } from '@srleagues/ui';\n",
      'apps/web/src/d.tsx':
        "import '@srleagues/core';\nimport '@srleagues/database';\nimport '@srleagues/site';\n" +
        "import { useState } from 'react';\nimport { redirect } from 'next/navigation';\n",
    }),
    [],
  );
});

test('T-21 flags a workspace with no row in the dependency table', (t) => {
  assertExactly(found(t, {}, { extraWorkspaces: ['packages/extra'] }), [
    ['packages/extra/index.ts:1 [T-21]', 'packages/extra has no row in the dependency table'],
  ]);
});

test('T-22 catches deep imports across packages and core modules', (t) => {
  assertExactly(
    found(t, {
      'packages/core/src/sample.ts': 'export const add = 1;\n',
      'apps/web/src/a.ts': "import { add } from '@srleagues/core/src/sample.ts';\n",
      'apps/web/src/b.ts': "import { add } from '../../../packages/core/src/sample.ts';\n",
      'packages/core/src/modules/games/rules/score.ts': 'export const score = 1;\n',
      'packages/core/src/modules/games/index.ts': "export { score } from './rules/score.ts';\n",
      'packages/core/src/modules/standings/rules/table.ts':
        "import { score } from '../../games/rules/score.ts';\n",
    }),
    [
      [
        'apps/web/src/a.ts:1 [T-22]',
        "'@srleagues/core/src/sample.ts' reaches inside @srleagues/core",
      ],
      [
        'apps/web/src/b.ts:1 [T-22]',
        "reaches into packages/core by path. Import '@srleagues/core'",
      ],
      [
        'packages/core/src/modules/standings/rules/table.ts:1 [T-22]',
        "'../../games/rules/score.ts' reaches into the games module",
      ],
    ],
  );
});

test('T-22 allows index.ts imports and flags packages without one or with extra exports', (t) => {
  assertExactly(
    found(t, {
      'packages/core/src/modules/games/index.ts': "export { score } from './rules/score.ts';\n",
      'packages/core/src/modules/games/rules/score.ts': "import { x } from '../policy.ts';\n",
      'packages/core/src/modules/games/policy.ts': 'export const x = 1;\n',
      'packages/core/src/modules/standings/index.ts':
        "import { score } from '../games/index.ts';\n",
      'apps/web/src/a.ts': "import { add } from '@srleagues/core';\n",
    }),
    [],
  );
  assertExactly(
    found(
      t,
      {
        'packages/core/src/a.ts': "import { x } from '@srleagues/sports';\n",
        'packages/ui/package.json': JSON.stringify({
          name: '@srleagues/ui',
          exports: { '.': './index.ts', './src/*': './src/*' },
        }),
      },
      { skipIndex: ['packages/sports'] },
    ),
    [
      ['packages/core/src/a.ts:1 [T-22]', "'@srleagues/sports' has no entry file"],
      ['packages/ui/package.json:1 [T-22]', '@srleagues/ui exports ./src/*'],
    ],
  );
});

test('T-27 catches a league named in code but not in comments, seed or fixtures', (t) => {
  assertExactly(
    found(t, {
      'packages/core/src/a.ts':
        "// Faraj asked for this rule, which is fine to say in a comment.\nif (league.slug === 'farajleague') {}\n",
      'packages/core/src/b.ts': 'export const isAlHadi = (s: string) => s.length > 0;\n',
      'packages/site/src/c.tsx': 'export const C = () => <h1>TCSAAL standings</h1>;\n',
      'supabase/migrations/001.sql': "-- Faraj\ninsert into leagues (slug) values ('al-hadi');\n",
      'packages/ui/messages.json': '{ "title": "Welcome to Faraj League" }\n',
      'apps/web/public/about.html': '<p>Home of al_hadi</p>\n',
      'supabase/seed/leagues.sql': "insert into leagues (slug) values ('faraj');\n",
      'packages/core/src/fixtures/league.ts': "export const slug = 'faraj';\n",
    }),
    [
      ['packages/core/src/a.ts:2 [T-27]', 'names the league "faraj"'],
      ['packages/core/src/b.ts:1 [T-27]', 'names the league "AlHadi"'],
      ['packages/site/src/c.tsx:1 [T-27]', 'names the league "TCSAAL"'],
      ['supabase/migrations/001.sql:2 [T-27]', 'names the league "al-hadi"'],
      ['packages/ui/messages.json:1 [T-27]', 'names the league "Faraj"'],
      ['apps/web/public/about.html:1 [T-27]', 'names the league "al_hadi"'],
    ],
  );
});

test('SQL catches queries, sql templates, .sql files and drivers outside packages/database', (t) => {
  assertExactly(
    found(t, {
      'packages/core/src/a.ts': "const q = 'SELECT * FROM games WHERE id = $1';\n",
      'apps/web/src/b.ts': 'const q = sql`select 1`;\n',
      'apps/worker/src/c.ts': "const q = 'insert into games (id) values ($1)';\n",
      'apps/web/src/d.sql': 'select 1;\n',
      'packages/providers/src/e.ts':
        "import pg from 'pg';\nimport { PrismaClient } from '@prisma/client';\n",
      'packages/core/src/f.ts': 'const q = `UPDATE games SET score = ${n}`;\n',
    }),
    [
      ['packages/core/src/a.ts:1 [SQL]', 'has SQL text ("SELECT * FROM games WHERE id = $1")'],
      ['apps/web/src/b.ts:1 [SQL]', 'has a sql`...` query'],
      ['apps/worker/src/c.ts:1 [SQL]', 'has SQL text'],
      ['apps/web/src/d.sql:1 [SQL]', 'is a .sql file outside packages/database'],
      ['packages/providers/src/e.ts:1 [SQL]', "imports the database library 'pg'"],
      ['packages/providers/src/e.ts:2 [SQL]', "imports the database library '@prisma/client'"],
      ['packages/core/src/f.ts:1 [SQL]', 'has SQL text'],
    ],
  );
});

test('SQL catches lower-case statements with aliases and functions', (t) => {
  const plants = [
    'select count(*) from games',
    'select g.id, g.home_score as home from games g where g.league_id = $1',
    'select name from teams where id = $1',
    'select distinct team_id from rosters',
    'select * from players p join teams t on t.id = p.team_id',
    'insert into games values ($1, $2)',
    'insert into games (id, league_id) select id, league_id from drafts',
    'update games g set score = $2 where id = $1',
    'update players set name = $1',
    'delete from games where id = $1',
    'delete from games g using teams t where t.id = g.home_id',
    'delete from games;',
  ];
  const files = Object.fromEntries(
    plants.map((q, k) => [`packages/core/src/q${k}.ts`, `export const q = '${q}';\n`]),
  );
  assertExactly(
    found(t, files),
    plants.map((q, k) => [`packages/core/src/q${k}.ts:1 [SQL]`, 'has SQL text']),
  );
});

test('SQL leaves interface text and the allowed places alone', (t) => {
  const text = [
    'Select a team from the list',
    'Select one from below',
    'Select a team, then pick a player from the list',
    'Delete from this season',
    'Insert into the bracket by dragging',
    'Update your team settings',
    'Select players from the roster when ready',
  ];
  assertExactly(
    found(t, {
      'packages/database/src/games.ts':
        "import pg from 'pg';\nconst q = 'SELECT * FROM games WHERE id = $1';\n",
      'supabase/migrations/001-games.sql': 'create table games (id uuid primary key);\n',
      'packages/ui/messages.ts': `export const m = ${JSON.stringify(text)};\n`,
    }),
    [],
  );
});

test('T-34 catches hand-written league addresses outside the address helper', (t) => {
  assertExactly(
    found(t, {
      'apps/web/src/a.ts': 'const href = `/${league.slug}/schedule`;\n',
      'packages/emails/src/b.ts': 'const link = `${origin}/${leagueSlug}/register`;\n',
      'apps/web/src/c.ts': "const href = '/' + slug + '/admin';\n",
      'apps/worker/src/d.ts': "const link = baseUrl + '/' + league.slug;\n",
      'apps/worker/src/e.ts': 'const link = `https://example.test/${league.slug}`;\n',
      'apps/web/src/f.ts': "const href = 'https://example.test/' + leagueSlug;\n",
    }),
    [
      ['apps/web/src/a.ts:1 [T-34]', 'writes the address `/${league.slug}/schedule` by hand'],
      ['packages/emails/src/b.ts:1 [T-34]', 'writes the address'],
      ['apps/web/src/c.ts:1 [T-34]', 'joins a league into an address by hand'],
      ['apps/worker/src/d.ts:1 [T-34]', 'joins a league into an address by hand'],
      ['apps/worker/src/e.ts:1 [T-34]', 'writes the address'],
      ['apps/web/src/f.ts:1 [T-34]', 'joins a league into an address by hand'],
    ],
  );
});

test('T-34 leaves other paths, API and storage addresses, and the helper alone', (t) => {
  assertExactly(
    found(t, {
      'packages/core/src/modules/leagues/rules/league-url.ts':
        'export const leagueUrl = (l: { slug: string }, p: string) => `/${l.slug}/${p}`;\n',
      'apps/web/src/e.ts': [
        'const a = `/api/v1/games/${id}`;',
        'const b = leagueUrl(league, `teams/${team.slug}`);',
        "const c = '/account/inbox';",
        'const d = `/${locale}/help`;',
        'const e = `/api/v1/leagues/${leagueId}/games`;',
        'const f = `leagues/${leagueId}/logos/${file}`;',
        "const g = x + '/' + y;",
        "const h = '/api/v1/leagues/' + leagueId;",
        'const i = `${apiBase}/${leagueId}`;',
        "const j = '/api/v1/leagues' + '/' + leagueId;",
        "const k = path.join(dir, '/', name);",
      ].join('\n'),
    }),
    [],
  );
});

test('T-30 catches settings and secrets in browser code', (t) => {
  assertExactly(
    found(t, {
      'apps/web/src/a.tsx': "'use client';\nconst key = process.env.STRIPE_KEY;\n",
      'apps/web/src/b.tsx': '"use client";\nimport { url } from \'./settings.ts\';\n',
      'apps/web/src/settings.ts': "export const url = process.env['DATABASE_URL'];\n",
      'packages/ui/src/c.ts': 'const mode = import.meta.env.MODE;\n',
      'packages/core/src/d.ts': 'const { env } = process;\n',
      'apps/web/src/e.tsx': "'use client';\nimport { db } from '@srleagues/database';\n",
      'packages/site/src/f.ts': "const k = 'sk_live_abcdefgh12345678';\n",
      'apps/web/public/g.js': 'const s = process.env.SECRET;\n',
    }),
    [
      [
        'apps/web/src/a.tsx:2 [T-30]',
        "reads the environment but is browser code (marked 'use client')",
      ],
      [
        'apps/web/src/settings.ts:1 [T-30]',
        'reads the environment but is browser code (loaded by browser code apps/web/src/b.tsx)',
      ],
      [
        'packages/ui/src/c.ts:1 [T-30]',
        'reads the environment but is browser code (in packages/ui)',
      ],
      ['packages/core/src/d.ts:1 [T-30]', 'is in packages/core, which never reads settings'],
      ['apps/web/src/e.tsx:2 [T-30]', "imports packages/database ('@srleagues/database')"],
      ['packages/site/src/f.ts:1 [T-30]', 'looks like a Stripe key'],
      ['apps/web/public/g.js:1 [T-30]', 'browser code (served as is)'],
    ],
  );
});

test('T-30 follows @/ imports and workspace packages, and finds secret shapes in served files', (t) => {
  assertExactly(
    found(t, {
      'apps/web/src/components/chart.tsx': "'use client';\nimport { cfg } from '@/lib/cfg.ts';\n",
      'apps/web/src/lib/cfg.ts': 'export const cfg = process.env.API_KEY;\n',
      'apps/web/src/components/report.tsx':
        "'use client';\nimport { reportError } from '@srleagues/observability';\n",
      'packages/observability/index.ts': "export { reportError } from './src/report.ts';\n",
      'packages/observability/src/report.ts': 'export const dsn = process.env.SENTRY_DSN;\n',
      'apps/web/public/config.json': '{ "key": "re_abcdefghijklmnopqrstuvwx" }\n',
      'apps/web/public/index.html':
        '<script>const aws = "AKIAABCDEFGHIJKLMNOP";</script>\n<!-- postgres://app:hunter2@db.local/x -->\n',
      'packages/ui/src/token.ts':
        "export const t = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcdEFGHijkl';\n",
    }),
    [
      [
        'apps/web/src/lib/cfg.ts:1 [T-30]',
        'loaded by browser code apps/web/src/components/chart.tsx',
      ],
      [
        'packages/observability/src/report.ts:1 [T-30]',
        'loaded by browser code packages/observability/index.ts',
      ],
      ['apps/web/public/config.json:1 [T-30]', 'looks like a Resend key'],
      ['apps/web/public/index.html:1 [T-30]', 'looks like an AWS access key'],
      ['apps/web/public/index.html:2 [T-30]', 'looks like a database address with a password'],
      ['packages/ui/src/token.ts:1 [T-30]', 'looks like a signed token (JWT)'],
    ],
  );
});

test('T-30 leaves server code, type-only imports and messages alone', (t) => {
  assertExactly(
    found(t, {
      'apps/web/src/server/config.ts': 'export const url = process.env.DATABASE_URL;\n',
      'apps/web/src/page.tsx': "import { db } from '@srleagues/database';\n",
      'packages/ui/messages.ts': "export const m = 'Set process.env.PORT to change the port';\n",
      'apps/web/src/h.tsx':
        "// 'use client' only counts as the first statement\nimport '@srleagues/database';\n",
      'apps/web/src/i.tsx':
        "'use client';\nimport type { Config } from './server/config.ts';\n" +
        "import { type Db } from '@srleagues/database';\n",
    }),
    [],
  );
});

test('T-30 allows reading process.env only in the config module files', (t) => {
  assertExactly(
    found(t, {
      'apps/web/src/server/config.ts': 'export const e = process.env;\n',
      'apps/web/src/server/config-schema.ts': 'export const url = process.env.DATABASE_URL;\n',
      'apps/worker/src/config.ts': 'export const e = process.env;\n',
      'apps/worker/src/job.ts': "const { env } = process;\nconst a = process['env'];\n",
      'packages/providers/src/mail.ts': 'export const k = process.env.RESEND_API_KEY;\n',
      'packages/database/src/pool.ts': "// reads process.env\nexport const m = 'process.env';\n",
    }),
    [
      ['apps/web/src/server/config-schema.ts:1 [T-30]', 'is not a config module'],
      ['apps/worker/src/job.ts:1 [T-30]', 'is not a config module'],
      ['apps/worker/src/job.ts:2 [T-30]', 'is not a config module'],
      ['packages/providers/src/mail.ts:1 [T-30]', 'call getConfig() instead'],
    ],
  );
});

test('a planted violation of any rule fails the gate', (t) => {
  const plants = {
    'T-21': { 'packages/core/src/a.ts': "import '@srleagues/database';\n" },
    'T-22': { 'apps/web/src/a.ts': "import '@srleagues/core/src/x.ts';\n" },
    'T-27': { 'apps/web/src/a.ts': "const s = 'faraj';\n" },
    SQL: { 'apps/web/src/a.ts': "const q = 'delete from games where id = $1';\n" },
    'T-34': { 'apps/web/src/a.ts': 'const u = `/${league.slug}/news`;\n' },
    'T-30': { 'packages/ui/src/a.ts': 'const u = process.env.X;\n' },
  };
  const quiet = () => {};
  for (const [rule, files] of Object.entries(plants)) {
    const result = checkStructure(fixture(t, files));
    assert.deepEqual([...new Set(result.violations.map((v) => v.rule))], [rule], rule);
    assert.equal(report(result, quiet, quiet), 1, rule);
  }
  assert.equal(report(checkStructure(fixture(t, {})), quiet, quiet), 0);

  const cli = path.join(repoRoot, 'scripts/structure/index.mjs');
  const failed = spawnSync(process.execPath, [cli, fixture(t, plants['T-21'])], {
    encoding: 'utf8',
  });
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /packages\/core\/src\/a\.ts:1 \[T-21\] core may not import database/);
  const passed = spawnSync(process.execPath, [cli, repoRoot], { encoding: 'utf8' });
  assert.equal(passed.status, 0, passed.stderr);
});
