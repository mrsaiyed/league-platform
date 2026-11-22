// Step 2.37, part 2: what the scorekeeper meets on the scoring screen when things go
// wrong, in a real browser against the web app on its made-up stand-in (APP_ENV=test).
// Nothing leaves this computer; every team, game and person is made up. Builds the app
// first unless given --no-build.
//
// At the phone upright (390 x 844) and the same phone with its browser's bars showing
// (390 x 664), one game each, on a server of its own:
// - Leaving with plays waiting asks first and says how many; "Stay here" keeps the game.
// - Signed out mid-game (M4): taps are still taken, the screen says how many plays are
//   kept on this device and the banner never says "waiting to send"; the sign-in link
//   leads to sign in and back to this game, and the three taps are saved once.
// - A game taken over by another device while this one is idle (no tap getting through)
//   is learnt within seconds (T-295); the device then says so, lists the plays it could
//   not save one by one, and clears the list only when asked.
// - "Update needed": the screen says the plays are kept and offers Reload, never "Open
//   the game again"; reloaded, the plays are sent.
// While the scoring screen shows a notice, nothing scrolls and both fives stay whole.
// With SCORING_TROUBLE_PICTURES set to a folder, a picture of each such state goes there.
import path from 'node:path';
import {
  addPlayers,
  court,
  leagueId,
  liveGame,
  owner,
  scorekeeper,
  sizes,
  starters,
  trackerPath,
} from './tracker-driver.mjs';
import {
  buildNext,
  freePort,
  launch,
  startNext,
  waitFor,
  whatWentWrong,
} from './web-browser-kit.mjs';

process.setMaxListeners(32);

const pictures = process.env.SCORING_TROUBLE_PICTURES;
const picture = async (page, name) => {
  if (pictures) await page.screenshot({ path: path.join(pictures, `${name}.png`) });
};

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
const [phone, , , , phoneInBrowser] = sizes;

let built = true;
if (!process.argv.includes('--no-build')) {
  await step('building the web app', async () => {
    built = await buildNext();
    if (!built) throw new Error('next build failed or took over 10 minutes');
  });
}

const twoFrames = (page) =>
  page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  );

/** Nothing scrolls, both fives are whole and the pad is on the screen. */
async function still(page, label) {
  await twoFrames(page);
  const seen = await page.evaluate(() => {
    const pad = document.querySelector('[data-pad]').getBoundingClientRect();
    const teams = document.querySelector('[data-teams]');
    const held = getComputedStyle(teams).display !== 'contents';
    const block = teams.getBoundingClientRect();
    const tiles = [...document.querySelectorAll('[data-floor] .court-tile')];
    return {
      page: document.scrollingElement.scrollHeight - window.innerHeight,
      sideways: document.documentElement.scrollWidth - window.innerWidth,
      teams: held ? teams.scrollHeight - teams.clientHeight : 0,
      floorTiles: tiles.length,
      tilesNotWhole: tiles.filter((el) => {
        const r = el.getBoundingClientRect();
        const underPad =
          r.bottom > pad.top + 0.5 &&
          r.top < pad.bottom &&
          r.right > pad.left &&
          r.left < pad.right;
        return (
          r.top < 0 ||
          r.bottom > window.innerHeight ||
          underPad ||
          (held && r.bottom > block.bottom + 0.5)
        );
      }).length,
      padOffScreen: pad.bottom > window.innerHeight + 0.5 || pad.top < 0,
    };
  });
  note(
    `${label}: nothing scrolls, both fives are whole and the pad is on the screen`,
    seen.page <= 0 &&
      seen.sideways <= 0 &&
      seen.teams <= 0 &&
      seen.floorTiles === 10 &&
      seen.tilesNotWhole === 0 &&
      !seen.padOffScreen,
    JSON.stringify(seen),
  );
}

/** Asks for the game's scoring session from a device that is not the browser's. */
const session = async (origin, body, who = owner) => {
  const answer = await fetch(`${origin}/api/v1/leagues/${leagueId}/games/${liveGame}/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: `${who.name}=${who.value}`, origin },
    body: JSON.stringify(body),
  });
  const text = await answer.text();
  if (!answer.ok) throw new Error(`/session answered ${answer.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
};

const isCommands = (url) => url.pathname.endsWith('/commands');

async function oneGame(browser, size) {
  const at = `${size.width} x ${size.height}`;
  const origin = `http://localhost:${await freePort()}`;
  const server = startNext(['start', '--port', new URL(origin).port], {
    APP_ENV: 'test',
    PUBLIC_BASE_URL: origin,
  });
  let context;
  try {
    await waitFor(`${origin}/`, server);
    await addPlayers(origin);
    context = await browser.newContext({
      viewport: { width: size.width, height: size.height },
      hasTouch: true,
    });
    await context.addCookies([{ ...scorekeeper, url: origin }]);
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${origin}${trackerPath()}`);
    const c = court(page);
    await c.open();
    const play = async (side, jersey, act) => {
      const options = c.pad.locator(
        `[data-options="${await c.tile(side, jersey).getAttribute('data-player')}"]`,
      );
      if (!(await options.isVisible())) await c.tile(side, jersey).tap();
      await c.recorded(() => options.locator(`[data-act="${act}"]`).tap());
      await c.pad.locator('[data-rest]').waitFor();
    };
    const bannerSays = async () => (await c.banner.textContent()) ?? '';

    await step(`${at}: tip-off and a first basket, saved`, async () => {
      for (const jersey of starters) await c.tile('home', jersey).tap();
      for (const jersey of starters) await c.tile('away', jersey).tap();
      await page.locator('[data-scoring][data-stage="play"]').waitFor();
      await play('home', 5, 'p2');
      await c.saved();
    });

    await step(`${at}: leaving with plays waiting says how many`, async () => {
      await context.setOffline(true);
      await play('home', 9, 'p2');
      await play('away', 3, 'p2');
      await c.more.tap();
      await c.sheet.getByRole('link', { name: 'Back to your games' }).tap();
      const why = c.pad.locator('[data-leave-why]');
      await why.waitFor();
      note(
        `${at}: leaving with two plays waiting asks first and says how many`,
        (await why.innerText()).trim() ===
          '2 plays are not sent yet. Stay on this screen until it says “Saved”.',
        await why.innerText(),
      );
      await still(page, `${at}, asked before leaving`);
      await c.answer('no').tap();
      await why.waitFor({ state: 'detached' });
      note(`${at}: “Stay here” keeps the game on the screen`, page.url().includes('/score/'));
      await context.setOffline(false);
      await c.root.locator('[data-saved-banner][data-state="saved"]').waitFor({ timeout: 90_000 });
      note(
        `${at}: back online, the two plays are saved`,
        JSON.stringify(await c.score()) === '{"home":4,"away":2}',
        JSON.stringify(await c.score()),
      );
    });

    await step(
      `${at}: signed out mid-game, three taps kept, signed in from the link (M4)`,
      async () => {
        await context.clearCookies();
        await play('home', 7, 'p2');
        await play('away', 5, 'p2');
        await play('home', 11, 'p2');
        await page
          .getByText(
            'You are signed out. 3 plays are being kept on this device and are sent once you sign in again.',
          )
          .waitFor();
        const says = await bannerSays();
        note(
          `${at}: signed out, the banner says the three plays are kept, never waiting to send`,
          says.includes('3 plays kept on this device') &&
            says.includes('3 kept') &&
            !says.includes('to send'),
          says,
        );
        // The notice and its sign-in link once sat above the two teams on an upright phone
        // and pushed the teams' block 93 over, cutting a five: they are in the pad at rest
        // now, where the hint was, and nothing above the teams grows (step 2.37).
        await still(page, `${at}, signed out with the notice and its sign-in link`);
        await picture(page, `trouble-signed-out-${size.width}x${size.height}`);
        const placed = await page.evaluate(() => {
          const pad = document.querySelector('[data-pad]');
          const box = pad.querySelector('[data-pad-notices]');
          const link = box?.querySelector('a[href]')?.getBoundingClientRect();
          const rest = pad.querySelector('[data-rest]').getBoundingClientRect();
          return {
            inPad: box !== null && document.querySelector('.court-top .court-notices') === null,
            linkWhole:
              link !== undefined &&
              link.height >= 44 &&
              link.top >= rest.top - 0.5 &&
              link.bottom <= rest.bottom + 0.5 &&
              link.bottom <= window.innerHeight + 0.5,
          };
        });
        note(
          `${at}: signed out, the notice is in the pad, not above the teams, and its Sign in is whole`,
          placed.inPad && placed.linkWhole,
          JSON.stringify(placed),
        );
        const link = page.getByRole('link', { name: 'Sign in', exact: true });
        const href = new URL((await link.getAttribute('href')) ?? '', origin);
        note(
          `${at}: the sign-in link comes back to this game`,
          href.pathname === '/signin' && href.searchParams.get('next') === trackerPath(),
          href.toString(),
        );
        await Promise.all([page.waitForURL((url) => url.pathname === '/signin'), link.tap()]);
        // Signing in is made up here: the stand-in's scorekeeper has no password, so the
        // sign-in gives the browser its cookie back, as a real one would, and the link's
        // "next" brings it back to the game.
        await context.addCookies([{ ...scorekeeper, url: origin }]);
        await page.goto(`${origin}${href.searchParams.get('next')}`);
        const { tookOver } = await c.open();
        await c.saved();
        const back = await c.score();
        await page.reload();
        await c.open();
        const reloaded = await c.score();
        note(
          `${at}: signed in again, the three kept taps are saved once, with no takeover`,
          !tookOver &&
            JSON.stringify(back) === '{"home":8,"away":4}' &&
            JSON.stringify(reloaded) === JSON.stringify(back),
          JSON.stringify({ tookOver, back, reloaded }),
        );
      },
    );

    await step(`${at}: a game taken by another device is learnt within seconds`, async () => {
      // No tap gets through: only the renewal of the hold can tell.
      await page.route(isCommands, (route) => route.abort());
      await play('home', 3, 'p2');
      await play('away', 7, 'p3');
      const asked = await session(origin, { type: 'open', deviceId: 'owner-tablet' });
      if (asked.status !== 'held-by-other') throw new Error(JSON.stringify(asked));
      const taken = await session(origin, {
        type: 'take-over',
        deviceId: 'owner-tablet',
        confirmed: true,
        expectedHolderSince: asked.holder.since,
      });
      const from = Date.now();
      await page
        .getByText(
          'Someone else is now scoring this game on another device. This device can no longer score it.',
        )
        .waitFor({ timeout: 20_000 });
      const learnt = Date.now() - from;
      console.log(`${at}: the takeover was learnt in ${learnt} ms`);
      note(
        `${at}: the takeover is learnt within about one renewal (5 s, T-295)`,
        learnt <= 7_000,
        `${learnt} ms`,
      );
      const rows = page.locator('[data-kept-list] [data-kept-play]');
      const listed = (await rows.allInnerTexts()).map((row) => row.trim());
      note(
        `${at}: the plays not saved are listed one by one, oldest first, with period and clock`,
        listed.length === 2 &&
          /\+2$/.test(listed[0]) &&
          /\+3$/.test(listed[1]) &&
          listed.every((row) => /\d:\d\d/.test(row)),
        JSON.stringify(listed),
      );
      note(
        `${at}: the device offers to see who is scoring, and no longer shows the scoring screen`,
        (await page.getByRole('button', { name: 'See who is scoring' }).count()) === 1 &&
          (await c.root.count()) === 0,
      );
      const sideways = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      note(`${at}: after the takeover nothing scrolls sideways`, sideways <= 0, String(sideways));
      // Not holding the game, the list is for reading out, with no button (S-77).
      note(
        `${at}: on a device that lost the game the list says it is for reading out, with no Enter again`,
        (await page.locator('[data-kept-list] [data-read-aloud]').count()) === 1 &&
          (await page.locator('[data-enter-again]').count()) === 0,
      );
      await page.unroute(isCommands);
      await session(origin, { type: 'release', sessionId: taken.sessionId });
      await page.getByRole('button', { name: 'See who is scoring' }).tap();
      await c.open();
      // Holding the game again, each kept play can be entered again, as a new play now.
      const again = c.pad.locator('[data-kept-list] [data-enter-again]');
      await again.first().waitFor();
      note(
        `${at}: holding the game again, each kept play offers Enter again, in the pad`,
        (await again.count()) === 2 &&
          (await page.locator('[data-kept-list] [data-read-aloud]').count()) === 0,
        String(await again.count()),
      );
      await still(page, `${at}, the kept plays listed in the pad`);
      await again.first().tap();
      await page.locator('[data-kept-list] [data-kept-play]').nth(1).waitFor({ state: 'detached' });
      await c.saved();
      note(
        `${at}: Enter again records the play as a new one and takes it off the list`,
        JSON.stringify(await c.score()) === '{"home":10,"away":4}' &&
          (await page.locator('[data-kept-list] [data-kept-play]').count()) === 1,
        JSON.stringify(await c.score()),
      );
      await page.getByRole('button', { name: 'I have seen these: clear the list' }).tap();
      await page.locator('[data-kept-list]').waitFor({ state: 'detached' });
      note(`${at}: the list goes only by the tap that clears it`, true);
      await c.saved();
      note(
        `${at}: the play the other device took away and was not entered again is not on the score`,
        JSON.stringify(await c.score()) === '{"home":10,"away":4}',
        JSON.stringify(await c.score()),
      );
    });

    await step(
      `${at}: plays the league refuses are listed, and a long list scrolls in the pad`,
      async () => {
        // The league refuses every play (made up here: the answer a rule refusal gets).
        await page.route(isCommands, async (route) => {
          const batch = JSON.parse(route.request().postData() ?? '{}');
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              protocolVersion: batch.protocolVersion,
              sequence: 0,
              results: batch.commands.map((command) => ({
                commandId: command.commandId,
                status: 'refused',
                reason: { code: 'rule', message: 'made up for the test' },
              })),
            }),
          });
        });
        const refused = 10;
        const rows = page.locator('[data-not-applied-list] [data-not-applied-play]');
        // Each refused tap is shown, then taken off the score: the list is waited for instead.
        for (let n = 0; n < refused; n += 1) {
          await c.tile(n % 2 === 0 ? 'home' : 'away', 5).tap();
          await c.option('p2').tap();
          await rows.nth(n).waitFor();
        }
        await rows.nth(refused - 1).waitFor({ timeout: 30_000 });
        await page.getByText(`${refused} plays were not applied.`, { exact: false }).waitFor();
        note(
          `${at}: each refused play is listed under its notice, in the tracker's words`,
          (await rows.count()) === refused &&
            (await rows.allInnerTexts()).every((row) => /\+2/.test(row)),
          JSON.stringify(await rows.allInnerTexts()),
        );
        await still(page, `${at}, ten plays not applied`);
        const box = await page.evaluate(() => {
          const notices = document.querySelector('[data-pad] [data-pad-notices]');
          const rest = document.querySelector('[data-pad] [data-rest]').getBoundingClientRect();
          const r = notices?.getBoundingClientRect();
          return {
            inPad: notices !== null && notices !== undefined,
            scrollsInside: notices !== null && notices.scrollHeight > notices.clientHeight,
            withinPad: r !== undefined && r.bottom <= rest.bottom + 0.5 && r.top >= rest.top - 0.5,
          };
        });
        note(
          `${at}: the long list scrolls inside the pad, the pad keeps its place`,
          box.inPad && box.scrollsInside && box.withinPad,
          JSON.stringify(box),
        );
        await picture(page, `trouble-not-applied-${size.width}x${size.height}`);
        await page.unroute(isCommands);
        const last = page.locator('[data-not-applied-list] [data-enter-again]').last();
        await last.scrollIntoViewIfNeeded();
        await last.tap();
        await rows.nth(refused - 1).waitFor({ state: 'detached' });
        // The banner says "not applied" until the list is cleared, so it is cleared first.
        const left = await rows.count();
        await page.getByRole('button', { name: 'I have seen these: clear the list' }).tap();
        await page.locator('[data-not-applied-list]').waitFor({ state: 'detached' });
        await c.saved().catch(async () => {
          const pad = (await c.pad.innerText()).replace(/\s+/g, ' ').slice(0, 300);
          throw new Error(`not saved: the banner says “${await bannerSays()}”; the pad: ${pad}`);
        });
        note(
          `${at}: a refused play entered again is saved and leaves the list`,
          JSON.stringify(await c.score()) === '{"home":10,"away":6}' && left === refused - 1,
          JSON.stringify({ score: await c.score(), left }),
        );
        await still(page, `${at}, the not-applied list cleared`);
      },
    );

    await step(`${at}: “update needed” offers Reload, and the plays are kept`, async () => {
      await page.route(isCommands, (route) =>
        route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'unsupported-protocol-version', accepted: [99] }),
        }),
      );
      // The screen may give way to the notice before the pad comes back to rest.
      await c.tile('home', 5).tap();
      await c.option('p2').tap();
      await page
        .getByText(
          'This tracker needs an update. Tap Reload to keep scoring. Your plays are kept on this device.',
        )
        .waitFor();
      note(
        `${at}: “update needed” offers Reload and not “Open the game again”`,
        (await page.locator('[data-reload]').count()) === 1 &&
          (await page.getByRole('button', { name: 'Open the game again' }).count()) === 0,
      );
      await page.unroute(isCommands);
      await page.locator('[data-reload]').tap();
      await page.waitForLoadState('load');
      await c.open();
      await c.saved();
      note(
        `${at}: reloaded, the kept play is sent`,
        JSON.stringify(await c.score()) === '{"home":12,"away":6}',
        JSON.stringify(await c.score()),
      );
      await c.leave();
    });

    note(`${at}: no script errors`, errors.length === 0, errors.join(' | '));
  } finally {
    await context?.close();
    server.child.kill();
  }
}

const browser = built ? await launch() : null;
if (browser) {
  for (const size of [phone, phoneInBrowser]) {
    await step(`${size.width} x ${size.height}: one game`, () => oneGame(browser, size));
  }
}
await browser?.close();

if (failures.length > 0) {
  console.error(`Scoring trouble browser test: ${failures.length} problem(s)`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`Scoring trouble browser test passed: ${checked.length} checks.`);
