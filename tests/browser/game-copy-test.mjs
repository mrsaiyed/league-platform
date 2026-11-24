// Step 2.70: "Save a copy" and its upload (S-5, T-129, T6 §4). In a real browser against the
// web app on its made-up stand-in (APP_ENV=test): nothing leaves this computer; every team,
// game and person is made up. Builds the app first unless given --no-build.
//
// Two games, each on a server of its own (the stand-in starts afresh). In each, A, the
// scorekeeper's phone, scores with no signal, saves a copy of the game (the file the browser
// is handed is caught as a download) and makes one more play after saving it. On another
// browser context the copy is uploaded: in the first game by the same scorekeeper, in the
// second by the owner.
// - A still holds the game, so the page asks the tracker's takeover question, naming A;
//   (the owner's game) "Not now" sends nothing and leaves the game with A, "Yes, take over"
//   uploads.
// - The game then has each of the copy's plays on the server once, and the page says 3 were
//   new; the same file again adds nothing.
// - A comes back online: it is told it left the game and that its one later play still
//   waits. "Send these plays" puts that play on the server, and every play, the copy's and
//   the later one, is counted exactly once, nothing typed again (T-370); in the owner's
//   game A reloads first, and it is still so (T-373).
// - Someone who may not score the game (a coach, a signed-in person with no role) is
//   refused the page; someone signed out is sent to sign in.
// - Once the game is final, a copy with a play the server does not have is refused in the
//   page's words: "Reopen it first".
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  addPlayers,
  court,
  league,
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

const [phone] = sizes;
const coach = { name: 'srl_session', value: 'local-coach-token' };
const stranger = { name: 'srl_session', value: 'local-stranger-token' };
// The files this test writes, in the repository's own git-ignored folder.
const files = join(dirname(fileURLToPath(import.meta.url)), '../../.local/game-copy-test');
mkdirSync(files, { recursive: true });
const uploadPath = `/${league}/score/${liveGame}/upload`;

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

const api = (origin, at) => `${origin}/api/v1/leagues/${leagueId}/games/${liveGame}${at}`;

/** The game's scoring session asked for from outside the browsers, as the owner. */
const session = async (origin, body) => {
  const answer = await fetch(api(origin, '/session'), {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: `${owner.name}=${owner.value}`, origin },
    body: JSON.stringify(body),
  });
  return { status: answer.status, body: JSON.parse(await answer.text()) };
};

/** The server's own record of the game: its plays, as the box score is made from them. */
const serverState = async (origin) => {
  const answer = await fetch(api(origin, '/state'), {
    headers: { cookie: `${owner.name}=${owner.value}`, origin },
  });
  const text = await answer.text();
  if (!answer.ok) throw new Error(`/state answered ${answer.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text).state;
};
/** How many of the server's plays are points by each of `ids`. */
const pointsOf = (plays, ids) =>
  Object.fromEntries(
    Object.entries(ids).map(([k, id]) => [
      k,
      plays.filter((p) => p.playerId === id && typeof p.points === 'number').length,
    ]),
  );
/** The copy's 3 plays and the one made after it was saved, each once. */
const eachOnce = { home5: 1, home7: 1, home9: 1, away3: 1, away7: 1 };

/** A browser context of its own, signed in as `who`. */
async function contextOf(browser, origin, who, size = phone) {
  const context = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    hasTouch: true,
    acceptDownloads: true,
  });
  await context.addCookies([{ ...who, url: origin }]);
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return { context, page, errors };
}

/** The server's answers the upload page has shown so far (it counts them). */
const answersOn = async (form) => Number(await form.getAttribute('data-upload-answers'));

/** Waits for the upload page's next answer after `act`, and returns it. */
async function nextAnswer(page, act) {
  const form = page.locator('[data-upload-copy]');
  const before = await answersOn(form);
  await act(form);
  await page.waitForFunction(
    (n) => Number(document.querySelector('[data-upload-copy]')?.dataset.uploadAnswers) > n,
    before,
  );
  return form.locator('[data-upload-result]');
}

/** Picks `file` on the upload page and sends it; waits for the page's answer to it. */
const upload = (page, file) =>
  nextAnswer(page, async (form) => {
    await form.locator('[data-copy-file]').setInputFiles(file);
    await form.locator('[data-upload-send]').click();
  });

/**
 * One game on a server of its own: A scores, saves a copy and plays once more; `uploader`
 * uploads the copy; A sends its later play. The owner's game also reloads A before sending,
 * and runs the checks of who may upload and of a final game.
 */
async function copyRun(browser, uploader) {
  const byOwner = uploader === owner;
  const at = byOwner ? 'the owner uploads' : 'the same scorekeeper uploads';
  const origin = `http://localhost:${await freePort()}`;
  const server = startNext(['start', '--port', new URL(origin).port], {
    APP_ENV: 'test',
    PUBLIC_BASE_URL: origin,
  });
  const contexts = [];
  try {
    await waitFor(`${origin}/`, server);
    await addPlayers(origin);
    const a = await contextOf(browser, origin, scorekeeper);
    contexts.push(a);
    const c = court(a.page);
    const play = async (side, jersey, act) => {
      const options = c.pad.locator(
        `[data-options="${await c.tile(side, jersey).getAttribute('data-player')}"]`,
      );
      if (!(await options.isVisible())) await c.tile(side, jersey).tap();
      await c.recorded(() => options.locator(`[data-act="${act}"]`).tap());
      await c.pad.locator('[data-rest]').waitFor();
    };
    const copyFile = join(files, byOwner ? 'copy-owner.json' : 'copy-keeper.json');
    let ids = {};

    await step(`${at}: A scores with no signal, saves a copy, then plays once more`, async () => {
      await a.page.goto(`${origin}${trackerPath()}`);
      await c.open();
      for (const jersey of starters) await c.tile('home', jersey).tap();
      for (const jersey of starters) await c.tile('away', jersey).tap();
      await a.page.locator('[data-scoring][data-stage="play"]').waitFor();
      if (await c.startButton.isVisible()) await c.startButton.tap();
      await play('home', 5, 'p2');
      await c.saved();
      ids = {
        home5: await c.tile('home', 5).getAttribute('data-player'),
        home7: await c.tile('home', 7).getAttribute('data-player'),
        home9: await c.tile('home', 9).getAttribute('data-player'),
        away3: await c.tile('away', 3).getAttribute('data-player'),
        away7: await c.tile('away', 7).getAttribute('data-player'),
      };
      await a.context.setOffline(true);
      await play('home', 7, 'p2');
      await play('home', 9, 'p2');
      await play('away', 3, 'p3');
      await c.more.click();
      const more = a.page.locator('[data-more]');
      const link = more.locator('[data-upload-copy-link]');
      note(
        `${at}: Save a copy, behind More, says where the copy is uploaded, in a new tab`,
        (await link.getAttribute('href')) === uploadPath &&
          (await link.getAttribute('target')) === '_blank',
        `${await link.getAttribute('href')} ${await link.getAttribute('target')}`,
      );
      const [download] = await Promise.all([
        a.page.waitForEvent('download'),
        more.locator('[data-save-copy-button]').click(),
      ]);
      await download.saveAs(copyFile);
      const saved = more.locator('[data-copy-saved]');
      await saved.waitFor();
      const copy = JSON.parse(readFileSync(copyFile, 'utf8'));
      note(
        `${at}: the copy holds the 3 plays not yet on the server, for this league's game`,
        (await saved.getAttribute('data-copy-saved')) === '3' &&
          copy.commands.length === 3 &&
          copy.gameId === liveGame &&
          copy.leagueId === leagueId,
        `${await saved.getAttribute('data-copy-saved')} ${copy.commands?.length}`,
      );
      await a.page.keyboard.press('Escape');
      // A play made after the copy was saved: it is not in the file (T-370).
      await play('away', 7, 'p2');
    });

    const u = await contextOf(browser, origin, uploader, { width: 1280, height: 900 });
    contexts.push(u);
    const holderName = (await session(origin, { type: 'open', deviceId: 'probe' })).body.holder
      ?.displayName;

    await step(`${at}: the copy is uploaded from another computer`, async () => {
      await u.page.goto(`${origin}${uploadPath}`);
      const held = await upload(u.page, copyFile);
      const said = (await held.innerText()).trim();
      note(
        `${at}: A still holds the game: the page asks the takeover question, naming A`,
        (await held.getAttribute('data-upload-result')) === 'held-by-other' &&
          (byOwner
            ? typeof holderName === 'string' &&
              said.includes(`${holderName} is scoring this game on another device.`) &&
              said.includes(`Take over scoring from ${holderName}?`)
            : said.includes('You are scoring this game on another device.') &&
              said.includes('Take over scoring from you, on another device?')),
        said,
      );
      if (byOwner) {
        await held.locator('[data-upload-not-now]').click();
        await u.page.locator('[data-upload-result="not-now"]').waitFor();
        const still = await session(origin, { type: 'open', deviceId: 'probe' });
        const before = pointsOf((await serverState(origin)).plays, ids);
        note(
          '"Not now" sends nothing and leaves the game with A',
          still.body.status === 'held-by-other' &&
            still.body.holder.displayName === holderName &&
            JSON.stringify(before) ===
              JSON.stringify({ home5: 1, home7: 0, home9: 0, away3: 0, away7: 0 }),
          JSON.stringify({ still: still.body, before }),
        );
      }
      const asked = byOwner ? await upload(u.page, copyFile) : held;
      const done = await nextAnswer(u.page, () => asked.locator('[data-upload-take-over]').click());
      const after = pointsOf((await serverState(origin)).plays, ids);
      note(
        `${at}: after "Yes, take over" the page says 3 plays were new, and the game has each once`,
        (await done.getAttribute('data-added')) === '3' &&
          (await done.getAttribute('data-already-there')) === '0' &&
          (await done.innerText()).includes('3 plays were new') &&
          JSON.stringify(after) ===
            JSON.stringify({ home5: 1, home7: 1, home9: 1, away3: 1, away7: 0 }),
        JSON.stringify({ said: await done.innerText(), after }),
      );
      const again = await upload(u.page, copyFile);
      note(
        `${at}: the same file again adds nothing: the server had all 3`,
        (await again.getAttribute('data-upload-result')) === 'uploaded' &&
          (await again.getAttribute('data-added')) === '0' &&
          (await again.getAttribute('data-already-there')) === '3',
        await again.innerText(),
      );
    });

    await step(`${at}: A comes back online and sends its later play`, async () => {
      // The upload let go of the game when it was done, so A is told it has left the game,
      // with its later play still waiting on the device for "Send these plays".
      await a.context.setOffline(false);
      const shown = async () =>
        (await a.page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 800);
      const kept = a.page.locator('[data-kept-list] [data-kept-play]');
      const waiting =
        'This device has left the game. 1 play made here is still waiting: it is not on the server yet.';
      const offered = async (when) => {
        try {
          await a.page.locator('[data-send-not-saved="offered"] [data-send-plays]').waitFor({
            timeout: 90_000,
          });
        } catch (error) {
          throw new Error(`${when}: ${whatWentWrong(error)}; A shows: ${await shown()}`);
        }
        note(
          `${at}: ${when}, A is told it left the game and that its 1 later play waits, with "Send these plays"`,
          (await kept.count()) === 1 &&
            (await a.page.locator('[data-tracker-notices]').innerText()).includes(waiting),
          `${await kept.count()} listed; ${await shown()}`,
        );
      };
      await offered('back online');
      if (byOwner) {
        // T-373: A reloads before "Send these plays". Nobody holds the game, so A opens it
        // again; the list and the copy's plays kept as taken are read back, and the send
        // still names the session the list was made under.
        await a.page.reload();
        await c.open();
        try {
          await a.page.locator('[data-send-not-saved="offered"] [data-send-plays]').waitFor({
            timeout: 90_000,
          });
        } catch (error) {
          throw new Error(`after a reload: ${whatWentWrong(error)}; A shows: ${await shown()}`);
        }
        note(
          `${at}: after a reload A still lists its 1 later play, with "Send these plays"`,
          (await kept.count()) === 1,
          `${await kept.count()} listed; ${await shown()}`,
        );
      }
      await a.page.locator('[data-send-plays]').tap();
      await a.page.locator('[data-kept-list]').waitFor({ state: 'detached' });
      const sent = pointsOf((await serverState(origin)).plays, ids);
      note(
        `${at}: "Send these plays" puts the later play on the server, and every play is there once`,
        JSON.stringify(sent) === JSON.stringify(eachOnce) &&
          (await a.page.locator('[data-send-not-saved="game-moved"]').count()) === 0,
        JSON.stringify(sent),
      );
      if (!byOwner) {
        // Left the game: opened again. After the reload A already holds it.
        await a.page.getByRole('button', { name: 'Open the game again' }).click();
        await c.open();
      }
      await c.saved();
      const late = pointsOf((await serverState(origin)).plays, ids);
      note(
        `${at}: A scoring again: nothing waits on A, each play once, A's screen 6–5`,
        JSON.stringify(late) === JSON.stringify(eachOnce) &&
          (await kept.count()) === 0 &&
          JSON.stringify(await c.score()) === JSON.stringify({ home: 6, away: 5 }),
        JSON.stringify({ late, score: await c.score() }),
      );
    });

    if (byOwner) {
      await step('someone who may not score the game is refused the page', async () => {
        for (const [who, cookie] of [
          ['a coach', coach],
          ['a signed-in person with no role', stranger],
        ]) {
          const r = await contextOf(browser, origin, cookie);
          contexts.push(r);
          const answer = await r.page.goto(`${origin}${uploadPath}`);
          note(
            `${who} is refused the upload page (403), with no file to pick`,
            answer?.status() === 403 && (await r.page.locator('[data-copy-file]').count()) === 0,
            String(answer?.status()),
          );
        }
        const v = await contextOf(browser, origin, { ...owner, value: 'nobody' });
        contexts.push(v);
        await v.context.clearCookies();
        await v.page.goto(`${origin}${uploadPath}`);
        note(
          'someone signed out is sent to sign in and back to the upload page',
          new URL(v.page.url()).pathname === '/signin' &&
            new URL(v.page.url()).searchParams.get('next') === uploadPath,
          v.page.url(),
        );
      });

      await step('a final game is refused: reopen it first', async () => {
        const o = court(u.page);
        await u.page.goto(`${origin}${trackerPath()}`);
        await o.open();
        await o.endGame();
        note('the game is final on the server', (await serverState(origin)).status === 'final');
        const copy = JSON.parse(readFileSync(copyFile, 'utf8'));
        const newer = join(files, 'copy-new-play.json');
        writeFileSync(
          newer,
          JSON.stringify({
            ...copy,
            commands: copy.commands.map((entry) => ({
              ...entry,
              command: { ...entry.command, commandId: randomUUID() },
            })),
          }),
        );
        await u.page.goto(`${origin}${uploadPath}`);
        const refused = await upload(u.page, newer);
        note(
          'a copy with plays the server does not have is refused in plain words: reopen it first',
          (await refused.getAttribute('data-code')) === 'reopen-first' &&
            (await refused.innerText()).trim() ===
              'This game has ended. Reopen it first, then upload the copy again.',
          await refused.innerText(),
        );
        const final = pointsOf((await serverState(origin)).plays, ids);
        note(
          'nothing of the refused copy was counted',
          JSON.stringify(final) === JSON.stringify(eachOnce),
          JSON.stringify(final),
        );
      });
    }

    for (const d of contexts) {
      note(`${at}: no script error on a page`, d.errors.length === 0, d.errors.join(' | '));
    }
  } catch (error) {
    failures.push(`${at}: the run: ${whatWentWrong(error)}`);
  } finally {
    for (const d of contexts) await d.context.close();
    server.child.kill();
  }
}

const browser = built ? await launch() : null;
if (browser) {
  await copyRun(browser, scorekeeper);
  await copyRun(browser, owner);
}
await browser?.close();

for (const label of checked) console.log(`checked: ${label}`);
if (failures.length > 0) {
  console.error(`game-copy: ${failures.length} failed`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`game-copy: all ${checked.length} checks passed`);
