// The sign-in service check (step 2.206): where it may run, and the checks themselves.
// scripts/check-sign-in-service.mjs is the thin command around these two.
//
// `settingsFor` decides, before anything connects, whether the run may go ahead: only
// with --hosted, at a terminal, with SUPABASE_URL and SUPABASE_SECRET_KEY from the
// environment, and only for an address the website's own guard against the tracker's
// project lets through (platformServiceProblem and trackerProjectProblem, record 055).
//
// `runChecks` asks, through the adapter's own client (gotrue-client.ts), every call
// the adapter makes, and prints one line for each of record 018's checks a script can
// make: "as expected", or the call, the status and the error code that differed. What
// is "as expected" is what the adapter relies on and what the fake that its tests run
// against answers (fake-supabase-auth.test-helper.ts): a line that differs means the
// adapter or the fake is wrong (record 018, "Revisit if"). It uses one made-up user,
// with an address ending .test, and removes it at the end whatever happened before.
//
// Nothing printed holds an address, a key, a token, a code or a password: every line
// comes from check-sign-in-service.messages.mjs with only statuses, Supabase's error
// codes (kept only when they are short identifiers), counts and times, and every line
// is also checked against each secret the run holds before it is printed.
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { parseArgs } from 'node:util';
import {
  emailConfirmationOf,
  platformServiceProblem,
  signInDefaults,
  SupabaseAuthTimedOut,
  SupabaseAuthUnexpected,
  trackerProjectProblem,
} from '@srleagues/providers';
import * as words from './check-sign-in-service.messages.mjs';

export const urlSetting = 'SUPABASE_URL';
export const keySetting = 'SUPABASE_SECRET_KEY';

const given = (value) =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;

/**
 * Whether the run may go ahead: `{ settings }`, or `{ problems, exitCode }` with the
 * lines to print. Reads text only; never connects.
 *
 * - `argv`: the options after the script's name.
 * - `env`: the environment (DATABASE_URL is read too, by the website's guard).
 * - `terminal`: whether a person is at a terminal.
 * - `trackerProject`: the tracker's project from supabase/site.json (trackerProjectFor).
 */
export function settingsFor({ argv, env, terminal, trackerProject }) {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: { hosted: { type: 'boolean', default: false }, help: { type: 'boolean' } },
      strict: true,
    }));
  } catch {
    return { problems: words.usage, exitCode: 2 };
  }
  if (values.help) return { problems: words.usage, exitCode: 0 };
  const projectUrl = given(env[urlSetting]);
  // Without --hosted, only the stand-in on this computer, as the tests serve it.
  const standIn = projectUrl !== undefined && standInAddress(projectUrl);
  if (!values.hosted && !standIn) {
    return { problems: [words.hostedNeeded, '', ...words.usage], exitCode: 2 };
  }
  // A terminal is not enough: a pseudo-terminal under CI still has no person watching.
  const unattended =
    !terminal || given(env['CI']) !== undefined || given(env['GITHUB_ACTIONS']) !== undefined;
  if (unattended) return { problems: [words.needsTerminal], exitCode: 2 };

  const problems = [];
  const secretKey = given(env[keySetting]);
  if (projectUrl === undefined) problems.push(words.settingMissing(urlSetting));
  if (secretKey === undefined) problems.push(words.settingMissing(keySetting));
  else if (secretKey.length < 16) problems.push(words.keyTooShort);

  // The website's own guard, as its settings check runs it in staging and production.
  const facts = { env, appEnv: undefined, hosted: true, trackerProject };
  const fileProblem = trackerProjectProblem([urlSetting], facts);
  if (fileProblem !== undefined) problems.push(fileProblem);
  if (projectUrl !== undefined) {
    const guarded = platformServiceProblem(urlSetting, projectUrl, facts);
    if (guarded !== undefined) problems.push(guarded);
    // The secret key goes as a bearer to this address: with --hosted, a project's own only.
    else if (values.hosted && !hostedAddress(projectUrl)) problems.push(words.hostedAddressForm);
  }
  if (problems.length > 0) return { problems: [...problems, words.nothingAsked], exitCode: 2 };
  return { settings: { projectUrl, secretKey, local: !values.hosted } };
}

/**
 * With --hosted, the one address taken: a Supabase project's own,
 * https://<its 20-character reference>.supabase.co, exactly, with nothing after it (no
 * path, port, login, query or fragment), so the key can go to no other host.
 */
const hostedAddress = (text) => /^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(text);
/** Without --hosted, the stand-in on this computer only: plain http to 127.0.0.1 and a port. */
const standInAddress = (text) => /^http:\/\/127\.0\.0\.1:\d{1,5}$/.test(text);

/** A check's answer differed from what our code expects: `detail` says how, in safe words. */
class Differed extends Error {
  constructor(detail) {
    super('differed');
    this.detail = detail;
  }
}
/** A check that cannot be made, because a line above it that it needs differed. */
class NotChecked extends Error {}
/** An answer we expect from some projects that says how this one is set: not a difference. */
class Noted extends Error {
  constructor(note) {
    super('noted');
    this.note = note;
  }
}

/** Supabase's error code, only when it is a short identifier; anything else is not repeated. */
const safeCode = (code) =>
  code === undefined ? undefined : /^[a-z][a-z0-9_]{0,39}$/i.test(code) ? code : words.otherCode;

/** What a call that threw says, in our words: the client's errors carry no personal content. */
function threw(call, error) {
  if (error instanceof Differed || error instanceof NotChecked) return error;
  if (error instanceof SupabaseAuthTimedOut) return new Differed(words.noAnswerInTime(call));
  if (error instanceof SupabaseAuthUnexpected) {
    const { status } = error;
    if (status === undefined) {
      // The client's own fixed words say which (gotrue-client.ts, `send`).
      if (/: no connection/.test(error.message)) return new Differed(words.noConnection(call));
      if (/: the answer was cut off/.test(error.message)) return new Differed(words.cutOff(call));
      return new Differed(words.answeredShape(call));
    }
    if (status >= 300 && status < 400) return new Differed(words.answeredRedirect(call, status));
    return new Differed(words.answeredFailure(call, status, safeCode(error.code)));
  }
  return new Differed(words.ourOwnFault(call));
}

/** One call through the client, every failure turned into what differed. */
async function ask(call, make) {
  try {
    return await make();
  } catch (error) {
    throw threw(call, error);
  }
}

/** The answer's value; a refusal differs. */
function accepted(call, answer) {
  if (!answer.ok) {
    throw new Differed(
      words.refusedWith(call, answer.refusal.status, safeCode(answer.refusal.code)),
    );
  }
  return answer.value;
}

/** The refusal, with `code` when one is named; an acceptance or another code differs. */
function refused(call, answer, code) {
  if (answer.ok) throw new Differed(words.acceptedInstead(call));
  const { status } = answer.refusal;
  const found = answer.refusal.code;
  if ((code !== undefined && found !== code) || status === 429) {
    throw new Differed(words.refusedWith(call, status, safeCode(found)));
  }
  return answer.refusal;
}

const needed = (value) => {
  if (value === undefined || value === null) throw new NotChecked();
  return value;
};

const hex = (bytes) => randomBytes(bytes).toString('hex');
const b64 = (value) => Buffer.from(value, 'utf8').toString('base64url');
const lowerLetters = (count) =>
  Array.from({ length: count }, () => String.fromCharCode(97 + randomInt(26))).join('');

/** The middle and the slowest of some times, in whole milliseconds. */
function summary(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const middle = sorted[Math.floor((sorted.length - 1) / 2)] ?? 0;
  return {
    middle: Math.round(middle),
    slowest: Math.round(sorted.at(-1) ?? 0),
    count: sorted.length,
  };
}

/** The command's exit code: 0 only when every check was as expected and the made-up user is gone. */
export const exitCodeFor = ({ differed, removed }) => (differed === 0 && removed ? 0 : 1);

/** How much room the password floor must keep above the slowest wrong try (018 #8). */
export const floorRoomMs = 250;
/** Record 018's settings: a project JWT expiry of 3600 seconds. */
const tokenSeconds = 3600;
/** How far this computer's clock may be from the service's when the token's life is judged. */
const clockRoomSeconds = 300;
/** A password Supabase's leaked-password check knows. */
const leakedPassword = 'password1234';

/**
 * Runs every check and prints its line, then what was measured, the result and the
 * person's checks. Returns `{ total, differed, removed }`.
 *
 * - `client`: the adapter's own client (createGoTrueClient) for the project.
 * - `print`: prints one line.
 * - `signal`: aborted by Ctrl+C; the checks left are not made, the clean-up still is.
 * - `minuteMs`: how long the 300 user calls are spread over (60 000; tests pass 0).
 * - `userCalls`: how many of them (300).
 * - `timingTries`: password and reset tries timed each way (5: few enough for
 *   Supabase's own limits per network before they are raised, 018 #4).
 */
export async function runChecks({
  client,
  print,
  signal = new AbortController().signal,
  minuteMs = 60_000,
  userCalls = 300,
  timingTries = 5,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  floorMs = signInDefaults.passwordMinMilliseconds,
  withheld = [],
}) {
  const runId = hex(6);
  const email = `check-sign-in-${runId}@sign-in-check.test`;
  const nobody = `check-sign-in-${runId}-nobody@sign-in-check.test`;
  const secrets = new Set([email, nobody, `check-sign-in-${runId}`, ...withheld]);
  const keep = (...values) => {
    for (const value of values)
      if (typeof value === 'string' && value.length >= 4) secrets.add(value);
  };
  const keepSession = (session) => {
    keep(session.accessToken, session.refreshToken, session.sessionId, session.user.id);
    return session;
  };
  /** Every line is checked against what the run holds, so a slip can never show one. */
  const say = (text) => {
    let safe = text;
    for (const secret of secrets)
      if (safe.includes(secret)) safe = safe.split(secret).join('[withheld]');
    print(safe);
  };

  const results = [];
  let notes = 0;
  const check = async (label, run) => {
    let detail;
    if (signal.aborted) detail = words.stoppedHere;
    else {
      try {
        await run();
      } catch (error) {
        if (error instanceof Noted) {
          // Neither as expected nor a difference: counted apart, the exit code unchanged.
          notes += 1;
          say(words.line(words.noted, error.note));
          return;
        }
        detail = error instanceof NotChecked ? words.notChecked : threw('a call', error).detail;
      }
    }
    results.push(detail === undefined);
    say(
      detail === undefined
        ? words.line(words.asExpected, label)
        : words.line(words.differed, label, detail),
    );
  };
  const group = (name) => {
    say('');
    say(name);
  };

  /** Signs the made-up user in with a password; the session, or what differed. */
  const signIn = async (password) =>
    keepSession(
      accepted(
        'password sign-in',
        await ask('password sign-in', () => client.signInWithPassword(email, password)),
      ),
    );
  const userAnswer = (session) => ask('user', () => client.user(session.accessToken));
  const isEnded = async (session) =>
    refused('user', await userAnswer(session), 'session_not_found');
  const isLive = async (session) => accepted('user', await userAnswer(session));

  const state = {};
  const measured = {};
  let userId;
  // Whether the first sign-up code was asked for and not refused: a refusal should
  // make no user, but the clean-up still looks for one.
  let mayExist = false;

  // ---- The project's settings -------------------------------------------------------
  group(words.groups.settings);
  let settingsBody;
  await check(words.checks.settingsKey, async () => {
    settingsBody = accepted('settings', await ask('settings', () => client.settings()));
    if (typeof settingsBody !== 'object' || settingsBody === null || Array.isArray(settingsBody)) {
      throw new Differed(words.settingsShape);
    }
  });
  await check(words.checks.confirmEmail, async () => {
    const answer = await emailConfirmationOf(client);
    if (answer === 'on') return;
    if (answer === 'off') throw new Differed(words.autoconfirmOff);
    throw new Differed(words.confirmationUnknown(answer.unknown, answer.status));
  });
  await check(words.checks.signUpsOn, async () => {
    if (needed(settingsBody)['disable_signup'] !== false) throw new Differed(words.signUpsOff);
  });
  await check(words.checks.providers, async () => {
    const external = needed(settingsBody)['external'];
    if (typeof external !== 'object' || external === null) throw new Differed(words.settingsShape);
    const wrong = Object.entries(external)
      .filter(([name, on]) => (on === true) !== (name === 'email' || name === 'google'))
      .map(([name]) => name);
    for (const name of ['email', 'google']) if (!(name in external)) wrong.push(name);
    // Provider names are Supabase's fixed words; any other text is not repeated.
    if (wrong.length > 0) {
      throw new Differed(
        words.providersDiffer(wrong.map((name) => safeCode(name) ?? words.otherCode)),
      );
    }
  });

  try {
    // ---- Sign-up codes ----------------------------------------------------------------
    group(words.groups.codes);
    let firstCode;
    await check(words.checks.signUpCode, async () => {
      mayExist = true;
      const answer = await ask('generate_link', () => client.generateCode('magiclink', email));
      if (!answer.ok) mayExist = false;
      firstCode = accepted('generate_link', answer);
      userId = firstCode.user.id;
      keep(firstCode.code, userId);
    });
    await check(words.checks.signUpType, async () => {
      if (needed(firstCode).verifyType !== 'signup') {
        throw new Differed(words.wrongVerifyType(firstCode.verifyType));
      }
    });
    await check(words.checks.codeLength, async () => {
      if (!/^\d{6}$/.test(needed(firstCode).code)) throw new Differed(words.codeNotSixDigits);
    });
    await check(words.checks.codeAgain, async () => {
      needed(firstCode);
      state.code = accepted(
        'generate_link',
        await ask('generate_link', () => client.generateCode('magiclink', email)),
      );
      keep(state.code.code);
      if (state.code.verifyType !== 'signup') {
        throw new Differed(words.wrongVerifyType(state.code.verifyType));
      }
    });
    await check(words.checks.wrongCode, async () => {
      const real = needed(state.code).code;
      const wrong = String((Number(real) + 1 + randomInt(999_998)) % 1_000_000).padStart(6, '0');
      keep(wrong);
      refused(
        'verify',
        await ask('verify', () => client.verifyCode('signup', email, wrong)),
        'otp_expired',
      );
    });
    await check(words.checks.noCodeSent, async () => {
      refused('verify', await ask('verify', () => client.verifyNothing(hex(28))), 'otp_expired');
    });
    await check(words.checks.rightCode, async () => {
      const { code, verifyType } = needed(state.code);
      state.first = keepSession(
        accepted('verify', await ask('verify', () => client.verifyCode(verifyType, email, code))),
      );
    });
    await check(words.checks.confirmedCode, async () => {
      // The user is confirmed now, as when a code was checked and the sign-up never
      // finished: a code asked for again is to be checked as magiclink, as the adapter does.
      needed(state.first);
      const again = accepted(
        'generate_link',
        await ask('generate_link', () => client.generateCode('magiclink', email)),
      );
      keep(again.code);
      if (again.verifyType !== 'magiclink') {
        throw new Differed(words.wrongVerifyType(again.verifyType));
      }
      keepSession(
        accepted(
          'verify',
          await ask('verify', () => client.verifyCode('magiclink', email, again.code)),
        ),
      );
    });
    await check(words.checks.tokenLife, async () => {
      // The service's expires_at against this computer's clock: five minutes are allowed,
      // so a clock off by a minute or two gives no false difference.
      const seconds = Math.round(
        (needed(state.first).accessExpiresAt.getTime() - Date.now()) / 1000,
      );
      if (Math.abs(seconds - tokenSeconds) > clockRoomSeconds) {
        throw new Differed(words.tokenLifeWas(seconds));
      }
    });
    await check(words.checks.user, async () => {
      const user = await isLive(needed(state.first));
      if (user.id !== userId) throw new Differed(words.otherUser);
      if (user.emailConfirmedAt === null) throw new Differed(words.notConfirmed);
    });
    await check(words.checks.madeUpToken, async () => {
      const claims = {
        aud: 'authenticated',
        exp: Math.floor(Date.now() / 1000) + 3600,
        sub: randomUUID(),
        role: 'authenticated',
        session_id: randomUUID(),
      };
      const madeUp = `${b64('{"alg":"HS256","typ":"JWT"}')}.${b64(JSON.stringify(claims))}.${b64(hex(16))}`;
      keep(madeUp);
      refused('user', await ask('user', () => client.user(madeUp)), 'bad_jwt');
    });

    // ---- Passwords --------------------------------------------------------------------
    group(words.groups.passwords);
    const setPassword = async (session, password) => {
      keep(password);
      return ask('user update', () => client.setPassword(session.accessToken, password));
    };
    await check(words.checks.shortPassword, async () => {
      const refusal = refused(
        'user update',
        await setPassword(needed(state.first), `${hex(3)}x`),
        'weak_password',
      );
      if (!refusal.reasons.includes('length')) {
        throw new Differed(words.refusedWith('user update', refusal.status, 'weak_password'));
      }
    });
    const eight = lowerLetters(8);
    await check(words.checks.eightLetters, async () => {
      accepted('user update', await setPassword(needed(state.first), eight));
    });
    await check(words.checks.samePassword, async () => {
      refused('user update', await setPassword(needed(state.first), eight), 'same_password');
    });
    await check(words.checks.leakedPassword, async () => {
      const answer = await setPassword(needed(state.first), leakedPassword);
      // The protection is a paid setting, the founder's call (018 #10): a project without
      // it takes the password, which is noted on a line of its own, not a difference.
      if (answer.ok) throw new Noted(words.leakedOff);
      const refusal = refused('user update', answer, 'weak_password');
      if (!refusal.reasons.includes('pwned')) {
        throw new Differed(words.refusedWith('user update', refusal.status, 'weak_password'));
      }
    });
    const password = `Check-${hex(12)}`;
    await check(words.checks.newPassword, async () => {
      // Also puts back a known password if the leaked one was taken above.
      accepted('user update', await setPassword(needed(state.first), password));
      state.password = password;
    });
    await check(words.checks.passwordSignIn, async () => {
      state.second = await signIn(needed(state.password));
      if (state.second.user.id !== userId) throw new Differed(words.otherUser);
    });
    await check(words.checks.wrongPassword, async () => {
      needed(state.password);
      const wrong = `Wrong-${hex(12)}`;
      keep(wrong);
      refused(
        'password sign-in',
        await ask('password sign-in', () => client.signInWithPassword(email, wrong)),
        'invalid_credentials',
      );
    });
    await check(words.checks.noAccount, async () => {
      const any = `Any-${hex(12)}`;
      keep(any);
      refused(
        'password sign-in',
        await ask('password sign-in', () => client.signInWithPassword(nobody, any)),
        'invalid_credentials',
      );
    });
    // 80 bytes: Supabase's hash reads 72 (T-225).
    const long = hex(40);
    await check(words.checks.longPassword, async () => {
      needed(state.first);
      accepted('user update', await setPassword(needed(state.second), long));
      state.long = long;
    });
    await check(words.checks.passwordEndsOthers, async () => {
      needed(state.long);
      await isEnded(state.first);
      await isLive(state.second);
    });
    await check(words.checks.longPasswordCut, async () => {
      const cut = needed(state.long).slice(0, 72);
      keep(cut);
      const third = await signIn(cut);
      // Puts a password of ordinary length back for the checks below.
      const settled = `Check-${hex(12)}`;
      accepted('user update', await setPassword(needed(state.second), settled));
      state.password = settled;
      await isEnded(third);
    });

    // ---- Sessions ---------------------------------------------------------------------
    group(words.groups.sessions);
    await check(words.checks.logoutOthers, async () => {
      const base = needed(state.second);
      const other = await signIn(needed(state.password));
      accepted('logout', await ask('logout', () => client.signOut(base.accessToken, 'others')));
      await isEnded(other);
      await isLive(base);
    });
    await check(words.checks.logoutLocal, async () => {
      const one = await signIn(needed(state.password));
      accepted('logout', await ask('logout', () => client.signOut(one.accessToken, 'local')));
      await isEnded(one);
    });
    await check(words.checks.refresh, async () => {
      const before = await signIn(needed(state.password));
      const after = keepSession(
        accepted('refresh', await ask('refresh', () => client.refresh(before.refreshToken))),
      );
      if (after.sessionId !== before.sessionId) throw new Differed(words.otherSession);
      await isLive(after);
      state.usedRefresh = before.refreshToken;
    });
    await check(words.checks.madeUpRefresh, async () => {
      const madeUp = hex(8);
      keep(madeUp);
      refused(
        'refresh',
        await ask('refresh', () => client.refresh(madeUp)),
        'refresh_token_not_found',
      );
    });
    await check(words.checks.refreshReuse, async () => {
      const used = needed(state.usedRefresh);
      refused(
        'refresh',
        await ask('refresh', () => client.refresh(used)),
        'refresh_token_already_used',
      );
    });
    await check(words.checks.logoutGlobal, async () => {
      const one = await signIn(needed(state.password));
      const another = await signIn(state.password);
      accepted('logout', await ask('logout', () => client.signOut(one.accessToken, 'global')));
      await isEnded(another);
      await isEnded(one);
    });
    await check(words.checks.madeUpGoogle, async () => {
      refused(
        'pkce exchange',
        await ask('pkce exchange', () => client.exchangeCode(randomUUID(), hex(32))),
        'flow_state_not_found',
      );
    });

    // ---- Resetting a password ---------------------------------------------------------
    group(words.groups.reset);
    await check(words.checks.resetNoUser, async () => {
      // Any refusal but "busy" is read as "no such user" by the adapter.
      refused(
        'generate_link',
        await ask('generate_link', () => client.generateCode('recovery', nobody)),
      );
    });
    await check(words.checks.resetByCode, async () => {
      needed(state.password);
      const code = accepted(
        'generate_link',
        await ask('generate_link', () => client.generateCode('recovery', email)),
      );
      keep(code.code);
      if (code.verifyType !== 'recovery')
        throw new Differed(words.wrongVerifyType(code.verifyType));
      const proof = keepSession(
        accepted(
          'verify',
          await ask('verify', () => client.verifyCode('recovery', email, code.code)),
        ),
      );
      const reset = `Check-${hex(12)}`;
      accepted('user update', await setPassword(proof, reset));
      state.password = reset;
      state.last = await signIn(reset);
    });

    // ---- Timing (T-68) ----------------------------------------------------------------
    group(words.groups.timing);
    await check(words.checks.passwordTiming, async () => {
      needed(state.password);
      const withUser = [];
      const without = [];
      for (let i = 0; i < timingTries && !signal.aborted; i += 1) {
        for (const [address, samples] of [
          [email, withUser],
          [nobody, without],
        ]) {
          const wrong = `Wrong-${hex(12)}`;
          keep(wrong);
          const started = performance.now();
          const answer = await ask('password sign-in', () =>
            client.signInWithPassword(address, wrong),
          );
          samples.push(performance.now() - started);
          refused('password sign-in', answer, 'invalid_credentials');
        }
      }
      measured.wrongWithUser = summary(withUser);
      measured.wrongWithout = summary(without);
      const slowest = Math.max(measured.wrongWithUser.slowest, measured.wrongWithout.slowest);
      if (slowest > floorMs - floorRoomMs) {
        throw new Differed(words.slowerThanFloor(slowest, floorMs - floorRoomMs));
      }
    });
    await check(words.checks.resetTiming, async () => {
      needed(state.password);
      const withUser = [];
      const without = [];
      for (let i = 0; i < timingTries && !signal.aborted; i += 1) {
        let started = performance.now();
        const found = await ask('generate_link', () => client.generateCode('recovery', email));
        withUser.push(performance.now() - started);
        if (found.ok) keep(found.value.code);
        accepted('generate_link', found);
        started = performance.now();
        const none = await ask('generate_link', () => client.generateCode('recovery', nobody));
        without.push(performance.now() - started);
        refused('generate_link', none);
      }
      measured.resetWithUser = summary(withUser);
      measured.resetWithout = summary(without);
    });

    // ---- Every signed-in request (M10) ------------------------------------------------
    group(words.groups.everyRequest);
    await check(words.checks.userBurst, async () => {
      const session = needed(state.last);
      const times = [];
      let failures = 0;
      let first;
      const started = performance.now();
      for (let i = 0; i < userCalls && !signal.aborted; i += 1) {
        const due = started + (i * minuteMs) / userCalls;
        const ahead = due - performance.now();
        if (ahead > 0) await wait(ahead);
        const before = performance.now();
        try {
          const answer = await userAnswer(session);
          times.push(performance.now() - before);
          if (!answer.ok || answer.value.id !== userId) {
            failures += 1;
            first ??= answer.ok
              ? words.otherUser
              : words.refusedWith('user', answer.refusal.status, safeCode(answer.refusal.code));
          }
        } catch (error) {
          failures += 1;
          first ??= threw('user', error).detail;
        }
      }
      measured.userCall = summary(times);
      if (signal.aborted) throw new Differed(words.stoppedHere);
      if (failures > 0) throw new Differed(words.refusedCalls(failures, userCalls, first));
    });
  } finally {
    // ---- Clean-up: whatever happened above --------------------------------------------
    group(words.groups.cleanUp);
    let removed = false;
    if (userId === undefined) {
      // The first code's answer could not be read, or was refused: look for the user all
      // the same. Not found, or never asked for and not findable, is nothing left behind.
      try {
        const found = await client.generateCode('recovery', email);
        if (found.ok) {
          keep(found.value.code);
          userId = found.value.user.id;
        } else removed = found.refusal.status === 404 || !mayExist;
      } catch {
        removed = !mayExist;
      }
    }
    if (userId !== undefined) {
      // Never stopped by Ctrl+C: this is what a stop waits for.
      keep(userId);
      const id = userId;
      let detail;
      try {
        accepted('delete user', await ask('delete user', () => client.deleteUser(id)));
        const after = await ask('generate_link', () => client.generateCode('recovery', email));
        if (after.ok) {
          keep(after.value.code);
          detail = words.stillThere;
        } else refused('generate_link', after);
      } catch (error) {
        detail = threw('delete user', error).detail;
      }
      removed = detail === undefined;
      results.push(removed);
      say(
        removed
          ? words.line(words.asExpected, words.checks.removed)
          : words.line(words.differed, words.checks.removed, detail),
      );
    }
    state.removed = removed;
  }

  // ---- What was measured, the result, and the person's checks --------------------------
  say('');
  say(words.measuredTitle);
  const lines = [
    [words.timedWrongWithUser, measured.wrongWithUser],
    [words.timedWrongWithout, measured.wrongWithout],
    [words.timedResetWithUser, measured.resetWithUser],
    [words.timedResetWithout, measured.resetWithout],
    [words.timedUserCall, measured.userCall],
  ].filter(([, times]) => times !== undefined && times.count > 0);
  if (lines.length === 0) say(words.notMeasured);
  for (const [what, times] of lines) say(words.times(what, times));
  say(words.floorIs(floorMs));

  const total = results.length;
  const differedCount = results.filter((ok) => !ok).length;
  say('');
  say(differedCount === 0 ? words.allAsExpected(total) : words.someDiffered(differedCount, total));
  if (notes > 0) say(words.someNoted(notes));
  if (!state.removed) for (const text of words.notRemoved) say(text);
  say('');
  say(words.personTitle);
  for (const text of words.personChecks) say(text);
  return { total, differed: differedCount, removed: state.removed };
}
