import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// The online scoring pilot keeps its own lockfile, which the root `npm audit` cannot see (record
// 079). These checks read that lockfile offline and fail if any library the advisories named high
// or critical comes back to a release inside an advisory's range.
const read = async (file) => JSON.parse(await readFile(new URL(`../${file}`, import.meta.url)));
const lock = await read('apps/varsity-hosted/package-lock.json');
const manifest = await read('apps/varsity-hosted/package.json');

function parse(version) {
  const [main, pre] = version.split('-', 2);
  return { parts: main.split('.').map(Number), pre: pre ?? null };
}
// -1, 0 or 1. A pre-release sorts before the release of the same number.
function compare(a, b) {
  const x = parse(a),
    y = parse(b);
  for (let i = 0; i < 3; i++)
    if (x.parts[i] !== y.parts[i]) return x.parts[i] < y.parts[i] ? -1 : 1;
  if (x.pre === y.pre) return 0;
  if (x.pre === null) return 1;
  if (y.pre === null) return -1;
  return x.pre < y.pre ? -1 : 1;
}
function resolved(name) {
  return Object.entries(lock.packages)
    .filter(
      ([where]) => where === `node_modules/${name}` || where.endsWith(`/node_modules/${name}`),
    )
    .map(([, entry]) => entry.version);
}

// The first release outside every high or critical advisory for each library (record 079 lists
// each advisory). A library missing from the lockfile is fine: nothing can reach it.
const fixedAt = {
  next: '16.4.5',
  'react-server-dom-webpack': '19.2.9',
  vinext: '1.0.0',
  vite: '8.1.6',
  '@cloudflare/vite-plugin': '1.63.1',
  wrangler: '4.149.0',
  miniflare: '5.20261006.0',
  sharp: '0.35.5',
  undici: '7.30.1',
  ws: '8.21.0',
  'image-size': '2.0.3',
  browserslist: '4.28.7',
  'js-yaml': '4.3.2',
  'source-map-js': '1.2.2',
};

test('no library in the pilot is left inside a high or critical advisory', () => {
  for (const [name, first] of Object.entries(fixedAt))
    for (const version of resolved(name))
      assert.ok(compare(version, first) >= 0, `${name} ${version} is older than ${first}`);
  // Two lines of brace-expansion are in use; each has its own first fixed release.
  for (const version of resolved('brace-expansion')) {
    const major = parse(version).parts[0];
    assert.ok([1, 5].includes(major), `brace-expansion ${version} is on an unfixed line`);
    assert.ok(
      compare(version, major === 1 ? '1.1.21' : '5.0.12') >= 0,
      `brace-expansion ${version}`,
    );
  }
});

test('the moved libraries are pinned exactly, and React matches its server components', () => {
  const pins = { ...manifest.dependencies, ...manifest.devDependencies };
  for (const name of [
    'next',
    'eslint-config-next',
    'react',
    'react-dom',
    'react-server-dom-webpack',
    'vinext',
    'vite',
    '@vitejs/plugin-rsc',
    '@cloudflare/vite-plugin',
    'wrangler',
  ])
    assert.match(pins[name], /^\d+\.\d+\.\d+$/, `${name} is pinned to one release`);
  assert.equal(pins.react, pins['react-server-dom-webpack']);
  assert.equal(pins['react-dom'], pins['react-server-dom-webpack']);
  assert.equal(pins['eslint-config-next'], pins.next);
  assert.deepEqual(resolved('react-server-dom-webpack'), [pins['react-server-dom-webpack']]);
});

test('the pilot stays outside the workspaces, so its libraries never move the tracker', async () => {
  const root = await read('package.json');
  assert.ok(!root.workspaces.some((folder) => folder.includes('varsity')));
});

test('the Worker keeps the runtime date the live pilot was built with', async () => {
  const config = await readFile(
    new URL('../apps/varsity-hosted/vite.config.ts', import.meta.url),
    'utf8',
  );
  assert.match(config, /compatibility_date: '2026-05-15'/);
});
