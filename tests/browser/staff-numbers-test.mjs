// Step 2.46 (T-87's test in a real browser): the numbers a league keeps from the public, seen
// only by the people allowed more, on the made-up database (APP_ENV=test,
// LOCAL_DATA=made-up-database: every migration and the two seed leagues in memory, each
// season under way). Nothing leaves this computer; every league, team and person is made up.
// Builds the app first unless given --no-build; `--pictures=<folder>` keeps a picture of each
// page as the team's coach sees it (390 and 1280 wide) and as a visitor sees it (390).
//
// The seed league's owner makes the Otters' players' numbers staff only, in Admin → Teams.
// Then the statistics page, the Otters' page and the Otters' game are each loaded at phone
// width as a visitor, another team's coach (the Herons'), the Otters' coach and an admin:
// - the page itself, as fetched, is the same for all four where it shows the numbers (its
//   <main>, byte for byte), and none of them holds an Otters player's name where numbers
//   are (the whole page and its data, but for a team page's roster, which names everyone);
// - after the page, its script asks once (`private, no-store`); the visitor and the Herons'
//   coach are answered `{"more":null}` and see no Otters player; the Otters' coach and the
//   admin see the Otters' players, with the note that these numbers are not public;
// - the address it asks names no player and no number;
// - signed out, the Back button brings back no Otters player, and the next person on the
//   same device sees none; a session ended in another tab shows none once the tab is seen
//   again;
// - the server printed no Otters player's name.
// And the page-step checks: the accessibility checks (T-186) and no sideways scrolling.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import {
  accessibilityProblems,
  answerNameScreen,
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

const phone = { width: 390, height: 844 };
const laptop = { width: 1280, height: 900 };
const chosenPassword = 'a made-up chosen password';
/**
 * The seed's player on the Otters, as the adult league shows them (seed-data.ts). The name is
 * on the team's roster for everyone (a roster is not a number, S-22): on the team's page it
 * is looked for in the statistics only. The surname is on no page at all (R-14).
 */
const ottersPlayer = 'Quinn S.';
const ottersPlayerWords = [ottersPlayer, 'Quinn'];
const neverShown = 'Sample';
/** Where each page shows its players' numbers. */
const numbersOn = { stats: 'main', team: 'main .team-stats', game: 'main' };
/** The part of a page's HTML that shows its numbers (a team page's roster names everyone). */
const numbersHtml = (name, html) => {
  if (name !== 'team') return html;
  const from = html.indexOf('class="team-stats"');
  return from < 0 ? '' : html.slice(from, html.indexOf('</main>', from));
};
/** Who looks, by the made-up address they sign in with (seed-data.ts); the visitor signs in not at all. */
const people = {
  owner: 'owner@lakeside.example.test',
  admin: 'admin@lakeside.example.test',
  ottersCoach: 'otters-coach@lakeside.example.test',
  heronsCoach: 'herons-coach@lakeside.example.test',
};
const allowed = new Set(['admin', 'ottersCoach']);
const kinds = ['visitor', 'heronsCoach', 'ottersCoach', 'admin'];
const pictures = process.argv.find((arg) => arg.startsWith('--pictures='))?.slice(11);
if (pictures) mkdirSync(pictures, { recursive: true });

let built = true;
if (!process.argv.includes('--no-build')) {
  await step('building the web app', async () => {
    built = await buildNext();
    if (!built) throw new Error('next build failed or took over 10 minutes');
  });
}

/** The code in the newest kept email to `address`, read on the kept emails' page. */
async function codeOnThePage(page, origin, address) {
  await page.goto(`${origin}/signin/kept-emails`);
  const email = page.locator(`li[data-kept-email="${address}"]`).first();
  await email.waitFor();
  return (await email.locator('code[data-code]').innerText()).trim();
}

/** Signs `address` up through the screens, with its code read on the kept emails' page. */
async function signUpByTheKeptCode(page, origin, address) {
  await page.goto(`${origin}/signup`);
  await page.getByLabel('Email').fill(address);
  await Promise.all([
    page.waitForURL((url) => url.pathname === '/signup/code'),
    page.getByRole('button', { name: 'Email me a code' }).click(),
  ]);
  let code = '';
  for (let tries = 0; tries < 10 && !/^\d{6}$/.test(code); tries += 1) {
    code = await codeOnThePage(page, origin, address).catch(() => '');
  }
  note(`a 6-digit code for ${address} is on the kept emails' page`, /^\d{6}$/.test(code), code);
  await page.goto(`${origin}/signup/code`);
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
  // The one name screen a new account meets (step 2.128).
  await answerNameScreen(page, 'Made-up', 'Signer');
}

const origin = `http://localhost:${await freePort()}`;
const server = built
  ? startNext(['start', '--port', new URL(origin).port], {
      APP_ENV: 'test',
      PUBLIC_BASE_URL: origin,
      LOG_LEVEL: 'debug',
      LOCAL_DATA: 'made-up-database',
    })
  : null;
let browser = null;
if (server !== null) {
  await step('starting the server on the made-up database and the browser', async () => {
    await waitFor(`${origin}/`, server, [{ address: '/lakeside/stats' }]);
    browser = await launch();
  });
}

/** The page's <main>, as the server sent it. */
const mainOf = (html) => html.match(/<main[\s\S]*<\/main>/)?.[0] ?? '';

/** Waits for the page's signed-in request and gives its answer, or null when none came. */
async function staffAnswer(page, run) {
  const answer = page
    .waitForResponse((r) => new URL(r.url()).pathname.endsWith('/staff-numbers'), {
      timeout: 20_000,
    })
    .catch(() => null);
  await run();
  const response = await answer;
  if (response === null) return null;
  return {
    url: response.url(),
    cacheControl: response.headers()['cache-control'] ?? '',
    body: await response.text(),
  };
}

if (browser !== null) {
  const sessions = {};
  await step('the four signed-in people sign in by the code on the page', async () => {
    for (const [who, address] of Object.entries(people)) {
      const context = await browser.newContext({ viewport: phone });
      const page = await context.newPage();
      page.setDefaultTimeout(60_000);
      await signUpByTheKeptCode(page, origin, address);
      sessions[who] = await context.storageState();
      await context.close();
    }
  });
  const contextOf = async (who, viewport = phone) =>
    browser.newContext({
      viewport,
      ...(who === 'visitor' || sessions[who] === undefined ? {} : { storageState: sessions[who] }),
    });

  await step("the owner keeps the Otters' players' numbers to the team's staff", async () => {
    const context = await contextOf('owner');
    const page = await context.newPage();
    page.setDefaultTimeout(60_000);
    await page.goto(`${origin}/lakeside/admin/teams`);
    await Promise.all([
      page.waitForURL((url) => /\/lakeside\/admin\/teams\/[0-9a-f-]{36}$/.test(url.pathname)),
      page.locator('a.staff-row-link', { hasText: 'Lakeside Otters' }).click(),
    ]);
    await page
      .getByLabel("Who sees this team's players' numbers")
      .selectOption({ label: "Only the team's staff and the league's admins" });
    // Said beside the form (step 2.155), with scripts on or off.
    await Promise.all([
      page
        .locator('[role=status]', { hasText: 'Saved: who sees the numbers of' })
        .waitFor({ timeout: 10_000 }),
      page.getByRole('button', { name: 'Save who sees the numbers' }).click(),
    ]);
    await context.close();
  });

  const pages = { stats: '/lakeside/stats', team: '/lakeside/teams/otters', game: '' };
  await step("the Otters' game is found from their page", async () => {
    const context = await contextOf('visitor');
    const page = await context.newPage();
    await page.goto(origin + pages.team);
    // The game they played, under "Results": the game to come has no box score.
    const results = page
      .locator('main section')
      .filter({ has: page.getByRole('heading', { name: 'Results', exact: true }) });
    const href = await results.locator('a[href^="/lakeside/games/"]').first().getAttribute('href');
    pages.game = href ?? '';
    note(
      "the Otters' page links the game they played",
      /^\/lakeside\/games\/[0-9a-f-]{36}(\?|$)/.test(pages.game),
      pages.game,
    );
    await context.close();
  });

  for (const [name, address] of Object.entries(pages)) {
    if (address === '') continue;
    await step(`${name}: the page as fetched is the same for all four`, async () => {
      const mains = {};
      for (const who of kinds) {
        const context = await contextOf(who);
        const response = await context.request.get(origin + address);
        const html = await response.text();
        note(
          `${name} as ${who}: the page is served`,
          response.status() === 200,
          String(response.status()),
        );
        for (const word of ottersPlayerWords) {
          note(
            `${name} as ${who}: the page's numbers and its data hold no "${word}"`,
            !numbersHtml(name, html).includes(word),
          );
        }
        note(`${name} as ${who}: the page holds no "${neverShown}"`, !html.includes(neverShown));
        mains[who] = mainOf(html);
        await context.close();
      }
      note(
        `${name}: the page has its numbers`,
        mains.visitor.length > 1000,
        String(mains.visitor.length),
      );
      for (const who of kinds.slice(1)) {
        note(
          `${name}: the page as ${who} is the visitor's, byte for byte`,
          mains[who] === mains.visitor,
        );
      }
    });

    for (const who of kinds) {
      await step(`${name} as ${who} at phone width`, async () => {
        const context = await contextOf(who);
        const page = await context.newPage();
        page.setDefaultTimeout(30_000);
        const answer = await staffAnswer(page, () => page.goto(origin + address));
        note(`${name} as ${who}: the page asks once after it arrives`, answer !== null);
        if (answer !== null) {
          note(
            `${name} as ${who}: the answer is private and kept by no cache`,
            answer.cacheControl === 'private, no-store',
            answer.cacheControl,
          );
          const query = new URL(answer.url).searchParams;
          note(
            `${name} as ${who}: the address names no player and no number`,
            [...query.keys()].every((key) =>
              ['page', 'season', 'by', 'team', 'game'].includes(key),
            ) && !ottersPlayerWords.some((word) => answer.url.includes(word)),
            answer.url,
          );
          if (!allowed.has(who)) {
            note(
              `${name} as ${who}: told nothing more, in the one answer`,
              answer.body === '{"more":null}',
              answer.body.slice(0, 80),
            );
          }
        }
        const main = page.locator(numbersOn[name]).first();
        if (allowed.has(who)) {
          await main
            .getByText(ottersPlayer)
            .first()
            .waitFor({ timeout: 20_000 })
            .catch(() => {});
        } else {
          await page.waitForLoadState('networkidle').catch(() => {});
        }
        const text = await main.innerText();
        const noteShown = (await page.locator('.staff-numbers-note').count()) > 0;
        const noteText = noteShown
          ? await page.locator('.staff-numbers-note').first().innerText()
          : '';
        if (allowed.has(who)) {
          note(`${name} as ${who}: the Otters' players are shown`, text.includes(ottersPlayer));
          note(
            `${name} as ${who}: the note says they are not public`,
            noteShown &&
              // Its title is drawn in capitals by the page's styles.
              noteText.toLowerCase().includes('not public: shown to you as staff') &&
              noteText.includes("The players' numbers of Lakeside Otters are shown only"),
            noteText,
          );
        } else {
          note(`${name} as ${who}: no Otters player is shown`, !text.includes(ottersPlayer));
          note(`${name} as ${who}: no note`, !noteShown);
        }
        const problems = await accessibilityProblems(page);
        note(`accessibility: ${name} as ${who}`, problems.length === 0, problems.join('; '));
        const [width, inner] = await page.evaluate(() => [
          document.documentElement.scrollWidth,
          window.innerWidth,
        ]);
        note(`no sideways scrolling: ${name} as ${who}`, width <= inner, `${width} > ${inner}`);
        if (pictures && (who === 'ottersCoach' || who === 'visitor')) {
          await page.screenshot({
            path: path.join(pictures, `390-${name}-${who}.png`),
            fullPage: true,
          });
        }
        await context.close();
      });
    }

    if (pictures) {
      await step(`${name}: a picture at laptop width as the Otters' coach`, async () => {
        const context = await contextOf('ottersCoach', laptop);
        const page = await context.newPage();
        await page.goto(origin + address);
        await page
          .locator(numbersOn[name])
          .getByText(ottersPlayer)
          .first()
          .waitFor({ timeout: 20_000 });
        await page.screenshot({
          path: path.join(pictures, `1280-${name}-ottersCoach.png`),
          fullPage: true,
        });
        await context.close();
      });
    }
  }

  await step(
    'signed out, the Back button and the next person on the device see no Otters player',
    async () => {
      const context = await contextOf('ottersCoach');
      const page = await context.newPage();
      page.setDefaultTimeout(30_000);
      await page.goto(origin + pages.stats);
      await page.locator('main').getByText(ottersPlayer).first().waitFor();
      await page.locator('.site-header .site-menu > summary').click();
      // Since step 2.163 (R-30) signing out stays on this page, `?notice=signedOut`.
      await Promise.all([
        page.waitForURL(
          (url) =>
            url.pathname !== '/lakeside/stats' || url.searchParams.get('notice') === 'signedOut',
        ),
        page.getByRole('button', { name: 'Sign out', exact: true }).click(),
      ]);
      const session = (await context.cookies()).find((c) => c.name === 'srl_session');
      note('signed out: no session left on the device', !session?.value, session?.value);
      await page.goBack();
      await page.locator('main').first().waitFor();
      await page.waitForLoadState('networkidle').catch(() => {});
      note(
        'after Back, no Otters player is on the page',
        !(await page.locator('main').innerText()).includes(ottersPlayer),
      );
      note('after Back, no note', (await page.locator('.staff-numbers-note').count()) === 0);
      // The next person on the same device opens the page afresh.
      await page.goto(origin + pages.stats);
      await page.waitForLoadState('networkidle').catch(() => {});
      note(
        'the next person on the device sees no Otters player',
        !(await page.locator('main').innerText()).includes(ottersPlayer),
      );
      await context.close();
    },
  );

  await step(
    'a session ended in another tab shows no Otters player once the tab is seen again',
    async () => {
      const context = await contextOf('admin');
      const page = await context.newPage();
      page.setDefaultTimeout(30_000);
      await page.goto(origin + pages.team);
      await page.locator(numbersOn.team).getByText(ottersPlayer).first().waitFor();
      // Another tab of the same browser signs out.
      const other = await context.newPage();
      await other.goto(origin + pages.stats);
      await other.locator('.site-header .site-menu > summary').click();
      // Since step 2.163 (R-30) signing out leaves the person on the page they were on,
      // saying "You are signed out." (`?notice=signedOut`), rather than at /signin.
      await Promise.all([
        other.waitForURL(
          (url) =>
            url.pathname !== '/lakeside/stats' || url.searchParams.get('notice') === 'signedOut',
        ),
        other.getByRole('button', { name: 'Sign out', exact: true }).click(),
      ]);
      await other.close();
      // The first tab comes back into view.
      const answer = await staffAnswer(page, async () => {
        await page.bringToFront();
        await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      });
      note(
        'the tab seen again asks again, and is told nothing more',
        answer?.body === '{"more":null}',
        answer?.body?.slice(0, 80),
      );
      await page
        .waitForFunction(() => document.querySelector('.staff-numbers-note') === null)
        .catch(() => {});
      note(
        'the tab seen again shows no Otters player',
        !(await page.locator(numbersOn.team).innerText()).includes(ottersPlayer),
      );
      await context.close();
    },
  );

  await browser.close();
}

if (server !== null) {
  const output = server.output();
  for (const word of [...ottersPlayerWords, neverShown]) {
    note(`the server printed no "${word}"`, !output.includes(word));
  }
  server.child.kill();
}

if (failures.length > 0) {
  console.error(
    `Staff-only numbers (step 2.46): ${failures.length} of ${checked.length} checks failed:`,
  );
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`Staff-only numbers (step 2.46): all ${checked.length} checks passed.`);
