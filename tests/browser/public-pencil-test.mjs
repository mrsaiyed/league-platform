// Step 2.56, part 4 (using-it audit H5; P4 §1): the public pencil. At 390 wide, from a
// decided game's public page and typing no other address, the league's owner sees "Correct
// this result", drawn after the page from the private scoring read, and reaches the game's
// reopen form in Games by tapping it. A visitor, a coach and a scorekeeper who may not
// reopen the game see nothing of it, and the page as served holds no trace of it for
// anyone. The made-up world; `--no-build` uses the build already there.
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

const phone = { width: 390, height: 844 };
// The made-up people known by their session cookie alone (stand-in-cast.ts).
const tokens = {
  owner: 'local-owner-token',
  scorekeeper: 'local-scorekeeper-token',
  coach: 'local-coach-token',
};
const hexId = (head, n) => `01900000-0000-7000-8000-${head}${n.toString(16).padStart(8, '0')}`;
/** This morning's game, final, its score typed in (stand-in-world-seed.ts). */
const finalGame = hexId('006a', 5);
const gamePage = `/north-valley/games/${finalGame}`;
const pencil = (page) => page.locator('[data-game-pencil]');

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

/** The game's page as `who` (a token, or null for a visitor), once its private read has answered. */
async function openAs(who) {
  const context = await browser.newContext({ viewport: phone });
  if (who !== null) {
    await context.addCookies([{ name: 'srl_session', value: who, url: origin }]);
  }
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  const asked = page.waitForResponse(
    (response) => response.url().includes('/scoring?') && response.url().includes('correct='),
  );
  const served = await page.goto(`${origin}${gamePage}`);
  const html = (await served?.text()) ?? '';
  const reply = await asked;
  return { context, page, html, reply };
}

if (browser) {
  await step('the owner sees the pencil and reaches the correction', async () => {
    const { context, page, html, reply } = await openAs(tokens.owner);
    try {
      note('the page as served holds no pencil', !html.includes('data-game-pencil'));
      note(
        'the read that draws it is private',
        (await reply.headerValue('cache-control')) === 'private, no-store',
      );
      const link = pencil(page).getByRole('link', { name: 'Correct this result' });
      await link.waitFor();
      const wide = await page.evaluate(() => document.documentElement.scrollWidth);
      note('nothing wider than the phone', wide <= phone.width, String(wide));
      await Promise.all([
        page.waitForURL((url) => url.pathname === `/north-valley/admin/games/${finalGame}`),
        link.click(),
      ]);
      await page.getByRole('button', { name: 'Reopen to correct' }).waitFor();
      note('the pencil leads to the game’s reopen form', true);
    } finally {
      await context.close();
    }
  });

  for (const [who, token] of [
    ['a visitor', null],
    ['a coach', tokens.coach],
    ['a scorekeeper who may not reopen it', tokens.scorekeeper],
  ]) {
    await step(`${who} sees no pencil`, async () => {
      const { context, page, html, reply } = await openAs(token);
      try {
        await reply.finished();
        // The page's script has had the answer; give React its turn to draw from it.
        await page.waitForTimeout(500);
        note(`${who}: the page as served holds no pencil`, !html.includes('data-game-pencil'));
        note(`${who}: no pencil is drawn`, (await pencil(page).count()) === 0);
        note(
          `${who}: no "Correct this result" anywhere`,
          (await page.getByText('Correct this result').count()) === 0,
        );
      } finally {
        await context.close();
      }
    });
  }
}

await browser?.close();
server?.child.kill();

if (failures.length > 0) {
  console.error(`Public pencil browser test failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`Public pencil browser test passed (${checked.length} checks).`);
