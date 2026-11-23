// The platform's image file (platform.Dockerfile, step 2.95, record 101) and the rules of
// what it may read (platform.Dockerfile.dockerignore), held to their promises without
// Docker, which this computer does not have; GitHub builds and starts the image on every
// push (ci.yml, job "image"). It copies only named paths, never a .env file however it is
// spelled or wherever it sits; it carries the root package.json, supabase/site.json and
// supabase/migrations; it runs as a user that is not root; it starts the web app by
// default and names the worker's command; and each workspace declares the outside
// packages its own code imports (R10).
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const imageFile = read('platform.Dockerfile');
const ignoreRules = read('platform.Dockerfile.dockerignore')
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line !== '' && !line.startsWith('#'));
const workspaces = JSON.parse(read('package.json')).workspaces;

/** The instructions of each stage, as [keyword, rest] pairs (no line continues). */
const stages = imageFile
  .split(/^FROM /m)
  .slice(1)
  .map((stage) =>
    `FROM ${stage}`
      .split('\n')
      .filter((line) => line.trim() !== '' && !line.trim().startsWith('#'))
      .map((line) => {
        const [keyword, ...rest] = line.trim().split(/\s+/);
        return [keyword.toUpperCase(), rest];
      }),
  );
const finalStage = stages.at(-1);

/** The context paths a stage copies (COPY --from copies from another stage, not the context). */
const copiedFrom = (stage) =>
  stage
    .filter(([keyword, rest]) => keyword === 'COPY' && !rest.some((r) => r.startsWith('--from')))
    .flatMap(([, rest]) => rest.filter((r) => !r.startsWith('--')).slice(0, -1));

/** One ignore rule as a regular expression over a path from the context's root. */
function ruleExpression(pattern) {
  const body = pattern
    .replace(/^\/+/, '')
    .split('')
    .map((c, i, all) => {
      if (c === '*' && all[i + 1] === '*') return '';
      if (c === '*' && all[i - 1] === '*') return '.*';
      if (c === '*') return '[^/]*';
      if (c === '?') return '[^/]';
      return /[.+^${}()|[\]\\]/.test(c) ? `\\${c}` : c;
    })
    .join('')
    .replace(/\.\*\//g, '(?:.*/)?');
  // A rule that matches a folder matches everything inside it.
  return new RegExp(`^${body}(?:/.*)?$`);
}

/** Whether Docker leaves the path out of the context: the last matching rule decides. */
function ignored(file) {
  let out = false;
  for (const rule of ignoreRules) {
    const exception = rule.startsWith('!');
    if (ruleExpression(exception ? rule.slice(1) : rule).test(file)) out = !exception;
  }
  return out;
}

test('the image is a file of its own: the tracker’s Dockerfile and .dockerignore are not it', () => {
  assert.equal(existsSync(path.join(root, 'Dockerfile')), true);
  assert.doesNotMatch(read('Dockerfile'), /apps\/web|apps\/worker/);
  assert.equal(stages.length, 2, 'a build stage and the image itself');
  assert.match(imageFile, /^# syntax=docker\/dockerfile:1$/m);
});

test('it copies only named paths, never the whole folder or a pattern', () => {
  for (const stage of stages) {
    for (const source of copiedFrom(stage)) {
      assert.notEqual(source.replace(/\/$/, ''), '.', 'never COPY .');
      assert.doesNotMatch(source, /[*?[]/, source);
      assert.doesNotMatch(source, /(^|\/)\.env/, source);
      assert.equal(existsSync(path.join(root, source)), true, `${source} exists`);
      assert.equal(ignored(source), false, `${source} is let in by the ignore rules`);
    }
  }
});

test('no .env file can reach the image, however it is spelled or wherever it sits', () => {
  assert.equal(ignoreRules[0], '*', 'everything is left out first');
  for (const file of [
    '.env',
    '.env.staging',
    '.env.local',
    'apps/web/.env',
    'apps/web/.env.production',
    'apps/worker/.env.staging',
    'packages/database/.env',
    'packages/providers/src/.env.test',
    'supabase/migrations/.env',
  ]) {
    assert.equal(ignored(file), true, file);
  }
  // Nor anything else left out: docs, tests, the lanes and installed packages.
  for (const file of [
    'docs/build/STATUS.md',
    'tests/platform-image.test.mjs',
    '.local/seed-db/PG_VERSION',
    '.git/config',
    'apps/live-stats/server.mjs',
    'apps/web/node_modules/x/index.js',
    'apps/web/.next/BUILD_ID',
    'packages/core/src/a.test.ts',
    'scripts/release.mjs',
  ]) {
    assert.equal(ignored(file), true, file);
  }
  for (const file of [
    'package.json',
    'supabase/site.json',
    'supabase/migrations/0001_migration_log.sql',
    'apps/web/next.config.ts',
    'apps/worker/src/main.ts',
    'packages/core/index.ts',
  ]) {
    assert.equal(ignored(file), false, file);
  }
  // No setting is written into the image: the host gives every one.
  for (const stage of stages) {
    for (const [keyword, rest] of stage) {
      if (keyword === 'ENV' || keyword === 'ARG') {
        assert.doesNotMatch(rest.join(' '), /PASSWORD|SECRET|TOKEN|KEY|DATABASE|_URL|APP_ENV/i);
      }
    }
  }
});

test('the image carries the root package.json, supabase/site.json, supabase/migrations and every workspace', () => {
  const finalCopies = copiedFrom(finalStage);
  for (const needed of [
    'package.json',
    'package-lock.json',
    'supabase/site.json',
    'supabase/migrations',
    'apps/web',
    'apps/worker',
    'packages',
  ]) {
    assert.ok(finalCopies.includes(needed), needed);
  }
  // npm ci needs every workspace's package.json before it installs, in both stages.
  for (const stage of stages) {
    const copies = copiedFrom(stage);
    for (const workspace of workspaces) {
      assert.ok(copies.includes(`${workspace}/package.json`), `${workspace}/package.json`);
    }
  }
  assert.ok(
    finalStage.some(([k, rest]) => k === 'RUN' && rest.join(' ').includes('npm ci --omit=dev')),
  );
  assert.ok(
    finalStage.some(
      ([k, rest]) =>
        k === 'COPY' && rest.includes('--from=build') && rest.includes('apps/web/.next'),
    ),
  );
});

test('it runs as a user that is not root, the web app by default, and names the worker’s command', () => {
  const users = finalStage.filter(([keyword]) => keyword === 'USER');
  assert.equal(users.length, 1);
  assert.doesNotMatch(users[0][1][0], /^(root|0)(:|$)/);
  const keywords = finalStage.map(([keyword]) => keyword);
  assert.equal(keywords.at(-1), 'CMD');
  assert.ok(keywords.lastIndexOf('USER') > keywords.lastIndexOf('RUN'), 'nothing runs after USER');
  assert.equal(
    finalStage.at(-1)[1].join(' '),
    '["node", "scripts/web.mjs", "start", "--hostname", "0.0.0.0"]',
  );
  assert.equal(finalStage.filter(([k]) => k === 'ENTRYPOINT').length, 0);
  const worker =
    /^#\s+node --disable-warning=ExperimentalWarning (apps\/worker\/src\/main\.ts)$/m.exec(
      imageFile,
    );
  assert.ok(worker, 'the worker’s command is written in the file');
  assert.equal(existsSync(path.join(root, worker[1])), true);
  assert.match(read('package.json'), /"start:worker": "[^"]*apps\/worker\/src\/main\.ts"/);
  assert.match(imageFile, /\/api\/v1\/health/);
  assert.equal(existsSync(path.join(root, 'apps/web/src/app/api/v1/health/route.ts')), true);
});

/** The outside packages a folder's own code imports (not its tests or development scripts). */
function importedPackages(folder) {
  const found = new Set();
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const file = path.join(dir, name);
      if (['node_modules', '.next', 'scripts', 'fixtures'].includes(name)) continue;
      if (statSync(file).isDirectory()) walk(file);
      else if (/\.(ts|tsx|mjs)$/.test(name) && !/\.test\.|test-helper/.test(name)) {
        // `from '…'`, a bare `import '…';` line, and `import('…')`, outside packages only.
        for (const [, ...specs] of readFileSync(file, 'utf8').matchAll(
          /\bfrom\s+'([^'.][^'\s]*)'|^\s*import\s+'([^'.][^'\s]*)'|\bimport\(\s*'([^'.][^'\s]*)'\s*\)/gm,
        )) {
          const spec = specs.find((s) => s !== undefined);
          if (spec.startsWith('node:') || spec.startsWith('@srleagues/')) continue;
          found.add(
            spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0],
          );
        }
      }
    }
  };
  walk(folder);
  return found;
}

test('each workspace declares the outside packages its own code imports (R10)', () => {
  const missing = [];
  for (const workspace of workspaces) {
    const manifest = JSON.parse(read(`${workspace}/package.json`));
    const declared = new Set(
      // A development tool's own (schema-types-file.ts's prettier) counts when declared as one.
      Object.keys({
        ...manifest.dependencies,
        ...manifest.peerDependencies,
        ...manifest.devDependencies,
      }),
    );
    for (const name of importedPackages(path.join(root, workspace))) {
      if (!declared.has(name)) missing.push(`${workspace} imports ${name}`);
    }
  }
  assert.deepEqual(missing, [], 'each of these is declared in that workspace’s package.json');
});
