// Step 2.98's fix round (record 081: C1, C2, F4, F5): the bot check's box in a real browser,
// against the web app on its made-up stand-in (APP_ENV=test) with LOCAL_BOT_CHECK=
// made-up-turnstile, so the sign-in forms draw Turnstile's own box in explicit mode. Its
// script's address does not exist (`.invalid`); this test serves a MADE-UP copy of that
// script itself, so no request leaves this computer and no vendor is ever asked. Builds the
// app first unless given --no-build (npm run test:web:browser builds it once in
// web-exit-test.mjs).
//
// - Sign-in: a second try after a wrong password, in the same document, carries a FRESH
//   answer and is not refused by the check (the box was drawn again, its answer not spent).
// - Sign-up and forgotten password: a form refused by the check (an answer already spent)
//   draws a fresh box at once; the email typed is kept; the next try goes through.
// - The code screen: "Send a new code" stands behind the check, with a box of its own.
// - The form's button waits for the check's answer while scripts run.
// - A browser that cannot load the check sends the fixed word and is told so truly.
// - With scripts off: each form says its own words, and Continue with Google goes through
//   with no check at all.
// BOT_CHECK_PICTURES=<folder> also keeps pictures of the sign-in refusal at 390 wide and
// of the three forms with scripts off.
import path from 'node:path';
import {
  buildNext,
  freePort,
  launch,
  startNext,
  waitFor,
  whatWentWrong,
} from './web-browser-kit.mjs';

const failures = [];
const checked = [];
const note = (label, ok, detail = '') => {
  checked.push(label);
  if (!ok) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
};
const step = async (name, run) => {
  try {
    await run();
  } catch (error) {
    failures.push(`${name}: ${whatWentWrong(error)}`);
  }
};
const pictures = process.env.BOT_CHECK_PICTURES;
const picture = async (page, name) => {
  if (pictures) await page.screenshot({ path: path.join(pictures, `${name}.png`), fullPage: true });
};

// The made-up Turnstile's address (packages/providers made-up-turnstile-bot-check.ts).
const scriptAddress = 'https://bot-check.made-up.invalid/**';
const answerShape = /made-up-answer:[a-z-]+:[A-Za-z0-9-]+|did-not-load/;
const stamp = Date.now().toString(36);

/**
 * The made-up copy of Turnstile's script: render, reset and remove, each answer fresh. When
 * `first` is given, the first answer this copy gives is `first`, so a test can send an answer
 * already spent.
 */
const madeUpScript = (first) => `(() => {
  let count = 0;
  let first = ${JSON.stringify(first ?? null)};
  const boxes = new Map();
  const issue = (id) => {
    const box = boxes.get(id);
    if (box === undefined) return;
    count += 1;
    const tail = first ?? (id + '-' + count + '-' + Math.random().toString(36).slice(2, 10));
    first = null;
    const answer = 'made-up-answer:' + box.options.action + ':' + tail;
    setTimeout(() => boxes.has(id) && box.options.callback(answer), 800);
  };
  window.turnstile = {
    render(element, options) {
      count += 1;
      const id = 'w' + count + '-${stamp}';
      boxes.set(id, { element, options });
      element.setAttribute('data-made-up-box', id);
      issue(id);
      return id;
    },
    reset: issue,
    remove(id) {
      boxes.get(id)?.element.removeAttribute('data-made-up-box');
      boxes.delete(id);
    },
  };
})();`;

let built = true;
if (!process.argv.includes('--no-build')) {
  await step('building the web app', async () => {
    built = await buildNext();
    if (!built) throw new Error('next build failed or took over 10 minutes');
  });
}

let server;
let browser;
const origin = `http://localhost:${await freePort()}`;

if (built) {
  server = startNext(['start', '--port', new URL(origin).port], {
    APP_ENV: 'test',
    // Google set up, so "Continue with Google" is drawn (step 2.163, M27) and can be tapped.
    GOOGLE_SIGN_IN: 'on',
    PUBLIC_BASE_URL: origin,
    LOCAL_BOT_CHECK: 'made-up-turnstile',
  });
  await step('starting the server and the browser', async () => {
    await waitFor(`${origin}/signin`, server, [
      { address: '/signup' },
      { address: '/signin/forgot' },
      { address: '/signup/code' },
    ]);
    browser = await launch();
  });
}

/**
 * A page whose made-up script is served by this test; `script` is what the script's address
 * answers ('abort' for a network that blocks it). Every answer our server is sent is kept.
 */
async function openPage({ script = madeUpScript(), javaScriptEnabled = true, width = 1024 } = {}) {
  const context = await browser.newContext({
    javaScriptEnabled,
    viewport: { width, height: 900 },
  });
  const leftThisComputer = [];
  let loads = 0;
  // Nothing but our own server and the made-up script's address is ever asked.
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith(origin)) return route.continue();
    if (url.startsWith('https://bot-check.made-up.invalid/')) {
      if (script === 'abort') return route.abort('blockedbyclient');
      // A spent answer is given by the first copy served only; a page drawn anew gets fresh.
      loads += 1;
      const body = loads === 1 ? script : madeUpScript();
      return route.fulfill({ status: 200, contentType: 'text/javascript', body });
    }
    leftThisComputer.push(url);
    return route.abort('blockedbyclient');
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  const answers = [];
  const posts = [];
  page.on('request', (request) => {
    if (request.method() !== 'POST' || !request.url().startsWith(origin)) return;
    const body = request.postData() ?? '';
    posts.push(body);
    answers.push(answerShape.exec(body)?.[0] ?? '');
  });
  return { context, page, answers, posts, leftThisComputer, scriptAddress };
}

/** Sends the form holding `field` once its button no longer waits, and waits for the answer. */
async function send(page, form) {
  const button = page.locator(`${form} button[type="submit"]`);
  await page.waitForFunction(
    (selector) => document.querySelector(selector)?.disabled === false,
    `${form} button[type="submit"]`,
  );
  const answered = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().startsWith(origin),
  );
  answered.catch(() => undefined);
  await button.click();
  await answered;
  await page.waitForLoadState('networkidle');
  // The answer is drawn in the same document: a moment for React to put it on the page.
  await page.waitForTimeout(300);
}

// The screen's own refusal (Next.js's route announcer is an alert of its own, outside main).
const alertText = async (page) =>
  (await page.locator('main [role="alert"]').count()) === 0
    ? ''
    : await page.locator('main [role="alert"]').innerText();
const refusedByCheck = (text) => /that you are a person/i.test(text);

const signInForm = 'form:has(input[name="password"])';
const codeForm = 'form:has(input[name="email"])';
const resendForm = 'form:not(:has(input[name="code"]))';

if (browser) {
  await step('sign-in: a second try after a wrong password', async () => {
    const { context, page, answers, leftThisComputer } = await openPage({ width: 390 });
    try {
      await page.goto(`${origin}/signin`);
      // The button waits for the check's answer while scripts run.
      // Once the box is drawn (the page is the browser's), and before its answer comes.
      await page.locator('[data-made-up-box]').waitFor({ state: 'attached' });
      const waited = await page.evaluate(
        (selector) => document.querySelector(selector)?.disabled === true,
        `${signInForm} button[type="submit"]`,
      );
      note('sign-in: the button waits for the check', waited);
      note('sign-in: the box is drawn', (await page.locator('[data-made-up-box]').count()) === 1);
      await page.fill('input[name="email"]', 'nobody-here@example.test');
      await page.fill('input[name="password"]', 'not the password');
      await send(page, signInForm);
      const first = await alertText(page);
      note(
        'sign-in: the first try is the service’s refusal',
        /wrong email or password/i.test(first),
        first,
      );
      note(
        'sign-in: the email typed is kept',
        (await page.inputValue('input[name="email"]')) === 'nobody-here@example.test',
      );
      note(
        'sign-in: the box is drawn again',
        (await page.locator('[data-made-up-box]').count()) === 1,
      );
      await page.fill('input[name="password"]', 'still not the password');
      await send(page, signInForm);
      const second = await alertText(page);
      note('sign-in: the second try is not refused by the check', !refusedByCheck(second), second);
      note(
        'sign-in: each try carried a fresh answer',
        answers.length === 2 &&
          answers.every((a) => a.startsWith('made-up-answer:sign-in:')) &&
          answers[0] !== answers[1],
        answers.join(' / '),
      );
      note(
        'sign-in: nothing left this computer',
        leftThisComputer.length === 0,
        leftThisComputer.join(' '),
      );
    } finally {
      await context.close();
    }
  });

  for (const [name, address, action] of [
    ['sign-up', '/signup', 'sign-up'],
    ['forgotten password', '/signin/forgot', 'reset'],
  ]) {
    const spent = `spent-${action}-${stamp}`;
    const email = `new-${action}-${stamp}@example.test`;
    const again = `again-${action}-${stamp}@example.test`;
    await step(`${name}: the first code, and "Send a new code"`, async () => {
      const { context, page, answers } = await openPage({ script: madeUpScript(spent) });
      try {
        await page.goto(origin + address);
        await page.fill('input[name="email"]', email);
        await send(page, codeForm);
        note(
          `${name}: the code is asked for`,
          new URL(page.url()).pathname === '/signup/code',
          page.url(),
        );
        note(
          `${name}: the code screen draws a box`,
          (await page.locator('[data-made-up-box]').count()) === 1,
        );
        await send(page, resendForm);
        const said = await alertText(page);
        note(`${name}: "Send a new code" is not refused by the check`, !refusedByCheck(said), said);
        note(
          `${name}: the new code carried a fresh answer`,
          answers.length === 2 &&
            answers[0] !== answers[1] &&
            answers[1].startsWith(`made-up-answer:${action}:`),
          answers.join(' / '),
        );
      } finally {
        await context.close();
      }
    });
    await step(`${name}: a try after the check refused`, async () => {
      // The first answer this page is given is the one spent above: the check refuses it.
      const { context, page, answers } = await openPage({ script: madeUpScript(spent) });
      try {
        await page.goto(origin + address);
        await page.fill('input[name="email"]', again);
        await send(page, codeForm);
        const refused = await alertText(page);
        note(`${name}: an answer used twice is refused`, refusedByCheck(refused), refused);
        note(
          `${name}: the email typed is kept`,
          (await page.inputValue('input[name="email"]')) === again,
        );
        await send(page, codeForm);
        note(
          `${name}: the next try goes through with a fresh answer`,
          new URL(page.url()).pathname === '/signup/code' && answers[0] !== answers[1],
          `${page.url()} ${answers.join(' / ')}`,
        );
      } finally {
        await context.close();
      }
    });
  }

  /**
   * A real double click on the form's button, once it no longer waits: the second click is
   * in the same instant as the first. Gives the number of answers our server was sent.
   */
  async function doubleSend(page, form, posts) {
    const before = posts.length;
    await page.waitForFunction(
      (selector) => document.querySelector(selector)?.disabled === false,
      `${form} button[type="submit"]`,
    );
    const answered = page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().startsWith(origin),
    );
    answered.catch(() => undefined);
    await page.locator(`${form} button[type="submit"]`).dblclick();
    await answered;
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(300);
    return posts.length - before;
  }

  await step('a double click sends once', async () => {
    const twice = `twice-${stamp}@example.test`;
    for (const [name, address, form] of [
      ['sign-in', '/signin', signInForm],
      ['sign-up', '/signup', codeForm],
      ['forgotten password', '/signin/forgot', codeForm],
    ]) {
      const { context, page, posts } = await openPage();
      try {
        await page.goto(origin + address);
        await page.fill(
          'input[name="email"]',
          name === 'sign-in' ? twice : `${name.length}-${twice}`,
        );
        if (name === 'sign-in') await page.fill('input[name="password"]', 'not the password');
        const sent = await doubleSend(page, form, posts);
        note(`${name}: a double click sends one request`, sent === 1, `${sent} sent`);
        const said = await alertText(page);
        note(`${name}: a double click is not refused by the check`, !refusedByCheck(said), said);
        if (name === 'sign-up') {
          const resent = await doubleSend(page, resendForm, posts);
          note(
            '"Send a new code": a double click sends one request',
            resent === 1,
            `${resent} sent`,
          );
          const again = await alertText(page);
          note(
            '"Send a new code": a double click is not refused by the check',
            !refusedByCheck(again),
            again,
          );
        }
      } finally {
        await context.close();
      }
    }
  });

  await step('a browser that cannot load the check', async () => {
    const { context, page, answers } = await openPage({ script: 'abort', width: 390 });
    try {
      await page.goto(`${origin}/signin`);
      await page.fill('input[name="email"]', 'parent@example.test');
      await page.fill('input[name="password"]', 'a made-up password');
      await send(page, signInForm);
      const said = await alertText(page);
      note(
        'could not load: the fixed word was sent',
        answers[0] === 'did-not-load',
        answers.join(),
      );
      note(
        'could not load: the page says so truly',
        /could not load on this connection/.test(said),
        said,
      );
      note(
        'could not load: the email typed is kept',
        (await page.inputValue('input[name="email"]')) === 'parent@example.test',
      );
    } finally {
      await context.close();
    }
  });

  await step('the refusal as drawn, at 390 wide', async () => {
    const { context, page } = await openPage({ width: 390 });
    try {
      await page.goto(`${origin}/signin?problem=botCheckFailed`);
      const said = await alertText(page);
      note(
        'the refusal says the lead’s words',
        said ===
          'We could not check that you are a person. Please wait a moment and try again. If it keeps happening, turn on scripts for this site, or use Continue with Google.',
        said,
      );
      const look = await page.evaluate(() => {
        const alert = document.querySelector('main [role="alert"]');
        const probe = document.createElement('span');
        probe.style.color = 'var(--color-danger)';
        alert.parentElement.append(probe);
        const danger = getComputedStyle(probe).color;
        probe.remove();
        return {
          color: getComputedStyle(alert).color,
          mark: getComputedStyle(alert, '::before').content,
          danger,
        };
      });
      note('the refusal has its warning mark', look.mark.includes('!'), look.mark);
      note('the refusal is in the danger color', look.color === look.danger, JSON.stringify(look));
      await picture(page, 'sign-in-refusal-390');
    } finally {
      await context.close();
    }
  });

  await step('with scripts off', async () => {
    const { context, page, posts } = await openPage({ javaScriptEnabled: false, width: 390 });
    try {
      for (const [address, words, shot] of [
        [
          '/signin',
          /^Signing in with a password checks .* Continue with Google works without scripts and has no check\.$/,
          'no-scripts-sign-in',
        ],
        [
          '/signup',
          /^Creating an account first checks .* Continue with Google works without scripts and has no check\.$/,
          'no-scripts-sign-up',
        ],
        [
          '/signin/forgot',
          /^Asking for a code to choose a new password first checks .*this site\.$/,
          'no-scripts-forgot',
        ],
      ]) {
        await page.goto(origin + address);
        const shown = (await page.locator('noscript p').allInnerTexts()).join(' ').trim();
        note(`${address}: says its own words with scripts off`, words.test(shown), shown);
        await picture(page, shot);
      }
      // "Already have an account? Sign in" is a control 44 high, as every other there.
      await page.goto(`${origin}/signup`);
      const high = await page
        .locator('a[href^="/signin"]')
        .evaluate((a) => a.getBoundingClientRect().height);
      note('/signup: "Already have an account? Sign in" is 44 high', high >= 44, String(high));
      // Continue with Google is a plain form: it goes through without scripts and no check.
      await page.goto(`${origin}/signin`);
      const returned = page.waitForRequest(
        (r) => r.url().startsWith(`${origin}/`) && /[?&]code=/.test(r.url()),
      );
      await page.locator('form:not(:has(input[name="password"])) button[type="submit"]').click();
      await returned;
      await page.waitForLoadState('load');
      note(
        // The stand-in sends the browser straight back to our return address with a code (it
        // has no Google of its own to finish at): reaching it is the form going through.
        'with scripts off Continue with Google goes on to Google, with no answer sent',
        posts.length === 1 && !answerShape.test(posts[0]) && posts[0].includes('ACTION'),
        `${page.url()} ${posts.length}`,
      );
    } finally {
      await context.close();
    }
  });
}

await browser?.close();
server?.child.kill();

if (failures.length > 0) {
  console.error(`Bot check box browser test failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`Bot check box browser test passed (${checked.length} checks).`);
