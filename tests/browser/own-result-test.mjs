// Step 2.177: a scorekeeper undoes a final score they typed themselves (P7 §5.5, S-52,
// S-36). The made-up world, its clock started at the league's noon (LOCAL_NOW), so the
// minutes read on the screen are known:
//
// - a scorekeeper saves a wrong final score in Games, reads that they can correct it until
//   half past twelve, taps "Correct this result"; the reopen form, with a reason, is sent
//   to the server twice at once with the same version (a double tap on a slow phone), and
//   both are answered "reopened"; they save the right score: the public page shows it,
//   and the league's own activity log, read by the owner, holds ONE entry of it;
// - for a score another person typed (seeded, typed by the owner), and for a forfeit a
//   scheduler records by hand, they read who can, and a reopen sent to the server directly
//   (the reopen form of their own game, pointed at the other game) is refused and changes
//   nothing: the games' public pages read as before, and no reopen naming them is logged;
// - after the minutes (the owner sets the league's minutes to 1; the page is read again
//   for at most 90 seconds), they read that their time is over and who can.
//
// `--pictures=<folder>` keeps the result card at four widths, in both states.
// `--no-build` uses the build already there.
import { mkdirSync } from 'node:fs';
import {
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
const step = async (name, run) => {
  try {
    await run();
  } catch (error) {
    failures.push(`${name}: ${String(error?.message ?? error).split('\n')[0]}`);
  }
};

const mine = '01900000-0000-7000-8000-006a00000001'; // Tigers at Lions, final score only
const forfeitGame = '01900000-0000-7000-8000-006a00000003'; // Lions at Hawks
const othersGame = '01900000-0000-7000-8000-006a00000005'; // Lions at Bears, typed by the owner
const phone = { width: 390, height: 844 };
const reasonLabel = 'Why it needs correcting (kept in the log, never shown publicly)';
const stamp = Date.now().toString(36);
const reason = `Typed into the wrong card ${stamp}`;
const sneaked = `Sent straight to the server ${stamp}`;
const reopened = 'Reopened the result they recorded for Lions against Tigers';
const who = 'Only a league admin or a scheduler can reopen this game.';
const timeOver =
  'Your time to reopen this game is over. Only a league admin or a scheduler can reopen it now.';
const untilOwn = /You recorded this result, so you can correct it until 12:3\d/;
const picturesArg = process.argv.find((a) => a.startsWith('--pictures='));
const pictures = picturesArg?.slice('--pictures='.length);
const widths = [320, 390, 768, 1280];

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

const row = (page, id) => page.locator(`li[id="game-${id}"]`);

async function signedIn(token, javaScriptEnabled = true) {
  const context = await browser.newContext({ viewport: phone, javaScriptEnabled });
  await context.addCookies([{ name: 'srl_session', value: token, url: origin }]);
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  return { context, page };
}

async function openGames(page) {
  await page.goto(`${origin}/north-valley/admin/games`);
  await page.getByRole('heading', { level: 1, name: 'Games' }).waitFor();
}

async function saveFinal(page, tigers, lions) {
  const game = row(page, mine);
  if (!(await game.getByLabel('Score for Tigers').isVisible())) {
    await game.getByText('Enter the final score').click();
  }
  await game.getByLabel('Score for Tigers').fill(String(tigers));
  await game.getByLabel('Score for Lions').fill(String(lions));
  await game.getByRole('button', { name: 'Save final score' }).click();
  await game.getByRole('button', { name: 'Yes, make it final' }).click();
  await game
    .getByText(/^Saved: /)
    .or(game.getByRole('alert'))
    .waitFor();
  note(
    `"Saved" for ${tigers}-${lions}`,
    (await game.getByRole('status').textContent()) ===
      `Saved: Tigers ${tigers}, Lions ${lions} is final.`,
    (await game.textContent()) ?? '',
  );
}

/** The text of a page read signed out, or signed in with `token`. */
async function textOf(path, token) {
  const { context, page } =
    token === undefined
      ? { context: await browser.newContext({ viewport: phone }), page: undefined }
      : await signedIn(token);
  try {
    const p = page ?? (await context.newPage());
    await p.goto(`${origin}${path}`);
    await p.locator('main').waitFor();
    return p;
  } catch (error) {
    await context.close();
    throw error;
  }
}

/**
 * The owner's activity log: how many entries carry this text, or pass this test (the
 * server's own record).
 */
async function entriesWith(text) {
  const page = await textOf('/north-valley/admin/settings/activity', 'local-owner-token');
  try {
    await page.locator('[data-activity-log]').waitFor();
    const entries = page.locator('[data-activity-log] li[data-entry]');
    const all = await entries.allTextContents();
    const matches = typeof text === 'function' ? text : (e) => e.includes(text);
    return {
      count: all.filter(matches).length,
      first: all.slice(0, 3).join(' | '),
    };
  } finally {
    await page.context().close();
  }
}

/**
 * The reopen form of the scorekeeper's own game, read with scripts off (a plain form),
 * drawn twice (each drawing has a request token of its own, the same version). All at
 * once: the first drawing posted twice (a double tap: the same request, which the server
 * runs once) and the second posted once (another request with the same version: only the
 * version check answers it). Each answer's status and where it sends the browser.
 */
async function sendTwice(why) {
  const { context, page } = await signedIn('local-scorekeeper-token', false);
  const drawn = async () => {
    await page.goto(`${origin}/north-valley/admin/games/${mine}`);
    const form = page.locator('form', { has: page.getByLabel(reasonLabel) });
    await form.waitFor();
    await page.getByLabel(reasonLabel).fill(why);
    return form.evaluate((f) => {
      const button = [...f.querySelectorAll('button')].find(
        (b) => b.textContent.trim() === 'Reopen to correct',
      );
      const fields = [...new FormData(f, button)].map(([k, v]) => [k, String(v)]);
      return { action: f.action, fields };
    });
  };
  try {
    const first = await drawn();
    const second = await drawn();
    const versions = [first, second].map((d) => d.fields.find(([k]) => k === 'version')?.[1]);
    if (versions[0] === undefined || versions[0] !== versions[1]) {
      throw new Error(`the two drawings differ in version: ${versions.join(', ')}`);
    }
    const post = (sent) =>
      context.request.post(sent.action, {
        headers: { origin },
        multipart: Object.fromEntries(sent.fields),
        maxRedirects: 0,
      });
    const answers = await Promise.all([post(first), post(first), post(second)]);
    return answers.map((a) => ({
      status: a.status(),
      to: new URL(a.headers()['location'] ?? '/none', origin).pathname,
    }));
  } finally {
    await context.close();
  }
}

/** What the public page of a game says, read signed out (the server's result). */
async function publicResult(id) {
  const page = await textOf(`/north-valley/games/${id}`);
  try {
    return (await page.locator('main').textContent()) ?? '';
  } finally {
    await page.context().close();
  }
}

async function keepPictures(page, id, state) {
  if (pictures === undefined) return;
  mkdirSync(pictures, { recursive: true });
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await row(page, id).scrollIntoViewIfNeeded();
    await row(page, id).screenshot({ path: `${pictures}/own-result-${state}-${width}.png` });
  }
  await page.setViewportSize(phone);
}

if (browser) {
  await step('a scorekeeper corrects a final score they typed, within the minutes', async () => {
    const { context, page } = await signedIn('local-scorekeeper-token');
    try {
      await openGames(page);
      await saveFinal(page, 47, 51);
      const line = row(page, mine).locator('[data-reopen="correct"]');
      const text = (await line.textContent()) ?? '';
      note('their own entry reads until when they can correct it', untilOwn.test(text), text);
      await keepPictures(page, mine, 'until');
      await Promise.all([
        page.waitForURL((url) => url.pathname === `/north-valley/admin/games/${mine}`),
        line.getByRole('link', { name: 'Correct this result' }).click(),
      ]);
      const form = page.locator('form', { has: page.getByLabel(reasonLabel) });
      note("the game's page says until when too", untilOwn.test((await form.textContent()) ?? ''));
      // A double tap on a slow phone: the reopen form, with the same version, sent to the
      // server twice at once (two requests, not one the page holds back).
      const twice = await sendTwice(reason);
      note(
        'all three requests are answered "reopened" (the later ones as the server answers a repeat)',
        twice.every((a) => a.status === 303 && a.to === '/north-valley/admin/games'),
        JSON.stringify(twice),
      );
      await openGames(page);
      await saveFinal(page, 49, 51);
      // The reason is kept with the correction, not in the log (as for an admin's reopen).
      const log = await entriesWith(reopened);
      note('a double request writes one activity entry', log.count === 1, JSON.stringify(log));
      const pub = await textOf(`/north-valley/games/${mine}`);
      const words = (await pub.locator('main').textContent()) ?? '';
      await pub.context().close();
      note(
        'the public page shows the right score',
        words.includes('49') && words.includes('51') && !words.includes('47'),
        words.slice(0, 300),
      );
    } finally {
      await context.close();
    }
  });

  await step('a scheduler records a forfeit by hand', async () => {
    const { context, page } = await signedIn('local-scheduler-token');
    try {
      await openGames(page);
      const game = row(page, forfeitGame);
      const panel = game.locator('details[data-call-off]').last();
      if ((await panel.getAttribute('open')) === null) await panel.locator('> summary').click();
      await game.getByLabel('Team that forfeits').selectOption({ label: 'Lions' });
      await game.getByRole('button', { name: 'Record forfeit', exact: true }).click();
      await game.locator('[data-call-off-ask]').waitFor();
      // The question is read before "Yes" (a sooner tap is taken as a double tap).
      await page.waitForTimeout(1000);
      await game.locator('[data-call-off-yes]').click();
      const offer = game.getByRole('link', { name: 'Correct this result' });
      await offer.waitFor();
      note(
        'the scheduler, who may correct games, is offered the forfeit once, with no time limit',
        (await offer.count()) === 1 && !/until \d/.test((await game.textContent()) ?? ''),
        (await game.textContent()) ?? '',
      );
    } finally {
      await context.close();
    }
  });

  await step('for a result another person recorded, they read who can', async () => {
    const { context, page } = await signedIn('local-scorekeeper-token');
    try {
      await openGames(page);
      for (const [id, what] of [
        [othersGame, 'a final score the owner typed'],
        [forfeitGame, 'a forfeit the scheduler recorded'],
      ]) {
        const game = row(page, id);
        note(
          `${what}: who can, and no way to reopen`,
          (await game.getByText(who).count()) === 1 &&
            (await game.getByRole('link', { name: 'Correct this result' }).count()) === 0,
          (await game.textContent()) ?? '',
        );
      }
      await keepPictures(page, othersGame, 'who');
    } finally {
      await context.close();
    }
  });

  await step(
    'a reopen sent straight to the server for someone else’s result is refused',
    async () => {
      // Scripts off: the form posts as a plain form, so what it sends is what is changed.
      const resultsBefore = new Map();
      for (const id of [othersGame, forfeitGame]) resultsBefore.set(id, await publicResult(id));
      const { context, page } = await signedIn('local-scorekeeper-token', false);
      try {
        for (const id of [othersGame, forfeitGame]) {
          await page.goto(`${origin}/north-valley/admin/games/${mine}`);
          const form = page.locator('form', { has: page.getByLabel(reasonLabel) });
          await form.waitFor();
          await form.evaluate((f, target) => {
            f.querySelector('input[name="gameId"]').value = target;
            f.querySelector('input[name="version"]').value = '2';
          }, id);
          await page.getByLabel(reasonLabel).fill(sneaked);
          await Promise.all([
            page.waitForLoadState('load', { timeout: 30_000 }),
            form.getByRole('button', { name: 'Reopen to correct' }).click(),
          ]);
          await page.locator('main').waitFor();
        }
        await openGames(page);
        for (const id of [othersGame, forfeitGame]) {
          note(
            `the direct request left ${id === othersGame ? 'the final score' : 'the forfeit'} decided`,
            (await row(page, id).getByText(who).count()) === 1,
            (await row(page, id).textContent()) ?? '',
          );
        }
        // The results the server shows publicly are the ones it had before the requests.
        for (const id of [othersGame, forfeitGame]) {
          const now = await publicResult(id);
          note(
            `the public page of ${id === othersGame ? 'the final score' : 'the forfeit'} is unchanged`,
            now === resultsBefore.get(id),
            `${resultsBefore.get(id)} -> ${now}`,
          );
        }
        // Activity entries hold no reason: count the reopens that name either game.
        const log = await entriesWith(
          (e) => e.includes('Reopened') && e.includes('Lions') && /Bears|Hawks/.test(e),
        );
        note('the direct requests wrote no activity entry', log.count === 0, JSON.stringify(log));
      } finally {
        await context.close();
      }
    },
  );

  await step('after the minutes, they read that their time is over', async () => {
    const owner = await signedIn('local-owner-token');
    try {
      await owner.page.goto(`${origin}/north-valley/admin/settings`);
      const setting = owner.page.locator('[data-setting="games.scorekeeperReopenMinutes"]');
      await setting.locator('input:not([type="hidden"])').first().fill('1');
      await setting.locator('button[type="submit"]').first().click();
      await owner.page.waitForLoadState('load');
    } finally {
      await owner.context.close();
    }
    const { context, page } = await signedIn('local-scorekeeper-token');
    try {
      const until = Date.now() + 90_000;
      let text = '';
      while (Date.now() < until) {
        await openGames(page);
        text = (await row(page, mine).textContent()) ?? '';
        if (text.includes(timeOver)) break;
        await page.waitForTimeout(5_000);
      }
      note(
        'after the minutes: their time is over, and who can',
        text.includes(timeOver) &&
          (await row(page, mine).getByRole('link', { name: 'Correct this result' }).count()) === 0,
        text,
      );
    } finally {
      await context.close();
    }
  });
}

await browser?.close();
server?.child.kill();

if (failures.length > 0) {
  console.error(`Own result browser test failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`Own result browser test passed (${checked.length} checks).`);
