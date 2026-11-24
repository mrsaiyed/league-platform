// Step 2.135: before real people have accounts, the footer's Terms and Privacy hold a short
// plain note, in a real browser at phone width, signed out, on the web app's made-up
// stand-in (APP_ENV=test). Nothing leaves this computer; every league and address is made
// up, the contact address too (CONTACT_EMAIL, web-browser-kit.mjs).
//
// In both seed leagues, starting on the league's home and tapping from there:
// - neither footer link leads to "This page is not built yet": each page has its title,
//   says at the top that it is the short version and when it last changed, names the
//   league's admin first and the site's address second, and leads back to the league;
// - the pages are open signed out, work with scripts off, and carry no mark of their own
//   that keeps them out of search engines (neither in the page nor in the answer's
//   headers): they are marked exactly as a league's own pages are on this copy;
// - "Create your account" links both, and they lead back to the league the person came
//   from;
// - "Powered by SR Leagues" leads to our front page.
// One check types an address: the note, opened as if from a draft league, names no league
// to a visitor (U-9), as the league's own pages would be "not found".
// And the page-step checks: the accessibility checks (T-186), no sideways scrolling at
// phone width, everything tapped at least 44 high.
// `--no-build` serves the build already here.
import {
  accessibilityProblems,
  buildNext,
  freePort,
  launch,
  startNext,
  waitFor,
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
    failures.push(`${name}: ${String(error?.message ?? error).split('\n')[0]}`);
  }
};

const phone = { width: 390, height: 844 };
// The stand-in's two live leagues (apps/web/src/server/stand-in-cast.ts): an adult one and
// a youth one.
const leagues = [
  { slug: 'north-valley', name: 'North Valley League' },
  { slug: 'harbor-city', name: 'Harbor City League' },
];
const notes = [
  { link: 'Terms', title: 'Terms', other: 'Read the privacy note' },
  { link: 'Privacy', title: 'Privacy', other: 'Read the terms' },
];
const shortVersion = 'This is the short version, for the first season of our own leagues.';
const lastChanged = /^Last changed on \d{1,2} [A-Z][a-z]+ \d{4}\.$/;
const leagueFirst = "Write to your league's admin first. They run your league.";
const contact = 'contact@example.test';

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
    await waitFor(`${origin}/`, server);
    browser = await launch();
  });
}

async function fresh(options = {}) {
  const context = await browser.newContext({ viewport: phone, ...options });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  return { context, page };
}
async function accessible(page, label) {
  await page
    .waitForFunction(() => document.title.trim() !== '', null, { timeout: 5000 })
    .catch(() => {});
  const problems = await accessibilityProblems(page);
  note(`accessibility: ${label}`, problems.length === 0, problems.join('; '));
}
async function noSidewaysScroll(page, label) {
  const [width, inner] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    window.innerWidth,
  ]);
  note(`no sideways scrolling at phone width: ${label}`, width <= inner, `${width} > ${inner}`);
}
/** Every link and button shown inside `within` is at least 44 high. */
async function tallEnough(page, within, label) {
  const short = await page.$$eval(
    `${within} :is(a.ui-button, button, nav a, a.powered-by)`,
    (els) =>
      els
        .filter((el) => el.getClientRects().length > 0)
        .map((el) => [el.textContent?.trim() || el.tagName, el.getBoundingClientRect().height])
        .filter(([, height]) => height < 43.5)
        .map(([name, height]) => `${name} ${Math.round(height)}`),
  );
  note(`everything tapped is at least 44 high: ${label}`, short.length === 0, short.join(', '));
}
const link = (page, name) => page.getByRole('link', { name, exact: true });
const footerLink = (page, name) =>
  page.locator('.site-footer').getByRole('link', { name, exact: true });
const pathOf = (page) => new URL(page.url()).pathname;
/** Whether the page or the answer it came in says to keep it out of search engines. */
async function keptOutOfSearch(page, response) {
  const meta = await page.locator('meta[name="robots" i], meta[name="googlebot" i]').count();
  const header = (await response?.allHeaders())?.['x-robots-tag'] ?? '';
  return meta > 0 || /noindex/i.test(header);
}
// Outside production every page of a copy is kept out of search engines (do-not-index.ts,
// record 082), so a note is checked against a league's own home page: it carries the
// site's marking and no mark of its own, kept out where the site is and nowhere else.
let siteMarking;
async function siteKeptOut() {
  if (siteMarking === undefined) {
    const { context, page } = await fresh();
    try {
      siteMarking = await keptOutOfSearch(page, await page.goto(`${origin}/${leagues[0].slug}`));
    } finally {
      await context.close();
    }
  }
  return siteMarking;
}
/** Whether the note is marked for search engines exactly as the league's pages are. */
const markedLikeTheSite = async (page, response) =>
  (await keptOutOfSearch(page, response)) === (await siteKeptOut());
/** The checks every note passes, wherever it was opened from. */
async function aNote(page, response, which, league, label) {
  await page.getByRole('heading', { level: 1, name: which.title, exact: true }).waitFor();
  note(
    `${label}: not "not built yet"`,
    (await page.getByText('This page is not built yet.').count()) === 0,
  );
  const paragraphs = await page.locator('main > p').allTextContents();
  note(
    `${label}: says at the top that it is the short version`,
    (paragraphs[0] ?? '').startsWith(shortVersion),
    paragraphs[0],
  );
  note(
    `${label}: says when it last changed`,
    lastChanged.test((paragraphs[1] ?? '').trim()),
    paragraphs[1],
  );
  const levels = await page.$$eval('main :is(h1, h2, h3, h4)', (els) =>
    els.map((el) => Number(el.tagName[1])),
  );
  note(
    `${label}: one title, then section headings`,
    levels[0] === 1 && levels.slice(1).length > 2 && levels.slice(1).every((l) => l === 2),
    levels.join(','),
  );
  note(
    `${label}: names the league's admin first`,
    (await page.getByText(leagueFirst, { exact: true }).count()) === 1,
  );
  note(
    `${label}: gives the site's contact address as a link`,
    (await link(page, contact).getAttribute('href')) === `mailto:${contact}`,
  );
  note(
    `${label}: leads back to ${league.name}`,
    (await link(page, `Back to ${league.name}`).getAttribute('href')) === `/${league.slug}`,
  );
  note(
    `${label}: is marked for search engines as the league's pages are, no more`,
    await markedLikeTheSite(page, response),
  );
  await accessible(page, label);
  await noSidewaysScroll(page, label);
  await tallEnough(page, 'main', label);
}

if (browser) {
  for (const league of leagues) {
    for (const which of notes) {
      await step(`${league.name}: the footer's ${which.link}`, async () => {
        const { context, page } = await fresh();
        try {
          await page.goto(`${origin}/${league.slug}`);
          await tallEnough(page, '.site-footer', `${league.name}'s footer`);
          const [response] = await Promise.all([
            page.waitForNavigation(),
            footerLink(page, which.link).click(),
          ]);
          const label = `${league.name}, ${which.title}`;
          note(
            `${label}: the footer's link opens it`,
            pathOf(page) === `/${which.link.toLowerCase()}`,
          );
          await aNote(page, response, which, league, label);
          // The other note keeps the way back too.
          await Promise.all([page.waitForNavigation(), link(page, which.other).click()]);
          note(
            `${label}: the other note, opened from it, still leads back to ${league.name}`,
            (await link(page, `Back to ${league.name}`).getAttribute('href')) === `/${league.slug}`,
          );
          await Promise.all([
            page.waitForURL((url) => url.pathname === `/${league.slug}`),
            link(page, `Back to ${league.name}`).click(),
          ]);
          note(`${label}: "Back to ${league.name}" is back on the league home`, true);
        } finally {
          await context.close();
        }
      });
    }
  }

  await step('with scripts off, both notes open from the footer', async () => {
    const { context, page } = await fresh({ javaScriptEnabled: false });
    try {
      const league = leagues[1];
      for (const which of notes) {
        await page.goto(`${origin}/${league.slug}/schedule`);
        const [response] = await Promise.all([
          page.waitForNavigation(),
          footerLink(page, which.link).click(),
        ]);
        await page.getByRole('heading', { level: 1, name: which.title, exact: true }).waitFor();
        note(
          `scripts off, ${which.title}: the short version is there`,
          (await page.getByText(shortVersion, { exact: false }).count()) === 1,
        );
        note(
          `scripts off, ${which.title}: leads back to the page it was opened from`,
          (await link(page, `Back to ${league.name}`).getAttribute('href')) ===
            `/${league.slug}/schedule`,
        );
        note(
          `scripts off, ${which.title}: is marked for search engines as the league's pages are, no more`,
          await markedLikeTheSite(page, response),
        );
      }
    } finally {
      await context.close();
    }
  });

  await step('"Create your account" links both notes', async () => {
    const { context, page } = await fresh();
    try {
      const league = leagues[0];
      await page.goto(`${origin}/${league.slug}`);
      await page.locator('.site-header .site-menu > summary').click();
      await link(page, 'Sign in or create an account').click();
      await Promise.all([
        page.waitForURL((url) => url.pathname === '/signup'),
        link(page, 'New here? Create an account').click(),
      ]);
      await page.getByRole('heading', { level: 1, name: 'Create your account' }).waitFor();
      await tallEnough(page, 'main', 'the sign-up screen');
      for (const which of notes) {
        const words = which.title === 'Terms' ? 'Read the terms' : 'Read the privacy note';
        const [response] = await Promise.all([page.waitForNavigation(), link(page, words).click()]);
        await aNote(page, response, which, league, `${which.title}, from "Create your account"`);
        await page.goBack();
        await page.getByRole('heading', { level: 1, name: 'Create your account' }).waitFor();
      }
    } finally {
      await context.close();
    }
  });

  await step('"Powered by SR Leagues" leads to our front page', async () => {
    const { context, page } = await fresh();
    try {
      await page.goto(`${origin}/${leagues[1].slug}/teams`);
      await Promise.all([
        page.waitForURL((url) => url.pathname === '/'),
        footerLink(page, 'Powered by SR Leagues').click(),
      ]);
      // Since step 2.102 our name is the front page's kicker, over its two-line title.
      await page.locator('[data-front-page] .ui-kicker', { hasText: 'SR Leagues' }).waitFor();
      await page.locator('[data-front-page] h1').waitFor();
      note('"Powered by SR Leagues" is on our front page', true);
    } finally {
      await context.close();
    }
  });

  await step('opened as if from a draft league, a visitor is shown no league', async () => {
    const { context, page } = await fresh();
    try {
      for (const which of notes) {
        await page.goto(`${origin}/${which.link.toLowerCase()}?from=%2Fquiet-pines`);
        await page.getByRole('heading', { level: 1, name: which.title, exact: true }).waitFor();
        note(
          `${which.title} from a draft league: no "Back to" and no name`,
          (await page.getByText('Back to', { exact: false }).count()) === 0 &&
            (await page.getByText('Quiet Pines', { exact: false }).count()) === 0,
        );
      }
    } finally {
      await context.close();
    }
  });
}

await browser?.close();
server?.child.kill();

if (failures.length > 0) {
  console.error(`Terms and privacy browser test failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`Terms and privacy browser test passed (${checked.length} checks).`);
