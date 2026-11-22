// Step 2.98 (T-79, record 081): the script policy in a real browser, against the web app on its
// made-up stand-in (APP_ENV=test). Nothing leaves this computer; every league, game and person
// is made up. Builds the app first unless given --no-build (npm run test:web:browser builds it
// once in web-exit-test.mjs).
//
// - Every page a visitor, an owner and a scorekeeper open runs with the policy: the browser
//   reports no script, frame or plugin it refused, and the page's own scripts ran (React took
//   the page over, and Next.js's inline page data was read), so the nonce is on all of them.
// - A script put into a page any other way does not run, and the browser says it refused it:
//   an inline <script> added to the page, an inline event handler, and a script from another
//   site, as an injected name or post would try.
// - The answer to every page names the policy with a nonce of its own, and HTTPS for a year.
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

// The made-up game under way (stand-in-world-seed.ts) and the made-up people's cookies
// (stand-in-ports.ts).
const liveGame = '01900000-0000-7000-8000-006a00000002';
const owner = 'local-owner-token';
const keeper = 'local-scorekeeper-token';

/** [who, address]: the pages opened, each with the policy on. */
const pages = [
  [null, '/'],
  [null, '/find'],
  [null, '/north-valley'],
  [null, '/north-valley/schedule'],
  [null, '/north-valley/standings'],
  [null, '/north-valley/stats'],
  [null, '/north-valley/teams'],
  [null, `/north-valley/games/${liveGame}`],
  [null, '/signin'],
  [null, '/signup'],
  [null, '/signin/forgot'],
  [null, '/nobody-has-this'],
  [owner, '/account'],
  [owner, '/north-valley/admin'],
  [owner, '/north-valley/admin/games'],
  [owner, '/north-valley/admin/schedule'],
  [owner, '/north-valley/admin/settings'],
  [keeper, `/north-valley/score/${liveGame}`],
];

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
    PUBLIC_BASE_URL: origin,
  });
  await step('starting the server and the browser', async () => {
    await waitFor(`${origin}/`, server, [
      { address: '/north-valley' },
      { address: `/north-valley/score/${liveGame}`, cookie: `srl_session=${keeper}` },
    ]);
    browser = await launch();
  });
}

/**
 * Before any of the page's own scripts: every refusal the browser reports for this page is
 * written down (the securitypolicyviolation event), so the test can read them.
 */
function listenForRefusals() {
  window.__refused = [];
  document.addEventListener('securitypolicyviolation', (event) => {
    window.__refused.push(`${event.effectiveDirective} ${event.blockedURI || 'inline'}`);
  });
}

/** A context for `who` (a session cookie, or a visitor), listening for refusals. */
async function contextFor(who) {
  const context = await browser.newContext();
  if (who !== null) await context.addCookies([{ name: 'srl_session', value: who, url: origin }]);
  await context.addInitScript(listenForRefusals);
  return context;
}

/** Whether React has taken the page over: its own key on the page's elements. */
const reactRan = (page) =>
  page.evaluate(() =>
    [...document.body.querySelectorAll('*')].some((element) =>
      Object.keys(element).some((key) => key.startsWith('__reactFiber')),
    ),
  );

/** How long a loaded page's own scripts get to run: they run at once when the nonce is right. */
const scriptsWait = 5_000;

const nonceShape = /'nonce-([A-Za-z0-9+/]{24})'/;

if (browser) {
  const seen = new Set();
  for (const [who, address] of pages) {
    await step(`opening ${address}`, async () => {
      const context = await contextFor(who);
      const page = await context.newPage();
      page.setDefaultTimeout(30_000);
      const logged = [];
      page.on('console', (message) => {
        if (/content security policy/i.test(message.text())) logged.push(message.text());
      });
      try {
        const answer = await page.goto(origin + address);
        await page.waitForLoadState('load');
        await page.waitForFunction(() => document.readyState === 'complete');
        const policy = (await answer?.headerValue('content-security-policy')) ?? '';
        const nonce = nonceShape.exec(policy)?.[1];
        note(`${address}: the policy carries a nonce`, nonce !== undefined, policy);
        note(`${address}: a nonce of its own`, nonce !== undefined && !seen.has(nonce));
        seen.add(nonce);
        note(
          `${address}: HTTPS for a year`,
          (await answer?.headerValue('strict-transport-security')) ===
            'max-age=31536000; includeSubDomains',
        );
        // React's own scripts ran (from our address, with the nonce), and so did Next.js's
        // inline page data (inline, with the nonce). The page has loaded by now, so its
        // scripts get 5 seconds, not the 30 a page's arrival gets: with a broken nonce the
        // test fails in under 2 minutes, not 9 (the 2.98 review, C4).
        await page.waitForFunction(
          () =>
            Array.isArray(self.__next_f) &&
            [...document.body.querySelectorAll('*')].some((element) =>
              Object.keys(element).some((key) => key.startsWith('__reactFiber')),
            ),
          undefined,
          { timeout: scriptsWait },
        );
        note(`${address}: the page's own scripts ran`, await reactRan(page));
        const refused = await page.evaluate(() => window.__refused);
        note(
          `${address}: the browser refused nothing`,
          refused.length === 0 && logged.length === 0,
          [...refused, ...logged].join('; '),
        );
      } finally {
        await context.close();
      }
    });
  }

  await step('a script put into a page any other way does not run', async () => {
    const context = await contextFor(null);
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    try {
      await page.goto(`${origin}/north-valley`);
      await page.waitForFunction(() => Array.isArray(self.__next_f), undefined, {
        timeout: scriptsWait,
      });
      const outcome = await page.evaluate(async () => {
        // As an injected name or post would try: an inline script, an inline handler, and
        // a script from another site (an address nothing answers, so nothing could load).
        const inline = document.createElement('script');
        inline.textContent = 'window.__inlineRan = true;';
        document.body.append(inline);
        const handler = document.createElement('div');
        handler.setAttribute('onclick', 'window.__handlerRan = true;');
        document.body.append(handler);
        handler.click();
        const away = document.createElement('script');
        away.src = 'https://scripts.example.test/steal.js';
        document.body.append(away);
        await new Promise((resolve) => setTimeout(resolve, 500));
        return {
          inlineRan: window.__inlineRan === true,
          handlerRan: window.__handlerRan === true,
          refused: window.__refused,
        };
      });
      note('an inline script added to the page does not run', !outcome.inlineRan);
      note('an inline event handler does not run', !outcome.handlerRan);
      note(
        'the browser says it refused the inline script and the handler',
        outcome.refused.filter((r) => r.startsWith('script-src-elem inline')).length >= 1 &&
          outcome.refused.some((r) => r.startsWith('script-src-attr inline')),
        outcome.refused.join('; '),
      );
      note(
        'the browser refused the script from another site',
        outcome.refused.some((r) => r.includes('scripts.example.test')),
        outcome.refused.join('; '),
      );
    } finally {
      await context.close();
    }
  });
}

await browser?.close();
server?.child.kill();

if (failures.length > 0) {
  console.error(`Script policy browser test failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`Script policy browser test passed (${checked.length} checks).`);
