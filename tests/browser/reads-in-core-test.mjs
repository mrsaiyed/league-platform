// Step 2.227: reads checked in core, not only by the page, in a real browser at 390 wide,
// WITH SCRIPTS ON, on the made-up stand-in (APP_ENV=test). Nothing leaves this computer;
// every league and person is made up.
//
// The done test:
// - An admin limited to one program of the draft league opens League settings: the page AS
//   SERVED (its text and the data sent to the client with it) holds no league setting, no
//   sentence of who plays in the league or of how a child is shown, no profile and no
//   publish part (T-474), searched by each setting's bare key in the served page AND in the
//   answer to a client-side visit of the same address (`RSC: 1`). Settings stays open to
//   them with its head only: no Admins row, since the Admins page keeps step 2.97's own rule
//   (the whole list is for whoever manages access for the whole league, S-131). The owner
//   has the row and the owner's Admins page opens from it.
// - The owner's League settings still draws every part: the profile, the publish part, the
//   groups of settings with every setting, the privacy sentences and the Admins row.
// - A scorekeeper's games page lists their game and opens it, and draws no postponed games
//   (the part is not drawn, T-472), while the owner's does; the schedule, where a season's
//   draft is, is not theirs to open.
// Builds the app first unless given --no-build.
import { buildNext, freePort, launch, startNext, waitFor } from './web-browser-kit.mjs';

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
// The made-up leagues and games (apps/web/src/server/stand-in-cast.ts, stand-in-games.ts).
const draftLeague = 'quiet-pines';
const liveLeague = 'north-valley';
const finalScoreGame = '01900000-0000-7000-8000-006a00000001'; // Tigers at Lions
const waitingAnchor = 'to-reschedule';
// What the Privacy part says (packages/site/src/messages/en/admin-settings.ts): who plays
// in the league and how someone not known to be an adult is shown.
const privacyWords = [
  'Your league is for adults',
  'Your league has both adults and young players',
  'Your league is for young players',
  'Now: ',
  'is shown as a child',
];

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

async function signedInAs(token) {
  const context = await browser.newContext({ viewport: phone, javaScriptEnabled: true });
  await context.addCookies([{ name: 'srl_session', value: token, url: origin }]);
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  return { context, page };
}

/** The page at `address` as served: its status and the whole answer, the client's data too. */
async function served(page, address) {
  const answer = await page.goto(`${origin}${address}`);
  return { status: answer?.status() ?? 0, body: (await answer?.text()) ?? '' };
}

/** The answer to a client-side visit of `address` (the data a link click fetches). */
async function servedToClient(page, address) {
  const answer = await page.request.get(`${origin}${address}`, { headers: { RSC: '1' } });
  return { status: answer.status(), body: await answer.text() };
}

/** What of a league's settings `body` holds: marks, privacy sentences and bare keys. */
const leaksIn = (body, keys) => [
  ...['settings-profile', 'settings-publish', 'settings-jump', 'data-setting='].filter((m) =>
    body.includes(m),
  ),
  ...privacyWords.filter((w) => body.includes(w)),
  ...keys.filter((key) => body.includes(key)),
];

const settingsAddress = `/${draftLeague}/admin/settings`;
/** The setting keys the owner's page draws, to look for in the program admin's. */
let ownerSettingKeys = [];

if (browser !== undefined) {
  await step("the owner's League settings draws every part, as before", async () => {
    const { context, page } = await signedInAs('local-owner-token');
    try {
      const { status, body } = await served(page, settingsAddress);
      await page.getByRole('heading', { level: 1, name: 'League settings' }).waitFor();
      ownerSettingKeys = await page
        .locator('[data-setting]')
        .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-setting') ?? ''));
      note('the owner is answered 200', status === 200, String(status));
      note(
        'the owner sees the profile part',
        (await page.locator('.settings-profile').count()) === 1,
      );
      note(
        'the owner sees the publish part',
        (await page.locator('.settings-publish').count()) === 1,
      );
      note(
        'the owner sees the groups of settings',
        (await page.locator('nav.settings-jump').count()) === 1,
      );
      note('the owner sees the settings themselves', ownerSettingKeys.length > 0);
      note(
        'the owner reads who plays in the league',
        privacyWords.slice(0, 3).some((w) => body.includes(w)),
      );
      note(
        'the owner sees the Admins row',
        (await page.locator('.settings-admins').getByRole('link', { name: 'Admins' }).count()) ===
          1,
      );
    } finally {
      await context.close();
    }
  });

  await step("a program's admin sees no league setting and no Admins row", async () => {
    const { context, page } = await signedInAs('local-program-admin-token');
    try {
      const { status, body } = await served(page, settingsAddress);
      note("Settings stays open to a program's admin", status === 200, String(status));
      await page.getByRole('heading', { level: 1, name: 'League settings' }).waitFor();
      note('the owner gave keys to look for', ownerSettingKeys.length > 0);
      const leaked = leaksIn(body, ownerSettingKeys);
      note(
        "the page as served to a program's admin holds no league setting",
        leaked.length === 0,
        leaked.join(', '),
      );
      const client = await servedToClient(page, settingsAddress);
      note('a client-side visit is answered 200', client.status === 200, String(client.status));
      const leakedToClient = leaksIn(client.body, ownerSettingKeys);
      note(
        "a client-side visit's answer to a program's admin holds no league setting",
        client.body.length > 0 && leakedToClient.length === 0,
        leakedToClient.join(', '),
      );
      note(
        "the program's admin's page draws no form",
        (await page.locator('main form').count()) === 0,
      );
      // No Admins row: the Admins page (step 2.97) keeps its own rule, the league's whole
      // list is for whoever manages access for the whole league, so a row would lead only
      // to its refusal (S-131).
      const adminsAddress = `/${draftLeague}/admin/settings/admins`;
      note(
        "a program's admin is drawn no Admins row",
        (await page.locator('.settings-admins').count()) === 0 &&
          !body.includes(adminsAddress) &&
          !client.body.includes(adminsAddress),
      );
      const admins = await served(page, adminsAddress);
      note(
        "the Admins page keeps step 2.97's own rule for a program's admin",
        admins.status === 403,
        String(admins.status),
      );
    } finally {
      await context.close();
    }
  });

  await step("the owner's Admins page opens from Settings", async () => {
    const { context, page } = await signedInAs('local-owner-token');
    try {
      await page.goto(`${origin}${settingsAddress}`);
      await Promise.all([
        page.waitForURL((url) => url.pathname === `/${draftLeague}/admin/settings/admins`),
        page.locator('.settings-admins').getByRole('link', { name: 'Admins' }).click(),
      ]);
      await page.getByRole('heading', { level: 1, name: 'Admins' }).waitFor();
      note("the owner's Admins page opens", true);
    } finally {
      await context.close();
    }
  });

  await step("the owner's games page has the postponed part", async () => {
    const { context, page } = await signedInAs('local-owner-token');
    try {
      await served(page, `/${liveLeague}/admin/games`);
      note(
        "the owner's games page draws the postponed games' part",
        (await page.locator(`#${waitingAnchor}`).count()) === 1,
      );
    } finally {
      await context.close();
    }
  });

  await step("a scorekeeper's games page lists and opens their game, and no more", async () => {
    const { context, page } = await signedInAs('local-scorekeeper-token');
    try {
      const { body } = await served(page, `/${liveLeague}/admin/games`);
      const game = page.locator(`li[id="game-${finalScoreGame}"]`);
      note("the scorekeeper's game is listed", (await game.count()) === 1);
      note(
        "the scorekeeper's games page draws no postponed games",
        (await page.locator(`#${waitingAnchor}`).count()) === 0 &&
          !body.includes(waitingAnchor) &&
          !body.includes('Waiting for a new date'),
      );
      const opened = await served(page, `/${liveLeague}/admin/games/${finalScoreGame}`);
      note("the scorekeeper's game opens", opened.status === 200, String(opened.status));
      await page.getByRole('heading', { level: 1 }).waitFor();
      const schedule = await served(page, `/${liveLeague}/admin/schedule`);
      note(
        'the schedule, where the draft is, is not theirs to open',
        schedule.status === 403 && !schedule.body.includes('data-draft'),
        String(schedule.status),
      );
    } finally {
      await context.close();
    }
  });
}

await browser?.close();
server?.child.kill();

if (failures.length > 0) {
  console.error(`Reads in core browser test failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`Reads in core browser test passed (${checked.length} checks).`);
