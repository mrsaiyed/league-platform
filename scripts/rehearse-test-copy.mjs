// `npm run rehearse:test-copy` (step 2.207, T-301): follows docs/operations/new-test-copy.md
// in the page's own order on this computer, with made-up data only, so that everything the
// supervised session will do has been done once here first:
//
// - before step 1, a throw-away PostgreSQL with a certificate (step 2.202), started bare:
//   the tables' owner and an empty database, as a new Supabase project is;
// - step 2, the sign-in fake of step 2.93 answering over HTTP, "Confirm email" on;
// - step 3, the release command itself (`npm run release -- --hosted`), the owner's
//   password typed at its hidden question, then run again;
// - steps 4 and 5, app_login made and given the sign-in store as the page says, its password
//   given with psql's `\password` at a terminal;
// - step 7, the website built as the image builds it and started in staging mode with
//   exactly the settings the Render page lists, pointed at this computer;
// - step 8.1, a league made with `npm run league:make -- --hosted`, and its owner signed up
//   in a browser with the code read by `node scripts/read-kept-emails.mjs --hosted`; then
//   step 2.194's walk (tests/browser/first-test-walk.mjs, the same code as its browser
//   test) to the final table, the owner signing in on the sign-in page, a second browser
//   watching signed out (the league is a draft: it sees every page hidden);
// - steps 8.2 and 8.3, `npm run check:test-copy` against the rehearsed site with the build's
//   own manifest, so that the posted "be this person" line is checked too.
//
// `--expect-refusal=certificate` (PLATFORM_DATABASE_CA taken out of the website's settings)
// and `--expect-refusal=confirm-email` (the fake saying "Confirm email" is off) rehearse the
// two failures instead: the run passes only when the website refuses to start with the
// product's own plain sentence, which it shows (the plan's done test).
//
// The tools are meant for a person at a terminal and are not changed: each is run under
// util-linux `script`, which gives it a pseudo-terminal, and the rehearsal types its answers
// when its question appears (T-301). It says each step as it goes, stops at the first that
// fails naming the page's line, and always stops what it started. Its words are in
// rehearse-test-copy.messages.mjs, its pure rules in rehearse-test-copy-rules.mjs.
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveFakeSupabaseAuth } from '../packages/providers/index.ts';
import { leagueUrl } from '@srleagues/core';
import { signInWithPassword, walkFirstTest } from '../tests/browser/first-test-walk.mjs';
import { freePort, launch } from '../tests/browser/web-browser-kit.mjs';
import * as words from './rehearse-test-copy.messages.mjs';
import {
  addressAs,
  answerDue,
  codeIn,
  hidden,
  leftBehind,
  refusalIn,
  refusals,
  splitAddress,
  whereInPage,
} from './rehearse-test-copy-rules.mjs';

const refusal = process.argv
  .find((a) => a.startsWith('--expect-refusal='))
  ?.slice('--expect-refusal='.length);
if (refusal !== undefined && !(refusal in refusals)) {
  console.error(words.reasons.unknownRefusal(Object.keys(refusals)));
  process.exit(2);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pageText = readFileSync(path.join(root, words.page), 'utf8');
const folder = '.local/pg-rehearsal';
const run = randomBytes(4).toString('hex');
const madeUp = (n = 18) =>
  randomBytes(n)
    .toString('base64')
    .replace(/[^A-Za-z0-9]/g, 'x');
const secrets = [];
const started = { db: false, fake: null, web: null, browser: null, visitor: null };

class StepFailed extends Error {
  constructor(reason, output = '') {
    super(reason);
    this.output = output;
  }
}

/** The refusal `--expect-refusal` asked for came, in the product's own sentence. */
class RefusedAsExpected extends Error {
  constructor(sentence) {
    super(sentence);
    this.sentence = sentence;
  }
}

/** The settings every tool gets: this computer's basics and nothing of the shell's own. */
function baseEnv(extra = {}) {
  const keep = ['PATH', 'HOME', 'LANG', 'TERM', 'PLAYWRIGHT_BROWSERS_PATH', 'CI'];
  const env = Object.fromEntries(
    keep.filter((k) => process.env[k]).map((k) => [k, process.env[k]]),
  );
  return { ...env, NEXT_TELEMETRY_DISABLED: '1', ...extra };
}

/**
 * Runs `command` under a pseudo-terminal (util-linux `script`), typing each answer once its
 * question appears. Resolves with the output; throws StepFailed on a non-zero exit or when a
 * question does not come within `seconds`.
 */
function atTerminal(tool, command, env, answers = [], seconds = 180) {
  return new Promise((resolve, reject) => {
    const child = spawn('script', ['-qefc', command, '/dev/null'], {
      cwd: root,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let output = '';
    let since = '';
    let given = 0;
    let typing = false;
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      const waiting = answers[given]?.after.source ?? 'the end';
      reject(new StepFailed(words.reasons.toolTimedOut(tool, waiting), output));
    }, seconds * 1000);
    const heard = (chunk) => {
      output += chunk;
      since += chunk;
      const due = typing ? null : answerDue(since, answers, given);
      if (due === null) return;
      typing = true;
      // A moment for the tool to switch its typing off before the answer arrives.
      setTimeout(() => {
        since = '';
        given += 1;
        typing = false;
        child.stdin.write(`${due.send}\r`);
      }, 400);
    };
    child.stdout.on('data', (c) => heard(c.toString('utf8')));
    child.stderr.on('data', (c) => heard(c.toString('utf8')));
    child.on('exit', (code) => {
      clearTimeout(timer);
      child.stdin.destroy();
      if (code === 0) resolve(output);
      else reject(new StepFailed(words.reasons.toolFailed(tool, code), output));
    });
  });
}

/** Runs a program with no terminal; its output, or StepFailed. */
function plainly(tool, file, args, env) {
  try {
    return execFileSync(file, args, { cwd: root, env, encoding: 'utf8', stdio: 'pipe' });
  } catch (error) {
    throw new StepFailed(
      words.reasons.toolFailed(tool, error.status),
      `${error.stdout ?? ''}${error.stderr ?? ''}`,
    );
  }
}

const see = (output, pattern, what) => {
  if (!pattern.test(output)) throw new StepFailed(words.reasons.notSeen(what), output);
};

async function step(id, work) {
  console.log(words.doing[id]);
  try {
    const detail = await work();
    if (detail) console.log(words.done(detail));
  } catch (error) {
    if (error instanceof RefusedAsExpected) {
      console.log(words.refusedHere(error.sentence));
      throw error;
    }
    const reason = error instanceof StepFailed ? error.message : String(error?.message ?? error);
    console.error(words.failed({ ...whereInPage(pageText, id), reason }));
    if (error instanceof StepFailed && error.output) {
      console.error(words.outputTail);
      const tail = hidden(error.output, secrets).replace(/\r/g, '').split('\n').slice(-25);
      console.error(tail.map((l) => `  | ${l}`).join('\n'));
    }
    throw new Error('stopped');
  }
}

/** Stops what was started, whatever happened. */
let stopping = null;
function stopAll() {
  stopping ??= stopEverything();
  return stopping;
}
async function stopEverything() {
  console.log(words.stopping);
  await started.browser?.close().catch(() => {});
  await started.visitor?.close().catch(() => {});
  if (started.web !== null && started.web.exitCode === null) {
    started.web.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 1500));
    if (started.web.exitCode === null) started.web.kill('SIGKILL');
  }
  await started.fake?.close().catch(() => {});
  if (started.db) {
    try {
      execFileSync(process.execPath, ['scripts/real-postgres.mjs', 'stop', '--folder', folder], {
        cwd: root,
        stdio: 'ignore',
      });
    } catch {
      process.exitCode = 1;
    }
  }
}

// The whole tree is watched, except .local, where the rehearsal keeps its made-up
// database, keys and certificate.
const gitStatus = () =>
  execFileSync('git', ['status', '--porcelain', '--', '.', ':(exclude).local'], {
    cwd: root,
    encoding: 'utf8',
  });

async function rehearse() {
  let ownerUrl = '';
  let appPassword = '';
  let ca = '';
  let caText = '';
  let commit = '';
  let origin = '';
  const secretKey = `made-up-supabase-secret-key-${run}`;
  const shortName = `rehearsal-${run}`;
  const ownerEmail = `owner-${run}@example.test`;
  const leagueName = 'Made-up Rehearsal League';
  const seasonName = 'Season one';
  const chosenPassword = `a made-up chosen password ${run}`;
  secrets.push(chosenPassword);
  let auth = null;

  if (existsSync(path.join(root, '.env'))) {
    console.error(words.reasons.envFile);
    throw new Error('stopped');
  }

  await step('database', async () => {
    const port = await freePort();
    started.db = true;
    const out = plainly(
      'real-postgres start --bare',
      process.execPath,
      ['scripts/real-postgres.mjs', 'start', '--bare', '--folder', folder, '--port', String(port)],
      baseEnv(),
    );
    see(out, /Bare: the tables’ owner/, 'the bare start');
    const connection = JSON.parse(readFileSync(path.join(root, folder, 'connection.json'), 'utf8'));
    ownerUrl = connection.ownerUrl;
    ca = connection.caFile;
    caText = readFileSync(ca, 'utf8');
    // app_login's password "from the password manager": made at the start, letters and digits.
    appPassword = splitAddress(connection.appUrl).password;
    secrets.push(splitAddress(ownerUrl).password, appPassword, secretKey);
    return `PostgreSQL ${connection.version} on localhost port ${port}, its certificate in ${folder}`;
  });

  await step('project', async () => {
    const site = JSON.parse(readFileSync(path.join(root, 'supabase/site.json'), 'utf8'));
    const tracker = new URL(site.url).hostname.split('.')[0];
    const host = new URL(ownerUrl).hostname;
    if (ownerUrl.includes(tracker)) throw new StepFailed(words.reasons.tracker);
    return `the database is on ${host}, not the tracker's project`;
  });

  await step('confirmEmail', async () => {
    const off = refusal === 'confirm-email';
    auth = await serveFakeSupabaseAuth({ secretKey, ...(off ? { mailerAutoconfirm: true } : {}) });
    started.fake = auth;
    return off
      ? `the sign-in fake answers on ${auth.url}, "Confirm email" OFF (--expect-refusal=confirm-email)`
      : `the sign-in fake answers on ${auth.url}, "Confirm email" on (its default)`;
  });

  const owner = splitAddress(ownerUrl);
  const releaseEnv = baseEnv({ MIGRATION_DATABASE_URL: owner.address, PLATFORM_DATABASE_CA: ca });
  const releaseAnswers = [
    { after: /password vault; what you type is not shown\): $/, send: owner.password },
    { after: /type the host’s name shown above: $/, send: new URL(ownerUrl).hostname },
  ];
  await step('release', async () => {
    const out = await atTerminal(
      'npm run release -- --hosted',
      'npm run release -- --hosted',
      releaseEnv,
      releaseAnswers,
    );
    see(out, /Applied now: (?!none)/, 'every change listed as applied');
    const named = /Deploy commit ([0-9a-f]{7,40}) now/.exec(out);
    if (named === null) throw new StepFailed(words.reasons.notSeen('the commit to deploy'), out);
    commit = named[1];
    return `changes applied; the commit to deploy is ${commit.slice(0, 12)}`;
  });
  await step('releaseAgain', async () => {
    const out = await atTerminal(
      'npm run release -- --hosted',
      'npm run release -- --hosted',
      releaseEnv,
      releaseAnswers,
    );
    see(out, /Applied now: none/, '"nothing applied" on the second run');
    see(out, new RegExp(`Deploy commit ${commit} now`), 'the same commit named again');
    return 'nothing applied, the same commit named';
  });

  // The dashboard's SQL editor runs as the tables' owner: psql as the owner stands in for it.
  const psqlAddress = `${owner.address}?sslmode=verify-full&sslrootcert=${encodeURIComponent(ca)}`;
  const sqlEditor = (tool, statements) =>
    plainly(
      tool,
      'psql',
      [psqlAddress, '-X', '-v', 'ON_ERROR_STOP=1', ...statements.flatMap((s) => ['-c', s])],
      baseEnv({ PGPASSWORD: owner.password }),
    );
  await step('login', async () => {
    const out = sqlEditor('the SQL editor (psql as the owner)', [
      'create role app_login login;',
      'grant app_user to app_login;',
    ]);
    see(out, /CREATE ROLE[\s\S]*GRANT ROLE/, '"Success"');
    return 'app_login made, a member of app_user, no password yet';
  });
  await step('password', async () => {
    const out = await atTerminal(
      'psql',
      `psql '${psqlAddress}'`,
      baseEnv(),
      [
        { after: /Password for user postgres: $/, send: owner.password },
        { after: /=> $/, send: '\\password app_login' },
        { after: /Enter new password for user "app_login": $/, send: appPassword },
        { after: /Enter it again: $/, send: appPassword },
        { after: /=> $/, send: '\\q' },
      ],
      60,
    );
    if (out.includes(appPassword) || out.includes(owner.password))
      throw new StepFailed(words.reasons.notSeen('nothing shown while the passwords were typed'));
    return 'app_login has its password; nothing showed while it was typed';
  });
  await step('signInStore', async () => {
    const out = sqlEditor('the SQL editor (psql as the owner)', [
      'grant sign_in_store to app_login;',
    ]);
    see(out, /GRANT ROLE/, '"Success"');
    return 'granted';
  });
  await step(
    'realChecks',
    async () =>
      'left for the session: they are step 2.93’s lists for real PostgreSQL, run after step 8.1',
  );

  await step('build', async () => {
    if (process.argv.includes('--no-build'))
      return 'not built again (--no-build): the last build is used';
    plainly(
      'node scripts/web.mjs build',
      process.execPath,
      ['scripts/web.mjs', 'build'],
      baseEnv(),
    );
    return 'built as the image builds it (node scripts/web.mjs build)';
  });

  const appUrl = addressAs(owner.address, 'app_login', appPassword);
  await step('start', async () => {
    const port = await freePort();
    origin = `http://localhost:${port}`;
    // Exactly the Render page's list, pointed at this computer (localhost may be http).
    const settings = {
      APP_ENV: 'staging',
      PUBLIC_BASE_URL: origin,
      EMAIL_FROM: 'test-copy@example.test',
      TRUSTED_PROXY: 'one',
      PLATFORM_DATABASE_URL: appUrl,
      PLATFORM_DATABASE_CA: caText,
      SUPABASE_URL: auth.url,
      SUPABASE_SECRET_KEY: secretKey,
      LOG_LEVEL: 'info',
    };
    if (refusal === 'certificate') delete settings.PLATFORM_DATABASE_CA;
    let output = '';
    const web = spawn(process.execPath, ['scripts/web.mjs', 'start', '--port', String(port)], {
      cwd: root,
      env: baseEnv({ NODE_ENV: 'production', ...settings }),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    started.web = web;
    web.stdout.on('data', (c) => (output += c));
    web.stderr.on('data', (c) => (output += c));
    const until = Date.now() + 90_000;
    for (;;) {
      const sentence = refusal === undefined ? null : refusalIn(output, refusal);
      if (sentence !== null) throw new RefusedAsExpected(sentence);
      if (web.exitCode !== null) throw new StepFailed(words.reasons.notReady('it stopped'), output);
      if (Date.now() > until)
        throw new StepFailed(words.reasons.notReady('no answer in 90 seconds'), output);
      let ready = false;
      try {
        const answer = await fetch(`${origin}/api/v1/health`, {
          signal: AbortSignal.timeout(10_000),
        });
        await answer.text();
        ready = answer.status === 200;
      } catch {
        // not yet
      }
      // Outside the catch, so a site that starts when it should have refused fails at once,
      // with its own words, not after 90 seconds as "no answer".
      if (ready && refusal !== undefined)
        throw new StepFailed(words.reasons.notRefused(refusals[refusal].setting), output);
      if (ready) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    if (/cannot start/i.test(output))
      throw new StepFailed(words.reasons.notReady('it said so'), output);
    return `the website answers on ${origin} in staging mode, on app_login, the certificate checked`;
  });

  await step('health', async () => {
    const answer = await fetch(`${origin}/api/v1/health`);
    const body = await answer.text();
    if (answer.status !== 200 || !/"status":"ok"/.test(body) || !/"database":"ok"/.test(body))
      throw new StepFailed(words.reasons.health(answer.status, body));
    return `200, ${body.slice(0, 120)}`;
  });

  // make-a-league.md, steps 7 and 8: both logins for this one command, the certificate checked.
  const toolEnv = baseEnv({
    MIGRATION_DATABASE_URL: ownerUrl.split('?')[0],
    PLATFORM_DATABASE_URL: appUrl,
    MIGRATION_DATABASE_CA: ca,
  });
  await step('league', async () => {
    const flags = [
      `--name '${leagueName}'`,
      `--short-name ${shortName}`,
      '--sport basketball',
      '--who-plays adults',
      '--city Springfield',
      '--time-zone America/Chicago',
      '--contact-email hello@example.test',
      `--owner-email ${ownerEmail}`,
      `--season '${seasonName}'`,
      '--season-starts 2026-12-01',
      '--season-ends 2027-03-31',
      '--as staff@example.test',
    ].join(' ');
    const out = await atTerminal(
      'npm run league:make -- --hosted',
      `npm run league:make -- --hosted ${flags}`,
      toolEnv,
      [{ after: /type the league’s short name: $/, send: shortName }],
    );
    if (/NOT as it should be/.test(out))
      throw new StepFailed(words.reasons.notSeen('everything as it should be'), out);
    return `league ${shortName} made, owner ${ownerEmail}`;
  });

  await step('signUp', async () => {
    started.browser = await launch();
    const page = await (await started.browser.newContext()).newPage();
    await page.goto(`${origin}/signup`);
    await page.getByLabel('Email').fill(ownerEmail);
    await Promise.all([
      page.waitForURL((url) => url.pathname === '/signup/code'),
      page.getByRole('button', { name: 'Email me a code' }).click(),
    ]);
    const read = await atTerminal(
      'node scripts/read-kept-emails.mjs --hosted',
      `node scripts/read-kept-emails.mjs --hosted --to ${ownerEmail}`,
      toolEnv,
      [],
      60,
    );
    const code = codeIn(read);
    if (code === null) throw new StepFailed(words.reasons.noCode, read);
    await page.getByLabel('Code').fill(code);
    await Promise.all([
      page.waitForURL((url) => url.pathname === '/signup/password'),
      page.getByRole('button', { name: 'Continue' }).click(),
    ]);
    await page.getByLabel('Password').fill(chosenPassword);
    await Promise.all([
      page.waitForURL((url) => url.pathname !== '/signup/password'),
      page.getByRole('button', { name: 'Save and sign in' }).click(),
    ]);
    const admin = await page.goto(`${origin}${leagueUrl({ slug: shortName }, 'admin')}`);
    if (admin?.status() !== 200) throw new StepFailed(words.reasons.notOwner(admin?.status()));
    return "signed up with the code the kept-emails script read; the league's admin area opens (200)";
  });

  await step('walk', async () => {
    started.visitor = await launch();
    const zone = 'America/Chicago'; // the league's, as made above
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(new Date());
    const yesterday = new Date(Date.parse(`${today}T12:00:00Z`) - 86_400_000)
      .toISOString()
      .slice(0, 10);
    const failures = [];
    const met = [];
    let checks = 0;
    const nothing = async () => {};
    try {
      await walkFirstTest({
        origin,
        browser: started.browser,
        visitorBrowser: started.visitor,
        league: { slug: shortName, name: leagueName, season: seasonName, draft: true },
        today,
        yesterday,
        signIn: signInWithPassword({ email: ownerEmail, password: chosenPassword }),
        note: (label, ok, detail = '') => {
          checks += 1;
          if (!ok) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
        },
        say: () => {},
        shot: nothing,
        picture: nothing,
        // What the tracker's page met on the way, shown if the walk fails.
        watchErrors: (on, where) => {
          on.on('pageerror', (e) => met.push(`(${where}) page error: ${e.message}`));
          on.on('response', (r) => {
            if (r.status() >= 400) met.push(`(${where}) answered ${r.status()}: ${r.url()}`);
          });
        },
      });
    } catch (error) {
      const stoppedAt = error?.at ?? 'starting';
      throw new StepFailed(
        words.reasons.walkStopped(stoppedAt, String(error?.message ?? error).split('\n')[0]),
        [...failures, ...met].join('\n'),
      );
    }
    if (failures.length > 0)
      throw new StepFailed(
        words.reasons.walkChecks(failures.length, checks),
        [...failures, ...met].join('\n'),
      );
    return words.walked(checks);
  });

  await step('checkCopy', async () => {
    const manifest = 'apps/web/.next/server/server-reference-manifest.json';
    const out = plainly(
      'npm run check:test-copy',
      'npm',
      ['run', '--silent', 'check:test-copy', '--', origin, '--manifest', manifest],
      baseEnv(),
    );
    const all = /All \d+ checks passed\./.exec(out);
    if (all === null) throw new StepFailed(words.reasons.notSeen('every line passed'), out);
    return `${all[0]} (the posted "be this person" form included, by the build's manifest)`;
  });
}

// Ctrl+C or a stop from outside still stops what was started.
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => {
    void stopAll().finally(() => process.exit(130));
  });

console.log(words.opening);
const before = gitStatus();
let ok = false;
let refused = null;
try {
  await rehearse();
  // Asked to see a refusal and none came: that is a failure.
  ok = refusal === undefined;
  if (!ok) console.error(words.reasons.notRefused(refusals[refusal].setting));
} catch (error) {
  refused = error instanceof RefusedAsExpected ? error.sentence : null;
  ok = refused !== null;
} finally {
  await stopAll();
}
const left = leftBehind(before, gitStatus());
if (left.length > 0) {
  console.error(words.leftInGit(left));
  ok = false;
} else console.log(words.stoppedClean);
if (ok && refused !== null) console.log(words.refusedPassed(refusals[refusal].setting, refused));
else if (ok) console.log(words.passed);
// The browser's and the fetches' handles would keep Node waiting: everything is stopped.
process.exit(ok ? 0 : 1);
