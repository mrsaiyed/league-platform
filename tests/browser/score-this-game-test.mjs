// Step 2.153: "Score this game" where a scorer looks for it, in a real browser at phone width,
// on the web app's made-up stand-in (APP_ENV=test). Nothing leaves this computer; every
// person, league and game is made up (apps/web/src/server/stand-in-world-seed.ts).
//
// - The made-up scorekeeper signs in from the league home and, typing no address after the
//   first, finds "Score this game" on tonight's game and reaches the tracker's opening screen
//   for that game in one tap; the card's own link still leads to the game, by touch and by
//   keyboard; "Score this game" is on the schedule, a team's page and a game's page too.
// - A game recorded as a final score shows "Enter the score", which leads to that game's
//   own row in Games; a final game shows neither.
// - The button shows from the start of the game's own day in the league's time (S-70): on
//   the game under way and tonight's, and on an earlier day's game with no result yet, never
//   on tomorrow's. The made-up world starts at noon in the league's zone (worldAtNoon), so
//   what is today never depends on when the test runs.
// - A visitor, a coach and another league's admin see no button on the home page, the
//   schedule, a team's page or a game's page; nor does another league's scorekeeper on that
//   league's home and schedule.
// - Where only assigned scorekeepers may score (the draft league), the scorekeeper sees it on
//   their assigned games only.
// - The page as fetched by a visitor and by the scorekeeper, same address, raw answer, is the
//   same where it describes the games, and the scorekeeper's holds no trace of a button: the
//   buttons arrive afterwards, by one private read. With scripts off there is no button and
//   the menu's "My games to score" leads to their games.
// And the page-step checks: the accessibility checks (T-186), no sideways scrolling, and
// everything tapped at least 44 high. `--no-build` serves the build already here.
import {
  accessibilityProblems,
  buildNext,
  freePort,
  launch,
  startNext,
  waitFor,
  worldAtNoon,
} from './web-browser-kit.mjs';

const failures = [];
const checked = [];
const note = (label, ok, detail = '') => {
  checked.push(label);
  if (!ok) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
};
/** Where the run is, said if it is still going after five minutes. */
let where = 'starting';
const step = async (name, run) => {
  where = name;
  try {
    await run();
  } catch (error) {
    failures.push(`${name}: ${String(error?.message ?? error).split('\n')[0]}`);
  }
};

// The whole run fails after five minutes, saying where it was (no wait may hang it).
setTimeout(() => {
  console.error(`score-this-game: the run was still going after five minutes, at: ${where}`);
  for (const line of checked.slice(-3)) console.error(`  last checked: ${line}`);
  process.exit(1);
}, 5 * 60_000).unref();

const phone = { width: 390, height: 844 };
const scorekeeper = { email: 'scorekeeper@example.test', password: 'made-up scorekeeper password' };
const coach = { email: 'coach@example.test', password: 'made-up coach password' };
// The made-up people known by their session cookie alone (stand-in-cast.ts).
const tokens = {
  scorekeeper: 'local-scorekeeper-token',
  coach: 'local-coach-token',
  otherAdmin: 'local-other-admin-token',
};
const hexId = (head, n) => `01900000-0000-7000-8000-${head}${n.toString(16).padStart(8, '0')}`;
/** The tracked games of this week's round (stand-in-world-seed.ts), in both made-up leagues. */
const game = (n) => hexId('006a', n);
const finalScoreToday = game(1); // Tigers at Lions, tonight, final score only
const liveGame = game(2); // Bears at Hawks, under way, recorded live
const trackedTomorrow = game(3); // Lions at Hawks, tomorrow, recorded live
const finalScoreLater = game(4); // in two days; in the draft league, assigned to the scorekeeper
const decided = game(5); // Lions at Bears, final this morning
/** The draft league's game nobody scored, two days ago, assigned to the scorekeeper. */
const draftUnscored = hexId('0000', 0xb2000000 + 1000);

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
    LOCAL_NOW: worldAtNoon(),
  });
  await step('starting the server and the browser', async () => {
    await waitFor(`${origin}/`, server);
    browser = await launch();
  });
}

/** A phone; as `who` (a made-up person's cookie) or a visitor. */
async function fresh(who, options = {}) {
  const context = await browser.newContext({ viewport: phone, ...options });
  if (who !== undefined) {
    await context.addCookies([{ name: 'srl_session', value: tokens[who], url: origin }]);
  }
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  return { context, page };
}
async function accessible(page, label) {
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
/** Every button on a card shown, at least 44 high. */
async function tallEnough(page, label) {
  const short = await page.$$eval('main [data-offer]', (els) =>
    els
      .filter((el) => el.getClientRects().length > 0)
      .map((el) => el.getBoundingClientRect().height)
      .filter((height) => height < 43.5)
      .map((height) => String(Math.round(height))),
  );
  note(`every button is at least 44 high: ${label}`, short.length === 0, short.join(', '));
}
const openMenu = (page) => page.locator('.site-header .site-menu > summary').click();
const link = (page, name) => page.getByRole('link', { name, exact: true });
const pathOf = (page) => new URL(page.url()).pathname;

/** Each game card on the page: its game, and its button if it has one. */
const cardsOn = (page) =>
  page.$$eval('main .ui-game-card', (cards) =>
    cards.map((card) => {
      const href = card.querySelector('a.ui-game-link')?.getAttribute('href') ?? '';
      const offer = card.querySelector('.ui-game-action a');
      return {
        game: href.split('?')[0].split('/').pop(),
        offer:
          offer === null
            ? null
            : {
                kind: offer.getAttribute('data-offer'),
                words: offer.firstChild?.textContent?.trim(),
                href: offer.getAttribute('href'),
              },
      };
    }),
  );
const cardOf = (cards, id) => cards.find((card) => card.game === id);
/**
 * Waits for the first button to be drawn: in the page, not in sight, as a finished round's
 * games are folded away and a phone shows only the first two coming games of the home page.
 */
const offersDrawn = (page) =>
  page.locator('main [data-offer]').first().waitFor({ state: 'attached' });
/** The game page's own button. */
const gameOffer = (page) => page.locator('main [data-game-offer] a');

/**
 * Waits for the page's one read of its buttons (none when the page has no game that could
 * have one), then a moment for what it said to be drawn: the answer, or null.
 */
async function readOfPage(page, expected = true) {
  const answer = await page
    .waitForResponse((r) => new URL(r.url()).pathname.endsWith('/scoring'), { timeout: 15_000 })
    .catch(() => null);
  if (expected)
    note(`the page reads its buttons after it arrives: ${pathOf(page)}`, answer !== null);
  await page.waitForTimeout(400);
  return answer;
}
/**
 * Signs `who` in from the account menu of the league page the phone is on, back on that
 * page, and waits for its read of the buttons.
 */
async function signInFromMenu(page, who) {
  const back = pathOf(page);
  await openMenu(page);
  await link(page, 'Sign in or create an account').click();
  await page.getByLabel('Email').fill(who.email);
  await page.getByLabel('Password').fill(who.password);
  const read = readOfPage(page);
  await Promise.all([
    page.waitForURL((url) => url.pathname === back),
    page.getByRole('button', { name: 'Sign in', exact: true }).click(),
  ]);
  return read;
}
/** Goes to `path` by an address (only where a journey starts) and waits for its read. */
async function open(page, path, expected = true) {
  const read = readOfPage(page, expected);
  await page.goto(`${origin}${path}`);
  return read;
}

if (browser) {
  await step(
    'the scorekeeper signs in from the league home and scores tonight’s game',
    async () => {
      const { context, page } = await fresh();
      try {
        // The one address typed.
        await page.goto(`${origin}/north-valley`);
        await openMenu(page);
        await link(page, 'Sign in or create an account').click();
        await page.getByLabel('Email').fill(scorekeeper.email);
        await page.getByLabel('Password').fill(scorekeeper.password);
        const read = readOfPage(page);
        await Promise.all([
          page.waitForURL((url) => url.pathname === '/north-valley'),
          page.getByRole('button', { name: 'Sign in', exact: true }).click(),
        ]);
        const answer = await read;
        const kept = answer?.headers()['cache-control'] ?? '';
        note(
          'the read of the buttons is private and never kept',
          /private/.test(kept) && /no-store/.test(kept),
          kept,
        );
        await offersDrawn(page);
        const home = await cardsOn(page);
        note(
          'the live game on the league home has "Score this game", to its opening screen',
          cardOf(home, liveGame)?.offer?.words === 'Score this game' &&
            cardOf(home, liveGame)?.offer?.href === `/north-valley/score/${liveGame}`,
          JSON.stringify(cardOf(home, liveGame)),
        );
        note(
          // (At noon the home may show it among the results or not at all; the schedule's
          // check below holds it on its card.)
          'no game final on the league home has a button',
          (cardOf(home, decided)?.offer ?? null) === null &&
            (await page
              .locator('main .ui-game-card:is([data-status="final"], [data-status="forfeit"])')
              .locator('[data-offer]')
              .count()) === 0,
          JSON.stringify(cardOf(home, decided)),
        );
        await accessible(page, 'the league home with the buttons');
        await noSidewaysScroll(page, 'the league home with the buttons');
        await tallEnough(page, 'the league home');

        // The card's own link still works: the button is clear of it, and comes after it.
        const card = page.locator('main .ui-game-card', {
          has: page.locator(`a.ui-game-link[href*="${liveGame}"]`),
        });
        const button = card.locator('.ui-game-action a');
        const where = await card.evaluate((el) => {
          const box = el.getBoundingClientRect();
          const b = el.querySelector('.ui-game-action a').getBoundingClientRect();
          const at = (x, y) => document.elementFromPoint(x, y)?.closest('a')?.className ?? '';
          return {
            top: at(box.left + box.width / 2, box.top + 12),
            button: at(b.left + b.width / 2, b.top + b.height / 2),
            inside: b.top >= box.top && b.bottom <= box.bottom,
          };
        });
        note(
          'a tap on the card is its link, and a tap on the button is the button, inside the card',
          where.top === 'ui-game-link' && where.button === 'ui-button' && where.inside,
          JSON.stringify(where),
        );
        await card.locator('a.ui-game-link').focus();
        await page.keyboard.press('Tab');
        note(
          "by keyboard the button comes right after the card's link",
          await button.evaluate((el) => el === document.activeElement),
        );
        note(
          'a screen reader hears which game the button is for',
          (await page
            .getByRole('link', { name: 'Score this game: Bears against Hawks', exact: true })
            .count()) === 1 &&
            (await button.locator('[aria-hidden]').textContent()) === 'Score this game',
          String(await button.textContent()),
        );

        // One tap to the tracker's opening screen for that game.
        await Promise.all([
          page.waitForURL((url) => url.pathname === `/north-valley/score/${liveGame}`),
          button.click(),
        ]);
        await page
          .getByText('This device is scoring the game.')
          .or(page.getByRole('heading', { level: 2, name: 'Check the game format' }))
          .or(page.locator('[data-scoring]'))
          .first()
          .waitFor();
        note('one tap from the league home to the opening screen of that game', true);
        await page.goBack();

        // The schedule, by the menu.
        await openMenu(page);
        const scheduleRead = readOfPage(page);
        await link(page.locator('.site-header'), 'Schedule').first().click();
        await page.waitForURL((url) => url.pathname === '/north-valley/schedule');
        await scheduleRead;
        await offersDrawn(page);
        const schedule = await cardsOn(page);
        note(
          'the schedule offers "Score this game" on the game under way, recorded live',
          cardOf(schedule, liveGame)?.offer?.kind === 'score',
          JSON.stringify(cardOf(schedule, liveGame)),
        );
        note(
          "tomorrow's game on the schedule has no button: not before its day (S-70)",
          cardOf(schedule, trackedTomorrow) !== undefined &&
            cardOf(schedule, trackedTomorrow)?.offer === null,
          JSON.stringify(cardOf(schedule, trackedTomorrow)),
        );
        note(
          'the schedule offers "Enter the score" on a game recorded as a final score',
          cardOf(schedule, finalScoreToday)?.offer?.words === 'Enter the score' &&
            cardOf(schedule, finalScoreToday)?.offer?.href ===
              `/north-valley/admin/games#game-${finalScoreToday}`,
          JSON.stringify(cardOf(schedule, finalScoreToday)),
        );
        note(
          'no decided game on the schedule has a button',
          cardOf(schedule, decided)?.offer === null,
          JSON.stringify(cardOf(schedule, decided)),
        );
        await accessible(page, 'the schedule with the buttons');
        await noSidewaysScroll(page, 'the schedule with the buttons');
        await tallEnough(page, 'the schedule');

        // "Enter the score" leads to that game's entry in Games.
        const enter = page
          .locator('main .ui-game-card', {
            has: page.locator(`a.ui-game-link[href*="${finalScoreToday}"]`),
          })
          .locator('.ui-game-action a');
        await enter.scrollIntoViewIfNeeded();
        await Promise.all([
          page.waitForURL((url) => url.pathname === '/north-valley/admin/games'),
          enter.click(),
        ]);
        // The list shows today's game, and the phone lands on its own row, not the list's top.
        const row = page.locator(`[id="game-${finalScoreToday}"]`);
        await row.waitFor();
        await page.waitForTimeout(300);
        const landed = await row.evaluate((el) => ({
          top: Math.round(el.getBoundingClientRect().top),
          height: window.innerHeight,
          scrolled: window.scrollY,
        }));
        note(
          '"Enter the score" on a game of today lands on that game\'s own row in Games',
          new URL(page.url()).hash === `#game-${finalScoreToday}` &&
            (await row.count()) === 1 &&
            landed.scrolled > 0 &&
            landed.top >= 0 &&
            landed.top < landed.height / 2,
          `${page.url()} ${JSON.stringify(landed)}`,
        );
        await page.goBack();

        // A team's page, by the schedule's own cards: the live game's, then its team.
        await openMenu(page);
        await link(page.locator('.site-header'), 'Teams').first().click();
        await page.waitForURL((url) => url.pathname === '/north-valley/teams');
        const teamRead = readOfPage(page);
        await page.locator('main a[href="/north-valley/teams/hawks"]').first().click();
        await page.waitForURL((url) => url.pathname === '/north-valley/teams/hawks');
        await teamRead;
        await offersDrawn(page);
        const team = await cardsOn(page);
        note(
          "a team's page offers the button on its game to score today, not tomorrow's",
          cardOf(team, liveGame)?.offer?.kind === 'score' &&
            cardOf(team, trackedTomorrow)?.offer === null,
          JSON.stringify(team),
        );
        await accessible(page, "a team's page with the buttons");
        await noSidewaysScroll(page, "a team's page with the buttons");
        await tallEnough(page, "a team's page");

        // A game's page, by its card.
        const gameRead = readOfPage(page);
        await page.locator(`main a.ui-game-link[href*="${liveGame}"]`).first().click();
        await page.waitForURL((url) => url.pathname === `/north-valley/games/${liveGame}`);
        await gameRead;
        await gameOffer(page).waitFor();
        note(
          'a game\'s page offers "Score this game", to that game\'s opening screen',
          (await gameOffer(page).textContent())?.trim() === 'Score this game' &&
            (await gameOffer(page).getAttribute('href')) === `/north-valley/score/${liveGame}`,
        );
        await accessible(page, "a game's page with the button");
        await noSidewaysScroll(page, "a game's page with the button");
        await tallEnough(page, "a game's page");
        // Tomorrow's game's own page has none.
        await page.goBack();
        await page.waitForURL((url) => url.pathname === '/north-valley/teams/hawks');
        const tomorrowRead = readOfPage(page);
        await page.locator(`main a.ui-game-link[href*="${trackedTomorrow}"]`).first().click();
        await page.waitForURL((url) => url.pathname === `/north-valley/games/${trackedTomorrow}`);
        await tomorrowRead;
        note("tomorrow's game's page has no button", (await gameOffer(page).count()) === 0);
      } finally {
        await context.close();
      }
    },
  );

  await step(
    'after signing out, no button is left behind, and the next person sees none',
    async () => {
      const { context, page } = await fresh();
      const offersNow = () => page.locator('main [data-offer]').count();
      try {
        // The scorekeeper signs in on a shared phone and sees the buttons.
        await page.goto(`${origin}/north-valley`);
        await signInFromMenu(page, scorekeeper);
        await offersDrawn(page);
        note('the scorekeeper sees "Score this game" before signing out', (await offersNow()) > 0);

        // Signs out with the account menu.
        await openMenu(page);
        // Since step 2.163 (R-30) signing out leaves the person on the page they were on,
        // saying "You are signed out.", rather than at /signin.
        await Promise.all([
          page.waitForURL(
            (url) =>
              url.pathname === '/north-valley' && url.searchParams.get('notice') === 'signedOut',
          ),
          // The menu's own button: the header holds one for each width, one of them shown.
          page.locator('.site-header .site-account-sign-out').filter({ visible: true }).click(),
        ]);

        // Back to the league home they were on: asked again, as nobody, and no button. The
        // read is the Back page's own (sent from the address without the notice), never the
        // signed-out page's; none within 15 s fails, as a page kept from before signing out
        // would show its buttons without asking.
        const isBackRead = (r) => {
          if (!new URL(r.url()).pathname.endsWith('/scoring')) return false;
          const from = r.request().headers()['referer'];
          return from !== undefined && !new URL(from).searchParams.has('notice');
        };
        const backRead = page
          .waitForResponse(isBackRead, { timeout: 15_000 })
          .then((answer) => ({ answer }))
          .catch((error) => ({ error: String(error?.message ?? error).split('\n')[0] }));
        await page.goBack();
        await page.waitForURL((url) => url.pathname === '/north-valley' && url.search === '');
        const back = await backRead;
        const backBody = back.answer === undefined ? null : await back.answer.json();
        note(
          'after Back, the page asked again, as nobody, and was told of no games',
          Array.isArray(backBody?.games) && backBody.games.length === 0,
          back.error ?? JSON.stringify(backBody),
        );
        await page.waitForTimeout(400);
        note('after signing out and going Back, no card has a button', (await offersNow()) === 0);

        // The league's home by its link, in the same document.
        const homeRead = readOfPage(page, false);
        await page.locator('.site-header a.site-name').click();
        await page.waitForURL((url) => url.pathname === '/north-valley');
        await homeRead;
        note(
          "after signing out, the league's home by its link has no button",
          (await offersNow()) === 0,
        );

        // The next person, a coach, signs in on the same phone: no button anywhere.
        await signInFromMenu(page, coach);
        note('a coach signed in after the scorekeeper sees no button', (await offersNow()) === 0);
        const scheduleRead = readOfPage(page);
        await openMenu(page);
        await link(page.locator('.site-header'), 'Schedule').first().click();
        await page.waitForURL((url) => url.pathname === '/north-valley/schedule');
        await scheduleRead;
        note(
          "the coach's schedule after the scorekeeper's has no button",
          (await offersNow()) === 0,
        );
      } finally {
        await context.close();
      }
    },
  );

  await step(
    'a visitor, a coach, another league’s admin and scorekeeper see no button',
    async () => {
      const pages = [
        '/north-valley',
        '/north-valley/schedule',
        '/north-valley/teams/hawks',
        `/north-valley/games/${trackedTomorrow}`,
      ];
      for (const who of [undefined, 'coach', 'otherAdmin']) {
        const { context, page } = await fresh(who);
        const name = who ?? 'a visitor';
        try {
          for (const path of pages) {
            const answer = await open(page, path);
            const body = answer === null ? null : await answer.json().catch(() => null);
            note(
              `${name}'s read of ${path} holds no games`,
              body !== null && Array.isArray(body.games) && body.games.length === 0,
              JSON.stringify(body),
            );
            note(
              `${name} sees no button on ${path}`,
              (await page.locator('main [data-offer]').count()) === 0,
            );
          }
        } finally {
          await context.close();
        }
      }
      // Another league's scorekeeper: the made-up scorekeeper scores in North Valley (and the
      // draft and archived leagues) and holds nothing in Harbor City. On Harbor City's own
      // pages, none.
      const { context, page } = await fresh('scorekeeper');
      try {
        for (const path of ['/harbor-city', '/harbor-city/schedule']) {
          const answer = await open(page, path, false);
          const body = answer === null ? null : await answer.json().catch(() => null);
          note(
            `another league's scorekeeper's read of ${path} holds no games`,
            answer === null || (Array.isArray(body?.games) && body.games.length === 0),
            JSON.stringify(body),
          );
          note(
            `another league's scorekeeper sees no button on ${path}`,
            (await page.locator('main .ui-game-card').count()) > 0 &&
              (await page.locator('main [data-offer]').count()) === 0,
          );
        }
      } finally {
        await context.close();
      }
    },
  );

  await step(
    'where only assigned scorekeepers may score, the scorekeeper sees theirs only',
    async () => {
      const { context, page } = await fresh('scorekeeper');
      try {
        await open(page, '/quiet-pines/schedule');
        const cards = await cardsOn(page);
        const offered = cards.filter((card) => card.offer !== null).map((card) => card.game);
        note(
          'a button only on the scorekeeper’s assigned game whose day has come',
          offered.every((id) => id === draftUnscored),
          offered.join(', '),
        );
        note(
          'none on the live game, assigned to the league’s admin',
          cardOf(cards, liveGame) !== undefined && cardOf(cards, liveGame)?.offer === null,
          JSON.stringify(cardOf(cards, liveGame)),
        );
        note(
          'none yet on their assigned game two days ahead (S-70)',
          cardOf(cards, finalScoreLater) !== undefined &&
            cardOf(cards, finalScoreLater)?.offer === null,
          JSON.stringify(cardOf(cards, finalScoreLater)),
        );
        // Their game of two days ago that nobody scored: "Enter the score", to its row.
        await open(page, `/quiet-pines/games/${draftUnscored}`);
        await gameOffer(page).waitFor();
        note(
          'their assigned game of two days ago with no result says "Enter the score"',
          (await gameOffer(page).textContent())?.trim() === 'Enter the score' &&
            (await gameOffer(page).getAttribute('href')) ===
              `/quiet-pines/admin/games#game-${draftUnscored}`,
          String(await gameOffer(page).getAttribute('href')),
        );
      } finally {
        await context.close();
      }
    },
  );

  await step(
    'the page is the same for a visitor and the scorekeeper where it shows games',
    async () => {
      const visitor = await fresh();
      const keeper = await fresh('scorekeeper');
      try {
        const mainOf = (html) => html.slice(html.indexOf('<main'), html.indexOf('</main>') + 7);
        for (const path of [
          '/north-valley',
          '/north-valley/schedule',
          '/north-valley/teams/hawks',
          `/north-valley/games/${trackedTomorrow}`,
        ]) {
          const [seen, signedIn] = await Promise.all(
            [visitor, keeper].map(async ({ context }) =>
              (await context.request.get(`${origin}${path}`)).text(),
            ),
          );
          note(
            `${path}: the scorekeeper is signed in on the page fetched`,
            // Known by the cookie alone, the made-up scorekeeper's address is the token's.
            signedIn.includes(`Signed in as ${tokens.scorekeeper}@example.test`),
          );
          note(
            `${path}: the games are drawn the same for a visitor and the scorekeeper`,
            mainOf(seen).length > 100 && mainOf(seen) === mainOf(signedIn),
          );
          const traces = [
            'Score this game',
            'Enter the score',
            'data-offer',
            '/north-valley/score/',
            '/admin/games#game-',
          ].filter((trace) => signedIn.includes(trace) || seen.includes(trace));
          note(
            `${path}: the page as served holds no trace of a button`,
            traces.length === 0,
            traces.join(', '),
          );
        }
      } finally {
        await visitor.context.close();
        await keeper.context.close();
      }
    },
  );

  await step(
    'the place stands at one height across a row, and a visitor’s cards never move',
    async () => {
      const laptop = { width: 1280, height: 900 };
      /** Every card's box and its place line's, to the hundredth of a pixel. */
      const boxes = (page) =>
        page.$$eval('main .ui-game-card', (cards) =>
          cards.map((card) => {
            const at = (el) => {
              if (el === null) return null;
              const b = el.getBoundingClientRect();
              return [b.left, b.top, b.width, b.height].map((v) => Math.round(v * 100) / 100);
            };
            return { card: at(card), place: at(card.querySelector('.ui-game-foot')) };
          }),
        );
      // A visitor at laptop width: measured with the read held back, and again after it has
      // answered; then once more with the rule for lists that have a button taken out.
      const visitor = await browser.newContext({ viewport: laptop });
      try {
        const page = await visitor.newPage();
        page.setDefaultTimeout(30_000);
        let release = () => {};
        const held = new Promise((done) => (release = done));
        await page.route('**/api/v1/leagues/*/scoring*', async (route) => {
          await held;
          await route.continue();
        });
        await page.goto(`${origin}/north-valley/schedule`);
        // In the page, not in sight: a finished round's cards are folded away.
        await page.locator('main .ui-game-card').first().waitFor({ state: 'attached' });
        const before = await boxes(page);
        const read = page.waitForResponse((r) => new URL(r.url()).pathname.endsWith('/scoring'));
        release();
        await read;
        await page.waitForTimeout(400);
        const after = await boxes(page);
        note(
          "a visitor's cards do not move by one pixel when the page's read answers",
          before.length > 0 && JSON.stringify(before) === JSON.stringify(after),
        );
        const removed = await page.evaluate(() => {
          let count = 0;
          for (const sheet of document.styleSheets) {
            let rules;
            try {
              rules = sheet.cssRules;
            } catch {
              continue;
            }
            for (let i = rules.length - 1; i >= 0; i -= 1) {
              if (rules[i].selectorText?.includes(':has(.ui-game-action)')) {
                sheet.deleteRule(i);
                count += 1;
              }
            }
          }
          return count;
        });
        const without = await boxes(page);
        note(
          "the rule for a list with a button changes no pixel of a visitor's cards",
          removed > 0 && JSON.stringify(without) === JSON.stringify(after),
          `rules taken out: ${removed}`,
        );
      } finally {
        await visitor.close();
      }
      // The scorekeeper at laptop width: in a row where one card has a button and another
      // has none, both places stand at the same height.
      const keeper = await fresh('scorekeeper', { viewport: laptop });
      try {
        await open(keeper.page, '/north-valley/schedule');
        await offersDrawn(keeper.page);
        const rows = await keeper.page.$$eval('main .ui-card-grid', (grids) =>
          grids.flatMap((grid) => {
            const byRow = new Map();
            for (const card of grid.querySelectorAll('.ui-game-card[data-layout="board"]')) {
              if (card.getClientRects().length === 0) continue;
              const top = Math.round(card.getBoundingClientRect().top);
              const place = card.querySelector('.ui-game-foot')?.getBoundingClientRect().top;
              const entry = { action: card.querySelector('.ui-game-action') !== null, place };
              byRow.set(top, [...(byRow.get(top) ?? []), entry]);
            }
            return [...byRow.values()].filter(
              (row) => row.some((c) => c.action) && row.some((c) => !c.action),
            );
          }),
        );
        const uneven = rows.filter((row) => new Set(row.map((c) => Math.round(c.place))).size > 1);
        note(
          'in a row of cards with and without a button, every place stands at one height',
          rows.length > 0 && uneven.length === 0,
          JSON.stringify({ rows: rows.length, uneven }),
        );
      } finally {
        await keeper.context.close();
      }
    },
  );

  await step('with scripts off there is no button, and "My games to score" leads on', async () => {
    const { context, page } = await fresh('scorekeeper', { javaScriptEnabled: false });
    try {
      await page.goto(`${origin}/north-valley`);
      note(
        'with scripts off no button is drawn',
        (await page.locator('[data-offer]').count()) === 0,
      );
      await openMenu(page);
      await Promise.all([
        page.waitForURL((url) => url.pathname === '/north-valley/admin'),
        link(page, 'My games to score').click(),
      ]);
      note(
        'with scripts off "My games to score" leads to the scorekeeper’s games',
        (await page.getByRole('heading', { level: 1, name: 'Your games' }).count()) === 1,
      );
    } finally {
      await context.close();
    }
  });
}

await browser?.close();
server?.child.kill();

if (failures.length > 0) {
  console.error(`Score-this-game browser test failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`Score-this-game browser test passed (${checked.length} checks).`);
