// The release check for the online scoring pilot (record 079, docs/operations/scoring-pilot-release.md).
//
// It runs on a developer's own computer, never against the live site. It starts the BUILT Worker
// (`dist/server`, made by `npm run build`) under Wrangler's local mode with a fresh local D1
// database in `.wrangler/release-check`, then reads it the way the scorer and a stranger would:
// the page and its protective headers, a practice game saved and read back, a request from another
// site refused, and requests shaped like React server actions and like Next.js's image optimizer
// answered without reaching either (the pilot has neither). Nothing hosted is contacted.
//
//   node scripts/check-release.mjs            the requests above
//   node scripts/check-release.mjs --browser  and then the scorer's own browser check
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const app = fileURLToPath(new URL('../', import.meta.url));
const repository = path.resolve(app, '../..');
const config = path.join(app, 'dist/server/wrangler.json');
const state = path.join(app, '.wrangler/release-check');
const wrangler = [
  '--import',
  path.join(app, 'scripts/sites-env.mjs'),
  path.join(app, 'node_modules/wrangler/bin/wrangler.js'),
];
const quiet = { ...process.env, WRANGLER_SEND_METRICS: 'false', CLOUDFLARE_CF_FETCH_ENABLED: 'false' };

if (!existsSync(config)) {
  console.error('No build found: run `npm run build` in apps/varsity-hosted first.');
  process.exit(1);
}

rmSync(state, { recursive: true, force: true });
for (const file of readdirSync(path.join(app, 'drizzle'))
  .filter((name) => name.endsWith('.sql'))
  .sort()) {
  const applied = spawnSync(
    process.execPath,
    [
      ...wrangler,
      'd1',
      'execute',
      'DB',
      '--local',
      '--config',
      config,
      '--persist-to',
      state,
      '--file',
      path.join(app, 'drizzle', file),
    ],
    { cwd: app, env: quiet, encoding: 'utf8' },
  );
  if (applied.status !== 0) {
    console.error(applied.stdout, applied.stderr);
    throw new Error(`The local migration ${file} did not apply.`);
  }
}

const port = await new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const { port: free } = probe.address();
    probe.close(() => resolve(free));
  });
});
const base = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  [
    ...wrangler,
    'dev',
    '--config',
    config,
    '--local',
    '--persist-to',
    state,
    '--ip',
    '127.0.0.1',
    '--port',
    String(port),
    '--inspector-port',
    '0',
    '--show-interactive-dev-session=false',
  ],
  { cwd: app, env: quiet, detached: process.platform !== 'win32' },
);
let output = '';
await new Promise((resolve, reject) => {
  const limit = setTimeout(() => reject(new Error(`The local Worker did not start:\n${output}`)), 90_000);
  const read = (chunk) => {
    output += chunk;
    if (output.includes('Ready on')) {
      clearTimeout(limit);
      resolve();
    }
  };
  server.stdout.on('data', read);
  server.stderr.on('data', read);
  server.once('exit', (code) => {
    clearTimeout(limit);
    reject(new Error(`The local Worker stopped (${code}):\n${output}`));
  });
});

function ask(method, address, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const sized = body ? { ...headers, 'content-length': Buffer.byteLength(body) } : headers;
    const request = http.request(new URL(address, base), { method, headers: sized }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () =>
        resolve({
          status: response.statusCode,
          headers: response.headers,
          text: Buffer.concat(chunks).toString('utf8'),
        }),
      );
    });
    request.on('error', reject);
    if (body) request.write(body);
    request.end();
  });
}
const sameOrigin = (value) => ({
  headers: { 'content-type': 'application/json', origin: base },
  body: JSON.stringify(value),
});
const multipart = (fields) => {
  const boundary = `----release-check-${randomUUID()}`;
  const body =
    Object.entries(fields)
      .map(
        ([name, value]) =>
          `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
      )
      .join('') + `--${boundary}--\r\n`;
  return { type: `multipart/form-data; boundary=${boundary}`, body };
};
const results = [];
async function check(name, run) {
  await run();
  results.push(name);
  console.log(`  ok  ${name}`);
}

let failed = false;
try {
  console.log(`Release check of the built pilot at ${base} (local Worker, local D1)`);
  await check('the scorer page answers with its protective headers', async () => {
    const page = await ask('GET', '/');
    assert.equal(page.status, 200);
    assert.match(page.headers['content-type'], /^text\/html/);
    assert.equal(page.headers['cache-control'], 'private, no-store');
    assert.equal(page.headers['x-content-type-options'], 'nosniff');
    assert.match(page.headers['content-security-policy'], /frame-ancestors 'none'/);
    assert.match(page.headers['content-security-policy'], /script-src 'self'/);
    assert.match(page.text, /data-storage="cloud"/);
  });
  await check('the API is up and says it is the hosted SQL pilot', async () => {
    const health = await ask('GET', '/api/health');
    assert.equal(health.status, 200);
    assert.deepEqual(JSON.parse(health.text), { ok: true, mode: 'hosted-sql-pilot' });
  });
  let gameId;
  await check('a practice game is saved to the database and read back', async () => {
    const created = await ask(
      'POST',
      '/api/practice',
      sameOrigin({ commandId: randomUUID() }),
    );
    assert.equal(created.status, 200, created.text);
    gameId = JSON.parse(created.text).id;
    assert.ok(gameId);
    const dashboard = await ask('GET', '/api/dashboard');
    assert.equal(dashboard.status, 200);
    assert.ok(dashboard.text.includes(gameId), 'the saved game is on the dashboard');
  });
  await check('a save sent from another site is refused', async () => {
    const refused = await ask('POST', '/api/practice', {
      headers: { 'content-type': 'application/json', origin: 'https://elsewhere.example' },
      body: JSON.stringify({ commandId: randomUUID() }),
    });
    assert.equal(refused.status, 403);
  });
  // The pilot has no server actions, so vinext builds it without the code that decodes them: a
  // request shaped like one is answered before React's decoder could read its body.
  for (const [name, address] of [
    ['the page', '/'],
    ['the API', '/api/games'],
  ]) {
    await check(`a server-action request to ${name} is answered without decoding it`, async () => {
      const form = multipart({ 0: '["$@1"]', 1: '{}' });
      const action = await ask('POST', address, {
        headers: {
          'content-type': form.type,
          origin: base,
          'next-action': '0'.repeat(40),
          accept: 'text/x-component',
        },
        body: form.body,
      });
      assert.ok(
        action.status >= 400 && action.status < 500,
        `${address}: ${action.status} ${action.text}`,
      );
      // vinext's answer when the build holds no server actions: it is given before the body is read.
      assert.match(action.text, /Server action not found/);
    });
  }
  await check('a form posted to the page without an action is refused', async () => {
    const form = multipart({ '1_$ACTION_ID_0': '', 0: '["$@1"]' });
    const posted = await ask('POST', '/', {
      headers: { 'content-type': form.type, origin: base },
      body: form.body,
    });
    assert.ok(posted.status >= 400 && posted.status < 500, `${posted.status} ${posted.text}`);
  });
  await check('there is no image optimizer to send pictures through', async () => {
    const image = await ask('GET', '/_next/image?url=%2Ffavicon.svg&w=64&q=75');
    assert.ok(!/^image\//.test(image.headers['content-type'] ?? '') || image.status !== 200);
    assert.ok(image.status < 500, `${image.status} ${image.text}`);
  });
  await check('the Worker is still answering after all of that', async () => {
    const health = await ask('GET', '/api/health');
    assert.equal(health.status, 200);
  });
  if (process.argv.includes('--browser')) {
    const browser = spawnSync(
      process.execPath,
      [path.join(repository, 'scripts/check-hosted-varsity-browser.mjs')],
      { cwd: repository, env: { ...process.env, HOSTED_TEST_URL: base }, stdio: 'inherit' },
    );
    if (browser.status !== 0) throw new Error('The scorer browser check failed.');
    results.push('the scorer browser check');
  }
  const react = JSON.parse(
    readFileSync(path.join(app, 'node_modules/react-server-dom-webpack/package.json'), 'utf8'),
  ).version;
  console.log(`Release check passed: ${results.length} checks; React server components ${react}.`);
} catch (error) {
  failed = true;
  console.error(error);
  console.error(output.slice(-4000));
} finally {
  if (process.platform === 'win32') server.kill();
  else process.kill(-server.pid, 'SIGTERM');
}
process.exitCode = failed ? 1 : 0;
