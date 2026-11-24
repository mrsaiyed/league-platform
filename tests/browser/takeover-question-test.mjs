// Step 2.148: a game under way is never given away without a question, and plays that
// were not saved can be sent. In a real browser against the web app on its made-up
// stand-in (APP_ENV=test): nothing leaves this computer; every team, game and person is
// made up. Builds the app first unless given --no-build.
//
// Two devices, two browser contexts, each signed in as its own made-up person: A, the
// scorekeeper, scores with no signal; B, the owner, opens the game meanwhile on a device
// whose clock the test moves on ten minutes:
// - B is asked the takeover question, naming A and "last heard from 10 minutes ago", and
//   is not given the game until "Yes, take over" ("Not now" leaves it with A).
// - A returns to "taken over", its three plays listed as not saved.
// - First run: with nothing recorded by B, A's "Send these plays" puts each on the server
//   once (the server's box score), and B's next tap counts on top of them (T-338); the
//   same account on a second device is told "you, on another device"; B reopening its own
//   page carries straight on; a person not allowed to score is refused.
// - Second run: B records a play first, the server refuses the send (game-moved), and
//   once A holds the game again each play offers "Enter again".
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

const [phone] = sizes;
const stranger = { name: 'srl_session', value: 'local-stranger-token' };
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

/** The game's scoring session asked for from outside the browsers, as `who`. */
const session = async (origin, body, who = owner) => {
  const answer = await fetch(api(origin, '/session'), {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: `${who.name}=${who.value}`, origin },
    body: JSON.stringify(body),
  });
  return { status: answer.status, body: JSON.parse(await answer.text()) };
};

/** The server's own record of the game: its plays, as the box score is made from them. */
const serverPlays = async (origin) => {
  const answer = await fetch(api(origin, '/state'), {
    headers: { cookie: `${owner.name}=${owner.value}`, origin },
  });
  const text = await answer.text();
  if (!answer.ok) throw new Error(`/state answered ${answer.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text).state.plays;
};
/** How many of the server's plays are points by `playerId`. */
const pointsBy = (plays, playerId) =>
  plays.filter((p) => p.playerId === playerId && typeof p.points === 'number').length;

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

/** A device: a browser context of its own, signed in as `who`, on the tracker. */
async function deviceOf(browser, origin, who, clock = false) {
  const context = await browser.newContext({
    viewport: { width: phone.width, height: phone.height },
    hasTouch: true,
  });
  if (clock) await context.clock.install();
  await context.addCookies([{ ...who, url: origin }]);
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${origin}${trackerPath()}`);
  const c = court(page);
  const play = async (side, jersey, act) => {
    const options = c.pad.locator(
      `[data-options="${await c.tile(side, jersey).getAttribute('data-player')}"]`,
    );
    if (!(await options.isVisible())) await c.tile(side, jersey).tap();
    await c.recorded(() => options.locator(`[data-act="${act}"]`).tap());
    await c.pad.locator('[data-rest]').waitFor();
  };
  return { context, page, c, play, errors };
}

const button = (page, name) => page.getByRole('button', { name, exact: true });

async function oneRun(browser, run) {
  const at =
    run === 'send'
      ? 'nothing recorded between'
      : run === 'worst'
        ? 'B recorded while A was offline'
        : 'a play recorded between';
  const origin = `http://localhost:${await freePort()}`;
  const server = startNext(['start', '--port', new URL(origin).port], {
    APP_ENV: 'test',
    PUBLIC_BASE_URL: origin,
  });
  const devices = [];
  try {
    await waitFor(`${origin}/`, server);
    await addPlayers(origin);
    const a = await deviceOf(browser, origin, scorekeeper);
    devices.push(a);
    await a.c.open();
    for (const jersey of starters) await a.c.tile('home', jersey).tap();
    for (const jersey of starters) await a.c.tile('away', jersey).tap();
    await a.page.locator('[data-scoring][data-stage="play"]').waitFor();
    // The clock started: the game is under way (live on the server).
    if (await a.c.startButton.isVisible()) await a.c.startButton.tap();
    await a.play('home', 5, 'p2');
    await a.c.saved();
    const ids = {
      home7: await a.c.tile('home', 7).getAttribute('data-player'),
      home9: await a.c.tile('home', 9).getAttribute('data-player'),
      away3: await a.c.tile('away', 3).getAttribute('data-player'),
    };
    const away5 = await a.c.tile('away', 5).getAttribute('data-player');

    // A scores with no signal.
    await a.context.setOffline(true);
    await a.play('home', 7, 'p2');
    await a.play('home', 9, 'p2');
    await a.play('away', 3, 'p3');
    const holderName = (await session(origin, { type: 'open', deviceId: 'probe' })).body.holder
      ?.displayName;

    // B opens the game on a device whose clock the test moves on.
    const b = await deviceOf(browser, origin, owner, true);
    devices.push(b);
    await step(`${at}: B is asked, with A's name and when A was last heard from`, async () => {
      await button(b.page, 'Take over scoring').waitFor();
      await b.page.clock.fastForward('10:00');
      const heard = b.page.locator('[data-last-heard]');
      await until(
        b.page,
        () => heard.getAttribute('data-last-heard'),
        (minutes) => minutes === '10',
        'the minutes never read 10',
      );
      const notices = (await b.page.locator('[data-tracker-notices]').innerText()).trim();
      note(
        `${at}: B's notice names A, and says A's device was last heard from 10 minutes ago`,
        typeof holderName === 'string' &&
          notices.includes(`${holderName} is scoring this game on another device.`) &&
          (await heard.innerText()).trim() === 'That device was last heard from 10 minutes ago.',
        JSON.stringify({ holderName, notices, heard: await heard.innerText() }),
      );
      await button(b.page, 'Take over scoring').tap();
      const question = (await b.page.locator('[data-take-over]').innerText()).trim();
      note(
        `${at}: the question names A and the last-heard time`,
        question.startsWith(`Take over scoring from ${holderName}?`) &&
          question.includes('last heard from 10 minutes ago'),
        question,
      );
      await button(b.page, 'Not now').tap();
      const still = await session(origin, { type: 'open', deviceId: 'probe' });
      note(
        `${at}: opening and "Not now" never give B the game: A still holds it`,
        still.body.status === 'held-by-other' &&
          still.body.holder.displayName === holderName &&
          (await b.c.root.count()) === 0,
        JSON.stringify(still.body),
      );
      await button(b.page, 'Take over scoring').tap();
      await button(b.page, 'Yes, take over').tap();
      await b.c.open();
    });

    if (run === 'worst') {
      // The plan's worst night (fix round): B records while A is still offline.
      await step(`${at}: B records a play before A is heard from`, async () => {
        await b.play('away', 5, 'p2');
        await b.c.saved();
      });
    }

    await step(`${at}: A returns to "taken over", its plays not saved`, async () => {
      await a.context.setOffline(false);
      const rows = a.page.locator('[data-kept-list] [data-kept-play]');
      await rows.nth(2).waitFor({ timeout: 90_000 });
      const notices = (await a.page.locator('[data-tracker-notices]').innerText()).trim();
      note(
        `${at}: A is taken over, with 3 plays not saved and "Send these plays" offered`,
        (await rows.count()) === 3 &&
          notices.includes('3 plays on this device were not saved.') &&
          (await a.page.locator('[data-send-plays]').count()) === 1,
        notices,
      );
    });

    if (run === 'send') {
      await step(`${at}: A sends them, each once, and B counts on top of them`, async () => {
        await a.page.locator('[data-send-plays]').tap();
        await a.page.locator('[data-kept-list]').waitFor({ state: 'detached' });
        const plays = await serverPlays(origin);
        const counts = Object.fromEntries(
          Object.entries(ids).map(([k, id]) => [k, pointsBy(plays, id)]),
        );
        note(
          `${at}: the server's box score has each sent play once`,
          Object.values(counts).every((n) => n === 1),
          JSON.stringify(counts),
        );
        // B's next tap: B loads the game again and counts on top of the sent plays (T-338).
        await b.play('away', 5, 'p2');
        await b.c.saved();
        const shown = await until(
          b.page,
          () => b.c.score(),
          (score) => score.home === 6 && score.away === 5,
          'B never showed the sent plays',
        );
        const after = await serverPlays(origin);
        note(
          `${at}: B's next tap counts on top of the sent plays, on B's screen and on the server`,
          shown.home === 6 &&
            Object.values(ids).every((id) => pointsBy(after, id) === 1) &&
            after.filter((p) => typeof p.points === 'number').length === 5,
          JSON.stringify({ shown, plays: after.length }),
        );
      });

      await step(`${at}: the same account on a second device`, async () => {
        const second = await deviceOf(browser, origin, owner);
        devices.push(second);
        await button(second.page, 'Take over scoring').waitFor();
        const notices = (await second.page.locator('[data-tracker-notices]').innerText()).trim();
        await button(second.page, 'Take over scoring').tap();
        const question = (await second.page.locator('[data-take-over]').innerText()).trim();
        note(
          `${at}: the same account on a second device is told "you, on another device"`,
          notices.includes('You are scoring this game on another device.') &&
            question.startsWith('Take over scoring from you, on another device?') &&
            !question.includes(String(holderName)),
          JSON.stringify({ notices, question }),
        );
        await button(second.page, 'Not now').tap();
      });

      await step(`${at}: the same device reopening carries straight on`, async () => {
        await b.page.reload();
        await b.c.open();
        note(
          `${at}: B reopening its own page is scoring at once, with no question`,
          (await button(b.page, 'Take over scoring').count()) === 0 &&
            JSON.stringify(await b.c.score()) === '{"home":6,"away":5}',
          JSON.stringify(await b.c.score()),
        );
      });

      await step(`${at}: a person not allowed to score is refused`, async () => {
        const asked = await session(origin, { type: 'open', deviceId: 'stranger' }, stranger);
        note(
          `${at}: a person not allowed to score is refused, and told nothing of the holder`,
          asked.status >= 400 && asked.status < 500 && asked.body.holder === undefined,
          JSON.stringify(asked),
        );
      });
    } else {
      await step(`${at}: the server refuses, and each play is entered again`, async () => {
        if (run !== 'worst') {
          await b.play('away', 5, 'p2');
          await b.c.saved();
        }
        await a.page.locator('[data-send-plays]').tap();
        await a.page.locator('[data-send-not-saved="game-moved"]').waitFor();
        const plays = await serverPlays(origin);
        note(
          `${at}: the send is refused as a whole: none of A's plays is on the server, the list stays`,
          Object.values(ids).every((id) => pointsBy(plays, id) === 0) &&
            (await a.page.locator('[data-kept-list] [data-kept-play]').count()) === 3 &&
            (await a.page.locator('[data-send-plays]').count()) === 0,
          JSON.stringify(plays.length),
        );
        note(
          `${at}: the server's box score has B's play once`,
          pointsBy(plays, away5) === 1,
          JSON.stringify(pointsBy(plays, away5)),
        );
        await button(a.page, 'See who is scoring').tap();
        await button(a.page, 'Take over scoring').tap();
        await button(a.page, 'Yes, take over').tap();
        await a.c.open();
        const again = a.c.pad.locator('[data-kept-list] [data-enter-again]');
        await again.first().waitFor();
        note(
          `${at}: holding the game again, each of A's plays offers "Enter again"`,
          (await again.count()) === 3,
          String(await again.count()),
        );
      });
    }
    for (const d of devices) {
      note(`${at}: no script error on a page`, d.errors.length === 0, d.errors.join(' | '));
    }
  } finally {
    for (const d of devices) await d.context.close();
    server.child.kill();
  }
}

const browser = built ? await launch() : null;
if (browser) {
  await step('the first run', () => oneRun(browser, 'send'));
  await step('the second run', () => oneRun(browser, 'moved'));
  await step('the third run', () => oneRun(browser, 'worst'));
}
await browser?.close();

for (const label of checked) console.log(`checked: ${label}`);
if (failures.length > 0) {
  console.error(`takeover-question: ${failures.length} failed`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`takeover-question: all ${checked.length} checks passed`);
