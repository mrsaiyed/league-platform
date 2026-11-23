// Step 2.38, part 3: the tracker kept on the device, in a real browser against the web app
// on its made-up stand-in (APP_ENV=test). Nothing leaves this computer; every team, game
// and person is made up. Builds the app first unless given --no-build.
//
// At the phone upright (390 x 844), one game, on a server of its own, the address typed
// once (the tracker), everything after it by the page's own links and a reload:
// - The first visit keeps the page and its code on the device; with the network off from
//   before the page reloads, it reopens on the scoring screen and keeps scoring, and the
//   taps are accepted when the network returns.
// - Offline again, a reload, two taps, and meanwhile another device takes the game: when
//   the network returns the two taps are listed as not saved, one by one.
// - With no signal to the league's server, the plays left on the device are listed in
//   "Your games" under "Kept on this device", and still a day later (the browser's clock
//   moved); they open the tracker and are sent.
// - What the device keeps is one account's (T-321): another account signed in on the
//   device sees none of the first one's plays (they stay for it), and is never shown its
//   kept page, which is deleted.
// - A new release (a worker with another `?code=`) waits while a game is open on the
//   device, and takes over once none is.
// - Signing out clears the kept games, the kept pages and the worker.
// With TRACKER_OFFLINE_PICTURES set to a folder, pictures at phone and tablet width of
// the held games, the tracker reopened with no signal, and the not-saved list go there.
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

const [phone, , tablet] = sizes;
const pictures = process.env.TRACKER_OFFLINE_PICTURES;
/** A picture at phone width and one at tablet width, the page put back as it was. */
const picture = async (page, name) => {
  if (!pictures) return;
  for (const size of [phone, tablet]) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.waitForTimeout(300);
    await page.screenshot({
      path: path.join(pictures, `${name}-${size.width}x${size.height}.png`),
    });
  }
  await page.setViewportSize({ width: phone.width, height: phone.height });
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

let built = true;
if (!process.argv.includes('--no-build')) {
  await step('building the web app', async () => {
    built = await buildNext();
    if (!built) throw new Error('next build failed or took over 10 minutes');
  });
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

// The league's server takes no plays (the scoring session itself still answers).
const toServer = (url) => url.pathname.endsWith('/commands');

/** The tracker pages the worker keeps, each with the account its head names. */
const keptPages = (page) =>
  page.evaluate(async () => {
    const found = [];
    if (typeof caches === 'undefined') return found;
    for (const name of await caches.keys()) {
      if (!name.startsWith('srleagues-tracker ')) continue;
      const box = await caches.open(name);
      for (const asked of await box.keys()) {
        if (asked.url.includes('/_next/') || new URL(asked.url).pathname.endsWith('.css')) continue;
        const html = await (await box.match(asked)).text();
        const tag = (html.match(/<meta\b[^>]*>/gi) ?? []).find((t) =>
          t.includes('name="srleagues-account"'),
        );
        found.push({ url: asked.url, account: /content="([^"]*)"/.exec(tag ?? '')?.[1] ?? null });
      }
    }
    return found;
  });

/** How many rows a store of the tracker's own database holds; -1 when there is none. */
const rowsIn = (page, database) =>
  page.evaluate(
    (name) =>
      new Promise((done) => {
        const asking = indexedDB.open(name);
        asking.onupgradeneeded = () => asking.transaction.abort();
        asking.onerror = () => done(-1);
        asking.onsuccess = () => {
          const db = asking.result;
          const store = db.objectStoreNames[0];
          if (store === undefined) {
            db.close();
            done(-1);
            return;
          }
          const counting = db.transaction(store, 'readonly').objectStore(store).count();
          counting.onsuccess = () => {
            db.close();
            done(counting.result);
          };
        };
      }),
    database,
  );

const accountOfPage = (page) =>
  page.evaluate(
    () => document.querySelector('meta[name="srleagues-account"]')?.getAttribute('content') ?? null,
  );

async function until(page, what, test, label, ms = 20_000) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) {
    last = await what();
    if (test(last)) return last;
    await page.waitForTimeout(250);
  }
  throw new Error(`${label}: ${JSON.stringify(last)}`);
}

async function oneGame(browser) {
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
      viewport: { width: phone.width, height: phone.height },
      hasTouch: true,
    });
    await context.addCookies([{ ...scorekeeper, url: origin }]);
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    page.on('dialog', (dialog) => void dialog.accept());
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    // The one address typed: the tracker, as a scorekeeper opens it from a link.
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
    const held = page.locator('[data-held-games] [data-held-game]');
    let scorekeeperMark = null;

    await step('the first visit keeps the page and its code on the device', async () => {
      for (const jersey of starters) await c.tile('home', jersey).tap();
      for (const jersey of starters) await c.tile('away', jersey).tap();
      await page.locator('[data-scoring][data-stage="play"]').waitFor();
      await play('home', 5, 'p2');
      await c.saved();
      scorekeeperMark = await accountOfPage(page);
      const kept = await until(
        page,
        () => keptPages(page),
        (pages) => pages.some((p) => p.url.endsWith(`/score/${liveGame}`)),
        'the page was never kept',
      );
      note(
        'the first visit keeps the tracker page, under the account that opened it (T-321)',
        scorekeeperMark !== null && kept.every((p) => p.account === scorekeeperMark),
        JSON.stringify({ scorekeeperMark, kept }),
      );
    });

    await step(
      'offline from before the reload, the tracker reopens and keeps scoring',
      async () => {
        await context.setOffline(true);
        await page.reload();
        await c.open();
        note(
          'reloaded with no signal, the scoring screen is back with the score kept',
          JSON.stringify(await c.score()) === '{"home":2,"away":0}',
          JSON.stringify(await c.score()),
        );
        await play('home', 9, 'p2');
        await play('away', 3, 'p2');
        const banner = (await c.banner.innerText()).replace(/\s+/g, ' ').trim();
        note(
          'with no signal the banner says the two plays are waiting on this device',
          (await c.banner.getAttribute('data-state')) !== 'saved' && /\b2\b/.test(banner),
          banner,
        );
        await picture(page, 'offline-reopened');
        await context.setOffline(false);
        await c.root
          .locator('[data-saved-banner][data-state="saved"]')
          .waitFor({ timeout: 90_000 });
        // Saved means the two taps reached the server, unless the device listed them as
        // not saved: the score says which.
        await until(
          page,
          () => c.score(),
          (score) => JSON.stringify(score) === '{"home":4,"away":2}',
          'the two taps were not accepted',
          30_000,
        ).catch(() => undefined);
        note(
          'when the network returns, the taps made after the reload are accepted',
          JSON.stringify(await c.score()) === '{"home":4,"away":2}',
          JSON.stringify(await c.score()),
        );
      },
    );

    await step(
      'offline again, the game taken meanwhile: the taps are listed not saved',
      async () => {
        await context.setOffline(true);
        await page.reload();
        await c.open();
        await play('home', 7, 'p2');
        await play('away', 5, 'p3');
        const asked = await session(origin, { type: 'open', deviceId: 'owner-tablet' });
        if (asked.status !== 'held-by-other') throw new Error(JSON.stringify(asked));
        const taken = await session(origin, {
          type: 'take-over',
          deviceId: 'owner-tablet',
          confirmed: true,
          expectedHolderSince: asked.holder.since,
        });
        await context.setOffline(false);
        const rows = page.locator('[data-kept-list] [data-kept-play]');
        await rows.nth(1).waitFor({ timeout: 90_000 });
        const listed = (await rows.allInnerTexts()).map((row) => row.trim());
        note(
          'somebody took the game: the two taps made offline are listed as not saved, one by one',
          listed.length === 2 && /\+2$/.test(listed[0]) && /\+3$/.test(listed[1]),
          JSON.stringify(listed),
        );
        await picture(page, 'not-saved');
        await session(origin, { type: 'release', sessionId: taken.sessionId });
        // The game is free again: reopened, the list is still there (kept until seen).
        await page.reload();
        await c.open();
        await page.getByRole('button', { name: 'I have seen these: clear the list' }).tap();
        await page.locator('[data-kept-list]').waitFor({ state: 'detached' });
        note(
          'the plays not saved never reached the score',
          JSON.stringify(await c.score()) === '{"home":4,"away":2}',
          JSON.stringify(await c.score()),
        );
      },
    );

    await step('"Your games" lists the plays left on the device, and a day later', async () => {
      // No play reaches the league's server: they stay on the device.
      await page.route(toServer, (route) => route.abort());
      await play('home', 3, 'p2');
      await play('away', 7, 'p2');
      // Leaving by the screen's own link waits for the plays to be sent; the scorekeeper
      // goes to "Your games" by its address on the page (the same link's), not typed.
      await c.more.tap();
      const yourGames = await c.sheet
        .locator('a[href]')
        .filter({ hasText: 'Back to your games' })
        .getAttribute('href');
      await page.goto(new URL(yourGames, origin).href);
      await held.first().waitFor();
      note(
        '"Your games" lists the game under "Kept on this device", with its two plays waiting',
        (await held.count()) === 1 &&
          (await held.first().getAttribute('data-waiting')) === '2' &&
          (await held.first().locator('[data-held-open]').count()) === 1,
        JSON.stringify({
          count: await held.count(),
          waiting: await held.first().getAttribute('data-waiting'),
        }),
      );
      await picture(page, 'held-games');
      // A day later (the browser's clock moved): the server's list has moved on, the
      // device's has not.
      const later = await context.newPage();
      await later.clock.setFixedTime(new Date(Date.now() + 25 * 60 * 60 * 1000));
      await later.goto(page.url());
      const heldLater = later.locator('[data-held-games] [data-held-game]');
      await heldLater.first().waitFor();
      note(
        'a day later the game and its two plays are still listed',
        (await heldLater.count()) === 1 &&
          (await heldLater.first().getAttribute('data-waiting')) === '2',
      );
      await later.close();
    });

    await step(
      'another account on the device sees none of the plays, which stay (T-321)',
      async () => {
        const menuBefore = await page.locator('[data-account]').first().textContent();
        // The owner signs in on this device without the scorekeeper signing out.
        await context.addCookies([{ ...owner, url: origin }]);
        await page.reload();
        await page.locator('[data-account]').first().waitFor();
        note(
          'signed in as another account, "Your games" lists none of the first one’s plays',
          (await held.count()) === 0 &&
            (await page.locator('[data-account]').first().textContent()) !== menuBefore,
          JSON.stringify({ held: await held.count() }),
        );
        await context.addCookies([{ ...scorekeeper, url: origin }]);
        await page.reload();
        await held.first().waitFor();
        note(
          'back as the account that made them, the two plays are listed still',
          (await held.count()) === 1 && (await held.first().getAttribute('data-waiting')) === '2',
        );
        await page.unroute(toServer);
        await Promise.all([
          page.waitForURL((url) => url.pathname.includes('/score/')),
          held.first().locator('[data-held-open]').tap(),
        ]);
        await c.open();
        await c.saved();
        note(
          'opened from "Your games", the two kept plays are sent',
          JSON.stringify(await c.score()) === '{"home":6,"away":4}',
          JSON.stringify(await c.score()),
        );
      },
    );

    await step(
      'another account is never shown the kept page, which is deleted (T-321)',
      async () => {
        await until(
          page,
          () => keptPages(page),
          (pages) => pages.some((p) => p.account === scorekeeperMark),
          'the scorekeeper’s page was not kept',
        );
        await context.addCookies([{ ...owner, url: origin }]);
        await page.reload();
        await page.locator('[data-tracker]').first().waitFor();
        // On a slow answer the kept page may show for a moment, then the page is opened
        // again from the network (T-321): what counts is the page left showing.
        const shown = await until(
          page,
          () => accountOfPage(page).catch(() => null),
          (mark) => mark !== null && mark !== scorekeeperMark,
          'the kept page of the first account stayed',
        ).catch(() => scorekeeperMark);
        const kept = await keptPages(page);
        note(
          'with a game open, another account reloading the tracker gets its own page, not the kept one',
          shown !== null && shown !== scorekeeperMark,
          JSON.stringify({ shown, scorekeeperMark }),
        );
        note(
          'the first account’s kept pages are deleted from the device',
          kept.every((p) => p.account !== scorekeeperMark),
          JSON.stringify(kept),
        );
      },
    );

    await step('a new release waits while a game is open on the device', async () => {
      const games = await until(
        page,
        () => rowsIn(page, 'srleagues-tracker-games'),
        (n) => n > 0,
        'no game open on the device',
      );
      const next = await page.evaluate(async () => {
        const current = await navigator.serviceWorker.getRegistration();
        const address = new URL(current.active.scriptURL);
        address.searchParams.set('code', 'next-release');
        // The new release's script is fetched once more if the first fetch fails.
        const register = () =>
          navigator.serviceWorker.register(address.href, {
            scope: current.scope,
            updateViaCache: 'none',
          });
        const registration = await register().catch(() =>
          new Promise((done) => setTimeout(done, 1000)).then(register),
        );
        const coming = registration.installing ?? registration.waiting;
        if (coming && coming.state === 'installing') {
          await new Promise((done) => coming.addEventListener('statechange', done, { once: true }));
        }
        registration.waiting?.postMessage({ type: 'srleagues-tracker-update' });
        await new Promise((done) => setTimeout(done, 1500));
        return {
          waiting: registration.waiting?.scriptURL ?? null,
          active: registration.active?.scriptURL ?? null,
        };
      });
      note(
        'with a game open, the new release is waiting and the old one still answers',
        games > 0 &&
          next.waiting !== null &&
          next.waiting.includes('code=next-release') &&
          next.active !== null &&
          !next.active.includes('code=next-release'),
        JSON.stringify({ games, ...next }),
      );
      // The game closed on the device: nothing in its store of opened games.
      const after = await page.evaluate(async () => {
        await new Promise((done) => {
          const asking = indexedDB.open('srleagues-tracker-games');
          asking.onsuccess = () => {
            const db = asking.result;
            const tx = db.transaction('games', 'readwrite');
            tx.objectStore('games').clear();
            tx.oncomplete = () => {
              db.close();
              done();
            };
          };
        });
        const registration = await navigator.serviceWorker.getRegistration();
        registration.waiting?.postMessage({ type: 'srleagues-tracker-update' });
        for (
          let tries = 0;
          tries < 40 && !registration.active?.scriptURL.includes('next-release');
          tries += 1
        ) {
          await new Promise((done) => setTimeout(done, 250));
        }
        return registration.active?.scriptURL ?? null;
      });
      note(
        'once no game is open on the device, the new release takes over',
        after !== null && after.includes('code=next-release'),
        String(after),
      );
    });

    await step('signing out clears the kept games, the kept pages and the worker', async () => {
      await page.reload();
      await page.locator('[data-tracker]').first().waitFor();
      await until(
        page,
        () => rowsIn(page, 'srleagues-tracker-games'),
        (n) => n > 0,
        'no game kept',
      );
      await page.locator('[data-tracker] [data-account] > summary').click();
      await page.locator('[data-tracker] [data-account] .site-account-sign-out').click();
      // Signed out, the page has no account menu any more.
      await page.locator('[data-tracker] [data-account]').waitFor({ state: 'detached' });
      await page.waitForLoadState('load');
      const left = {
        games: await rowsIn(page, 'srleagues-tracker-games'),
        pages: (await keptPages(page)).length,
        caches: await page.evaluate(
          async () =>
            (await caches.keys()).filter((name) => name.startsWith('srleagues-tracker ')).length,
        ),
        workers: await page.evaluate(
          async () => (await navigator.serviceWorker.getRegistrations()).length,
        ),
      };
      note(
        'signed out, no game, no page, nothing kept and no worker is left on the device',
        left.games <= 0 && left.pages === 0 && left.caches === 0 && left.workers === 0,
        JSON.stringify(left),
      );
    });

    note('no script error on the page', errors.length === 0, errors.join(' | '));
  } finally {
    await context?.close();
    server.child.kill();
  }
}

const browser = built ? await launch() : null;
if (browser) await step('the tracker kept on the device', () => oneGame(browser));
await browser?.close();

for (const label of checked) console.log(`checked: ${label}`);
if (failures.length > 0) {
  console.error(`tracker-offline: ${failures.length} failed`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`tracker-offline: all ${checked.length} checks passed`);
