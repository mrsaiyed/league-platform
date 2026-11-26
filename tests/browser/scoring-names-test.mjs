// Step 2.226: names on the scoring screens (R-33) in a real browser at 390 wide, scripts on,
// against the web app on its made-up stand-in (APP_ENV=test). Nothing leaves this computer;
// every league, team and person is made up. LOCAL_SCORING_NAMES makes the made-up league a
// youth league, and on its game under way gives the home team's first player number 12, a
// child whose guardian asked for the name to be taken off (Robin Zabrowskiyy), and the
// away team's first player an adult who asked for initials (Robin Quillfeatherz, "R. Q.").
//
// - The made-up scorekeeper scores the first quarter, picking every player by number.
// - The score page as served, and its RSC: 1 answer, hold neither surname (searched bare)
//   and do hold "R. Q.".
// - The device's storage, read from the page (every IndexedDB store, local and session
//   storage, and the service worker's kept pages), holds neither surname.
// - The box score sheet as the page draws it shows "#12" and "R. Q." and neither surname.
// - The owner switches "Scorekeepers see full names" on (its wording drawn on the
//   settings page from the message files): the score page then reads everyone else in
//   full, those two still not.
// - Admin → Teams shows the recorded name, and the person's page beside it the "Show as".
// `--no-build` serves the build already here.
import { court, league, liveGame, owner, scorekeeper, trackerPath } from './tracker-driver.mjs';
import {
  buildNext,
  freePort,
  launch,
  settingAnswer,
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

const surnames = /Zabrowskiyy|Quillfeatherz/;
const holdsNeither = (label, text) => {
  const found = surnames.exec(text);
  note(`${label}: neither surname`, found === null, found?.[0]);
};

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
const fullNames = 'section[data-setting="privacy.scorekeepersSeeFullNames"]';

if (built) {
  server = startNext(['start', '--port', new URL(origin).port], {
    APP_ENV: 'test',
    PUBLIC_BASE_URL: origin,
    LOCAL_SCORING_NAMES: league,
  });
  await step('starting the server and the browser', async () => {
    await waitFor(`${origin}/`, server);
    browser = await launch();
  });
}

/** Everything the tracker's page keeps on the device, read from the page itself. */
const deviceStorage = (page) =>
  page.evaluate(async () => {
    const kept = { local: {}, session: {}, databases: {}, pages: [] };
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i) ?? '';
      kept.local[key] = localStorage.getItem(key);
    }
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const key = sessionStorage.key(i) ?? '';
      kept.session[key] = sessionStorage.getItem(key);
    }
    for (const { name } of await indexedDB.databases()) {
      if (name === undefined) continue;
      const db = await new Promise((done, fail) => {
        const asking = indexedDB.open(name);
        asking.onsuccess = () => done(asking.result);
        asking.onerror = () => fail(asking.error);
      });
      const stores = {};
      for (const store of db.objectStoreNames) {
        stores[store] = await new Promise((done, fail) => {
          const all = db.transaction(store, 'readonly').objectStore(store).getAll();
          all.onsuccess = () => done(all.result);
          all.onerror = () => fail(all.error);
        });
      }
      db.close();
      kept.databases[name] = stores;
    }
    if (typeof caches !== 'undefined') {
      for (const name of await caches.keys()) {
        const box = await caches.open(name);
        for (const asked of await box.keys()) {
          const answer = await box.match(asked);
          kept.pages.push({
            url: asked.url,
            text: answer === undefined ? '' : await answer.text(),
          });
        }
      }
    }
    return kept;
  });

if (browser) {
  const scorer = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await scorer.addCookies([{ ...scorekeeper, url: origin }]);
  const page = await scorer.newPage();
  page.setDefaultTimeout(60_000);
  const admin = await browser.newContext({ javaScriptEnabled: false });
  await admin.addCookies([{ ...owner, url: origin }]);
  const ownerPage = await admin.newPage();
  ownerPage.setDefaultTimeout(60_000);
  const c = court(page);
  const served = async (headers = {}) => {
    const answer = await page.request.get(`${origin}${trackerPath()}`, { headers });
    return { status: answer.status(), text: await answer.text() };
  };

  await step('the scorekeeper scores the first quarter, picking players by number', async () => {
    await page.goto(`${origin}${trackerPath()}`);
    await c.open();
    const homeTile = await c.tile('home', 12).innerText();
    const awayTile = await c.tile('away', 3).innerText();
    note(
      'the removed child is tile #12, with no name',
      !/Robin|Zabrowskiyy/.test(homeTile),
      homeTile,
    );
    note('the adult who asked is tile #3, "R. Q."', awayTile.includes('R. Q.'), awayTile);
    await c.pick('home', [12, 5, 7, 9, 11]);
    await c.pick('away', [3, 5, 7, 9, 11]);
    await c.play('home', 12, 'p2');
    await c.play('away', 3, 'p3');
    await c.play('home', 5, 'p2');
    await c.play('away', 3, 'foul');
    await c.play('home', 12, 'p1');
    await c.pickPeriod(2);
    await c.saved();
    note('the score is 5 to 3', JSON.stringify(await c.score()) === '{"home":5,"away":3}');
    note('#12 has 3 points', (await c.points('home', 12)) === 3);
    note('#3 of the visitors has 3 points', (await c.points('away', 3)) === 3);
  });

  await step('the score page as served and its RSC answer', async () => {
    const html = await served();
    const rsc = await served({ RSC: '1' });
    note('the score page is served', html.status === 200, String(html.status));
    note('its RSC answer is served', rsc.status === 200, String(rsc.status));
    holdsNeither('the score page as served', html.text);
    holdsNeither('its RSC answer', rsc.text);
    note('the score page as served holds "R. Q."', html.text.includes('R. Q.'));
    // A youth league shows the others by first name and last initial (R-14): no family name.
    note('off: the others by first name and last initial', !/Hawkins|Bearsley/.test(html.text));
  });

  await step("the device's storage", async () => {
    // The page refreshes its stored copy after it is drawn: 15 seconds at most.
    let kept = JSON.stringify(await deviceStorage(page));
    for (let i = 0; i < 30 && !/Hawkins/.test(kept); i += 1) {
      await page.waitForTimeout(500);
      kept = JSON.stringify(await deviceStorage(page));
    }
    note('the device keeps the game', kept.includes(liveGame));
    note('the device keeps "R. Q."', kept.includes('R. Q.'));
    holdsNeither("the device's storage", kept);
  });

  await step('the box score sheet as the page draws it', async () => {
    await ownerPage.goto(`${origin}/${league}/admin/games/${liveGame}`);
    const drawn = await ownerPage.locator('main').innerText();
    note('the sheet shows "#12"', drawn.includes('#12'), drawn.slice(0, 400));
    note('the sheet shows "R. Q."', drawn.includes('R. Q.'), drawn.slice(0, 400));
    holdsNeither('the box score sheet', drawn);
    holdsNeither('the box score sheet as served', await ownerPage.content());
  });

  await step('Scorekeepers see full names, switched on by the owner', async () => {
    await ownerPage.goto(`${origin}/${league}/admin/settings`);
    const section = ownerPage.locator(fullNames);
    const words = await section.innerText();
    note(
      'the settings page draws "Scorekeepers see full names"',
      words.includes('Scorekeepers see full names'),
      words,
    );
    note(
      'with a plain sentence of what it does',
      words.includes('Anyone shown as initials or with their name taken off always stays that way'),
    );
    // A yes-or-no setting is a choice of "Yes" and "No" (setting-fields.tsx).
    const asSelect = section.locator('select[name="value"]');
    if ((await asSelect.count()) > 0) await asSelect.selectOption('true');
    else await section.locator('input[name="value"][value="true"]').check();
    const answer = await settingAnswer(
      ownerPage,
      fullNames,
      section.locator('button[type=submit]').first(),
    );
    note('the setting is saved', answer.saved, answer.text);
    const html = await served();
    const rsc = await served({ RSC: '1' });
    // Served, a name in full keeps its two parts ("Ned", "Hawkins"), as the screens word them.
    note('on: the others read in full', /Hawkins/.test(html.text) && /Bearsley/.test(html.text));
    holdsNeither('on: the score page as served', html.text);
    holdsNeither('on: its RSC answer', rsc.text);
    note('on: the adult still "R. Q."', html.text.includes('R. Q.'));
    await page.reload();
    await c.root.waitFor();
    // The reloaded screen may be drawn from the page the worker kept, with the names it
    // had; whatever it keeps, it keeps neither surname.
    const kept = JSON.stringify(await deviceStorage(page));
    holdsNeither('on: the device storage after a reload', kept);
    await ownerPage.goto(`${origin}/${league}/admin/games/${liveGame}`);
    const drawn = await ownerPage.locator('main').innerText();
    note('on: the box score sheet draws the others in full', drawn.includes('Ned Hawkins'));
    note(
      'on: the box score sheet still "#12" and "R. Q."',
      drawn.includes('#12') && drawn.includes('R. Q.'),
    );
    holdsNeither('on: the box score sheet', drawn);
  });

  await step('Admin → Teams keeps the recorded name beside its Show as', async () => {
    await ownerPage.goto(`${origin}/${league}/admin/teams`);
    await ownerPage.locator('main a', { hasText: 'Hawks' }).first().click();
    await ownerPage.waitForURL(/\/admin\/teams\/./);
    const team = await ownerPage.locator('main').innerText();
    note(
      'the team page shows the recorded name',
      team.includes('Robin Zabrowskiyy'),
      team.slice(0, 400),
    );
    await ownerPage.locator('main a', { hasText: 'Robin Zabrowskiyy' }).first().click();
    await ownerPage.waitForURL(/\/admin\/people\/./);
    const request = await ownerPage.locator('[data-name-request]').innerText();
    note('the person page shows the Show as beside it', request.trim().length > 0, request);
  });
}

await browser?.close();
server?.child.kill();

if (failures.length > 0) {
  console.error(`Names on the scoring screens browser check failed:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(
  `Names on the scoring screens browser check passed: ${checked.length} checks in a real browser.`,
);
