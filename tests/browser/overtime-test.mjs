// Step 2.200 (P7 §5.6, the numbers audit's M8): a final game that went to overtime says so
// everywhere its result is shown, in a real browser at a phone's width (390) and a laptop's
// (1280), on the web app's made-up stand-in (APP_ENV=test). Nothing leaves this computer;
// every person, league and game is made up (apps/web/src/server/stand-in-world-seed.ts).
//
// Case 44 of the audit, through the tracker's own endpoints: Tigers at Lions (tonight's game
// 1) level after both halves, End refused, then won by the Lions in the first overtime, while
// a phone is already on the schedule: its card turns to "Final, OT" with no reload. Then,
// as each person would meet the result:
// - a visitor: the game's own page (its big board), its card on the schedule, on the home
//   page's recent results and on the Lions' page all say "Final, OT", and the card's link
//   tells a screen reader "final after overtime";
// - the owner, in Admin → Games, and the scorekeeper, in "Your games": the same pill;
// - a game ended in regulation (Lions at Bears, final this morning) says "Final" alone, on
//   its page and its card.
// The pill never breaks a card's top line: the date and time stay on one line, the pill
// stays inside the card, and on a phone it stands on a line of its own under the date in
// the same place as the plain "Final" of the card beside it (docs/build/DESIGN.md, section
// 4, line 10; the staff lists' compact cards keep every pill beside the date). And the page-step checks: accessibility (T-186) and no sideways scrolling.
// `--no-build` serves the build already here.
import {
  accessibilityProblems,
  buildNext,
  freePort,
  launch,
  startNext,
  trackedPlayer,
  trackerTablet,
  waitFor,
  whatWentWrong,
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
    failures.push(`${name}: ${whatWentWrong(error)}`);
  }
};

const widths = [
  { name: '390', viewport: { width: 390, height: 844 } },
  { name: '1280', viewport: { width: 1280, height: 800 } },
];
const tokens = {
  owner: 'local-owner-token',
  scorekeeper: 'local-scorekeeper-token',
};
const hexId = (head, n) => `01900000-0000-7000-8000-${head}${n.toString(16).padStart(8, '0')}`;
const overtimeGame = hexId('006a', 1); // Tigers at Lions, tonight, the scorekeeper's
const regulationGame = hexId('006a', 5); // Lions at Bears, final this morning
const league = '/north-valley';

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

/** A page at `width`, as `who` (a made-up person's cookie) or a visitor. */
async function open(width, who) {
  const context = await browser.newContext({ viewport: width.viewport });
  if (who !== undefined) {
    await context.addCookies([{ name: 'srl_session', value: tokens[who], url: origin }]);
  }
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  return { context, page };
}

/**
 * The card of `game` on the page, as it is drawn: its pill's words, its link's words, and
 * where its top line's pieces stand. Undefined when the page has no card for the game.
 */
const cardOf = (page, game) =>
  page.evaluate((id) => {
    const link = [...document.querySelectorAll('main a')].find((a) =>
      (a.getAttribute('href') ?? '').includes(`/games/${id}`),
    );
    const card = link?.closest('.ui-game-card');
    if (!card) return undefined;
    const pill = card.querySelector('.ui-game-meta .ui-game-state');
    const when = card.querySelector('.ui-game-meta .ui-game-when');
    const box = (el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
    };
    return {
      pill: pill?.textContent ?? null,
      link: link?.textContent ?? '',
      board: card.getAttribute('data-layout') === 'board',
      card: box(card),
      pillBox: pill ? box(pill) : null,
      whenBox: when ? box(when) : null,
      // An inline line of text has one box for each line it takes.
      whenLines: when ? when.getClientRects().length : 0,
    };
  }, game);

/** The big board's pill on a game's page, and whether it is drawn as quietly as "Final". */
const boardOf = (page) =>
  page.evaluate(() => {
    const board = document.querySelector('.ui-scoreboard');
    return {
      pill: board?.querySelector('.ui-game-state')?.textContent ?? null,
      quiet: board?.getAttribute('data-pill') === 'quiet',
    };
  });

async function accessible(page, label) {
  const problems = await accessibilityProblems(page);
  note(`accessibility: ${label}`, problems.length === 0, problems.join('; '));
}
async function noSidewaysScroll(page, label) {
  const [scroll, inner] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    window.innerWidth,
  ]);
  note(`no sideways scrolling: ${label}`, scroll <= inner, `${scroll} > ${inner}`);
}

/** The card's top line is whole: the date on one line, the pill inside the card. */
function topLineWhole(card, width, label) {
  note(
    `${label}: the date and time stay on one line`,
    card.whenLines === 1,
    `${card.whenLines} lines`,
  );
  const pill = card.pillBox;
  note(
    `${label}: the pill stands inside the card`,
    pill !== null && pill.left >= card.card.left && pill.right <= card.card.right,
    JSON.stringify({ pill, card: card.card }),
  );
  // A scoreboard card's rule (DESIGN.md line 10); the staff lists' compact cards keep every
  // state's pill beside the date, as their "Final" does.
  if (card.board && width.name === '390' && pill !== null && card.whenBox !== null) {
    note(
      `${label}: on a phone the pill has a line of its own under the date`,
      pill.top >= card.whenBox.bottom - 1,
      JSON.stringify({ pill, when: card.whenBox }),
    );
  }
}

if (browser !== undefined) {
  await step('case 44 played on the tracker: End refused when level, won in overtime', async () => {
    const send = await trackerTablet(origin, overtimeGame, tokens.scorekeeper, 'overtime-tablet');
    const lions = [1, 2, 3, 4, 5].map((n) => trackedPlayer(1, n));
    const tigers = [1, 2, 3, 4, 5].map((n) => trackedPlayer(2, n));
    const score = (side, playerId, points) => ({ type: 'score', side, playerId, points });
    const next = (period) => [{ type: 'pause' }, { type: 'period', period }, { type: 'start' }];
    await send(
      { type: 'lineup', side: 'home', playerIds: lions },
      { type: 'lineup', side: 'away', playerIds: tigers },
      { type: 'start' },
      score('home', lions[0], 3),
      score('away', tigers[0], 2),
      ...next(2),
      score('away', tigers[1], 3),
      score('home', lions[1], 2),
    );
    const refused = await send({ type: 'end' }).then(
      () => '',
      (error) => String(error.message),
    );
    note('End is refused while the score is level after regulation', refused.includes('refused'));
    // A phone already on the schedule while the game is played: its card turns to "Final,
    // OT" when the game ends, with no reload (from the live channel's last period).
    const watching = await open(widths[0]);
    try {
      await watching.page.goto(`${origin}${league}/schedule`);
      const pill = () => cardOf(watching.page, overtimeGame).then((card) => card?.pill ?? null);
      note('an open page shows the game live before it ends', (await pill()) === null);
      // Its card listens to the league's live channel before the game ends.
      await watching.page.waitForTimeout(1500);
      await send(...next(3), score('home', lions[2], 2), { type: 'end' });
      const turned = await watching.page
        .waitForFunction(
          (id) => {
            const link = [...document.querySelectorAll('main a')].find((a) =>
              (a.getAttribute('href') ?? '').includes(`/games/${id}`),
            );
            const state = link?.closest('.ui-game-card')?.querySelector('.ui-game-state');
            return state?.textContent === 'Final, OT';
          },
          overtimeGame,
          { timeout: 10_000 },
        )
        .then(
          () => true,
          () => false,
        );
      note(
        'a page open while the game ends in overtime says "Final, OT" without a reload',
        turned,
        String(await pill()),
      );
      const card = await cardOf(watching.page, overtimeGame);
      note(
        'its link then tells a screen reader "final after overtime"',
        (card?.link ?? '').includes('final after overtime, 5 to 7'),
        card?.link,
      );
    } finally {
      await watching.context.close();
    }
  });

  for (const width of widths) {
    await step(
      `${width.name}: a visitor meets "Final, OT" everywhere the result is shown`,
      async () => {
        const { context, page } = await open(width);
        try {
          await page.goto(`${origin}${league}/games/${overtimeGame}`);
          const board = await boardOf(page);
          note(
            `${width.name}: the game's board says "Final, OT"`,
            board.pill === 'Final, OT',
            board.pill,
          );
          note(`${width.name}: as quietly as "Final"`, board.quiet);
          await accessible(page, `${width.name} the overtime game's page`);
          await noSidewaysScroll(page, `${width.name} the overtime game's page`);

          for (const [where, at] of [
            ['the schedule', '/schedule'],
            ['the home page', ''],
            ['the Lions’ page', '/teams/lions'],
          ]) {
            await page.goto(`${origin}${league}${at}`);
            const card = await cardOf(page, overtimeGame);
            const label = `${width.name} ${where}`;
            note(
              `${label}: the game's card says "Final, OT"`,
              card?.pill === 'Final, OT',
              card?.pill,
            );
            note(
              `${label}: its link tells a screen reader "final after overtime"`,
              (card?.link ?? '').includes('Tigers against Lions, final after overtime, 5 to 7'),
              card?.link,
            );
            if (card !== undefined) topLineWhole(card, width, label);
            await noSidewaysScroll(page, label);
          }
          // Beside it on the schedule, a game ended in regulation: "Final" alone, its pill in
          // the same place on a phone.
          await page.goto(`${origin}${league}/schedule`);
          await accessible(page, `${width.name} the schedule`);
          const plain = await cardOf(page, regulationGame);
          const marked = await cardOf(page, overtimeGame);
          note(
            `${width.name}: a game ended in regulation says "Final"`,
            plain?.pill === 'Final',
            plain?.pill,
          );
          note(
            `${width.name}: its link says "final", no overtime`,
            (plain?.link ?? '').includes(', final, ') && !(plain?.link ?? '').includes('overtime'),
            plain?.link,
          );
          if (width.name === '390' && plain?.pillBox && marked?.pillBox) {
            note(
              '390: the two pills stand in the same place on their cards',
              Math.abs(
                plain.pillBox.top - plain.card.top - (marked.pillBox.top - marked.card.top),
              ) <= 1,
            );
          }
          await page.goto(`${origin}${league}/games/${regulationGame}`);
          const plainBoard = await boardOf(page);
          note(
            `${width.name}: the regulation game's board says "Final"`,
            plainBoard.pill === 'Final',
            plainBoard.pill,
          );
        } finally {
          await context.close();
        }
      },
    );

    for (const [who, at, where] of [
      ['owner', '/admin/games', 'Admin → Games'],
      ['scorekeeper', '/admin', '“Your games”'],
    ]) {
      await step(`${width.name}: ${where} says "Final, OT"`, async () => {
        const { context, page } = await open(width, who);
        try {
          await page.goto(`${origin}${league}${at}`);
          // The staff lists' compact cards: the card that names the game, or the one whose
          // link leads to it.
          const pill = await page.evaluate((id) => {
            const cards = [...document.querySelectorAll('main .ui-game-card')];
            const card =
              cards.find((c) => c.querySelector(`a[href*="/games/${id}"]`)) ??
              cards.find((c) => c.closest(`[data-game="${id}"]`));
            return card?.querySelector('.ui-game-state')?.textContent ?? null;
          }, overtimeGame);
          note(`${width.name}: ${where} says "Final, OT"`, pill === 'Final, OT', String(pill));
          const card = await cardOf(page, overtimeGame);
          if (card !== undefined) topLineWhole(card, width, `${width.name} ${where}`);
          await noSidewaysScroll(page, `${width.name} ${where}`);
        } finally {
          await context.close();
        }
      });
    }
  }
}

await browser?.close();
server?.child.kill();

if (failures.length > 0) {
  console.error(`Overtime browser test failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`Overtime browser test passed (${checked.length} checks).`);
