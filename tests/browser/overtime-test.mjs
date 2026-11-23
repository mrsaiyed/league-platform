// Step 2.200 (P7 §5.6, the numbers audit's M8): a final game that went to overtime says so
// everywhere its result is shown, in a real browser at a phone's width (390) and a laptop's
// (1280), on the web app's made-up stand-in (APP_ENV=test). Nothing leaves this computer;
// every person, league and game is made up (apps/web/src/server/stand-in-world-seed.ts).
//
// Two games, through the tracker's own endpoints:
// - case 44 of the audit: Tigers at Lions (tonight's game 1) level after both halves, End
//   refused, then won by the Lions in the first overtime, while a phone is already on the
//   schedule: its card turns to "Final, OT" with no reload;
// - Lions at Hawks (tomorrow's game 3) level after the first overtime too, won by the Hawks
//   in the second: "Final, 2OT".
// Then, as each person would meet the results:
// - a visitor: each game's own page (its big board), its card on the schedule, the home
//   page, the Lions' page and the standings' latest results (three boards across on a
//   laptop); the pill's letters are drawn and a screen reader is told "Final after
//   overtime", and a card's link says "final after overtime";
// - the owner, in Admin → Games and on the game's box score sheet, and the scorekeeper, in
//   "Your games": the same pill, with the same words for a screen reader;
// - a game ended in regulation (Lions at Bears, final this morning) says "Final" alone, on
//   its page and its card.
// The same again in a light design (LOCAL_DESIGN=clean-court), on a second server: the game
// pages and the standings, with their accessibility checks, contrast included.
// The pill never breaks a card's top line: the date and time stay on one line, the pill
// stays inside the card, and on a phone it stands on a line of its own under the date in
// the same place as the plain "Final" of the card beside it (docs/build/DESIGN.md, section
// 4, line 10; the staff lists' compact cards keep every pill beside the date). And the
// page-step checks: accessibility (T-186) and no sideways scrolling. `--no-build` serves
// the build already here.
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
const twoOvertimesGame = hexId('006a', 3); // Lions at Hawks, tomorrow, recorded live
const regulationGame = hexId('006a', 5); // Lions at Bears, final this morning
const league = '/north-valley';
const oneOvertime = { text: 'Final, OT', said: 'Final after overtime' };
const twoOvertimes = { text: 'Final, 2OT', said: 'Final after 2 overtimes' };

let built = true;
if (!process.argv.includes('--no-build')) {
  await step('building the web app', async () => {
    built = await buildNext();
    if (!built) throw new Error('next build failed or took over 10 minutes');
  });
}

let browser;
const servers = [];
/** A server on the made-up world, in its own look (`design`) or the starting one. */
async function serve(design) {
  const origin = `http://localhost:${await freePort()}`;
  const server = startNext(['start', '--port', new URL(origin).port], {
    APP_ENV: 'test',
    PUBLIC_BASE_URL: origin,
    LOCAL_NOW: worldAtNoon(),
    ...(design === undefined ? {} : { LOCAL_DESIGN: design }),
  });
  servers.push(server);
  await waitFor(`${origin}/`, server);
  return origin;
}

let origin;
let lightOrigin;
if (built) {
  await step('starting the servers and the browser', async () => {
    origin = await serve();
    lightOrigin = await serve('clean-court');
    browser = await launch();
  });
}

/** A page at `width` on `at` (a server), as `who` (a made-up person's cookie) or a visitor. */
async function open(width, who, at = origin) {
  const context = await browser.newContext({ viewport: width.viewport });
  if (who !== undefined) {
    await context.addCookies([{ name: 'srl_session', value: tokens[who], url: at }]);
  }
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  return { context, page };
}

/**
 * The cards of the list that holds `game`'s card, as they are drawn: for each, its game,
 * its pill's letters and what a screen reader is told of it, its link's words, and where
 * its top line's pieces stand. Undefined when the page has no card for the game.
 */
const listOf = (page, game) =>
  page.evaluate((id) => {
    const linkTo = (card) =>
      [...card.querySelectorAll('a')].find((a) =>
        (a.getAttribute('href') ?? '').includes('/games/'),
      );
    const mine = [...document.querySelectorAll('main .ui-game-card')].find((card) =>
      (linkTo(card)?.getAttribute('href') ?? '').includes(`/games/${id}`),
    );
    if (!mine) return undefined;
    const list = mine.closest('ul') ?? mine.parentElement;
    const box = (el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
    };
    return [...list.querySelectorAll('.ui-game-card')].map((card) => {
      const link = linkTo(card);
      const pill = card.querySelector('.ui-game-meta .ui-game-state');
      const when = card.querySelector('.ui-game-meta .ui-game-when');
      const href = link?.getAttribute('href') ?? '';
      return {
        game: /\/games\/([0-9a-f-]{36})/.exec(href)?.[1] ?? null,
        pill: pill?.querySelector('[aria-hidden="true"]')?.textContent ?? pill?.textContent ?? null,
        said: pill?.querySelector('.ui-visually-hidden')?.textContent ?? null,
        link: link?.textContent ?? '',
        board: card.getAttribute('data-layout') === 'board',
        card: box(card),
        pillBox: pill ? box(pill) : null,
        whenBox: when ? box(when) : null,
        // An inline line of text has one box for each line it takes.
        whenLines: when ? when.getClientRects().length : 0,
      };
    });
  }, game);
const cardOf = async (page, game) => (await listOf(page, game))?.find((c) => c.game === game);

/** A pill outside any card (`selector`): its letters, and what a screen reader is told. */
const pillAt = (page, selector) =>
  page.evaluate((where) => {
    const pill = document.querySelector(where);
    return {
      pill: pill?.querySelector('[aria-hidden="true"]')?.textContent ?? pill?.textContent ?? null,
      said: pill?.querySelector('.ui-visually-hidden')?.textContent ?? null,
      quiet: pill?.closest('.ui-scoreboard')?.getAttribute('data-pill') === 'quiet',
    };
  }, selector);

/**
 * A problem these pages have in the light design at 1280 whatever their games, before any
 * overtime: the season picker's "Show" button in the header, 2.71:1 (found by this step,
 * reported to the lead; not the pill's). Set aside by name, so any other problem counts.
 */
const knownElsewhere = ['low contrast 2.71:1 in "Show"'];

async function accessible(page, label) {
  const problems = (await accessibilityProblems(page)).filter((p) => !knownElsewhere.includes(p));
  note(`accessibility: ${label}`, problems.length === 0, problems.join('; '));
}
async function noSidewaysScroll(page, label) {
  const [scroll, inner] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    window.innerWidth,
  ]);
  note(`no sideways scrolling: ${label}`, scroll <= inner, `${scroll} > ${inner}`);
}

/** The pill says `words`: its letters drawn, and what a screen reader is told in their place. */
function says(found, words, label) {
  note(`${label} says "${words.text}"`, found?.pill === words.text, String(found?.pill));
  note(
    `${label} tells a screen reader "${words.said}"`,
    found?.said === words.said,
    String(found?.said),
  );
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

const score = (side, playerId, points) => ({ type: 'score', side, playerId, points });
const next = (period) => [{ type: 'pause' }, { type: 'period', period }, { type: 'start' }];
const five = (team) => [1, 2, 3, 4, 5].map((n) => trackedPlayer(team, n));
const [lions, tigers, hawks] = [five(1), five(2), five(3)];

/**
 * Case 44 on `at`: level after both halves, End refused, won by the Lions in the first
 * overtime. `whileOpen` is run after the refusal and before the overtime is played.
 */
async function playCase44(at, whileOpen = async (play) => play()) {
  const send = await trackerTablet(at, overtimeGame, tokens.scorekeeper, 'overtime-tablet');
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
  await whileOpen(() => send(...next(3), score('home', lions[2], 2), { type: 'end' }));
  return refused.includes('refused');
}

/** Lions at Hawks on `at`: level after the first overtime, won by the Hawks in the second. */
async function playTwoOvertimes(at) {
  const send = await trackerTablet(at, twoOvertimesGame, tokens.owner, 'two-overtimes-tablet');
  await send(
    { type: 'lineup', side: 'home', playerIds: hawks },
    { type: 'lineup', side: 'away', playerIds: lions },
    { type: 'start' },
    score('home', hawks[0], 2),
    score('away', lions[0], 2),
    ...next(2),
    ...next(3),
    score('away', lions[1], 2),
    score('home', hawks[1], 2),
    ...next(4),
    score('home', hawks[2], 3),
    { type: 'end' },
  );
}

if (browser !== undefined) {
  await step('case 44: End refused when level, won in overtime, seen on an open page', async () => {
    // A phone already on the schedule while the game is played: its card turns to "Final,
    // OT" when the game ends, with no reload (from the live channel's last period).
    const watching = await open(widths[0]);
    try {
      const refused = await playCase44(origin, async (play) => {
        await watching.page.goto(`${origin}${league}/schedule`);
        note(
          'an open page shows the game live before it ends',
          (await cardOf(watching.page, overtimeGame))?.pill === null,
        );
        // Its card listens to the league's live channel before the game ends.
        await watching.page.waitForTimeout(1500);
        await play();
      });
      note('End is refused while the score is level after regulation', refused);
      const turned = await watching.page
        .waitForFunction(
          (id) => {
            const link = [...document.querySelectorAll('main a')].find((a) =>
              (a.getAttribute('href') ?? '').includes(`/games/${id}`),
            );
            const state = link?.closest('.ui-game-card')?.querySelector('.ui-game-state');
            return state?.querySelector('[aria-hidden="true"]')?.textContent === 'Final, OT';
          },
          overtimeGame,
          { timeout: 10_000 },
        )
        .then(
          () => true,
          () => false,
        );
      note('a page open while the game ends in overtime turns to "Final, OT" unreloaded', turned);
      const card = await cardOf(watching.page, overtimeGame);
      says(card, oneOvertime, 'the open page’s card');
      note(
        'its link then tells a screen reader "final after overtime"',
        (card?.link ?? '').includes('final after overtime, 5 to 7'),
        card?.link,
      );
    } finally {
      await watching.context.close();
    }
  });
  await step('Lions at Hawks won in the second overtime', () => playTwoOvertimes(origin));

  for (const width of widths) {
    await step(
      `${width.name}: a visitor meets the mark everywhere the result is shown`,
      async () => {
        const { context, page } = await open(width);
        try {
          for (const [game, words] of [
            [overtimeGame, oneOvertime],
            [twoOvertimesGame, twoOvertimes],
          ]) {
            await page.goto(`${origin}${league}/games/${game}`);
            const board = await pillAt(page, '.ui-scoreboard .ui-game-state');
            says(board, words, `${width.name} the game's board`);
            note(`${width.name}: the board's "${words.text}" is as quiet as "Final"`, board.quiet);
            await accessible(page, `${width.name} the page of "${words.text}"`);
            await noSidewaysScroll(page, `${width.name} the page of "${words.text}"`);
          }

          // The home page shows its newest result only: there, the game of two overtimes.
          for (const [where, at, game, words, link] of [
            [
              'the schedule',
              '/schedule',
              overtimeGame,
              oneOvertime,
              'Tigers against Lions, final after overtime, 5 to 7',
            ],
            [
              'the home page',
              '',
              twoOvertimesGame,
              twoOvertimes,
              'Lions against Hawks, final after 2 overtimes, 4 to 7',
            ],
            [
              'the Lions’ page',
              '/teams/lions',
              overtimeGame,
              oneOvertime,
              'Tigers against Lions, final after overtime, 5 to 7',
            ],
            [
              'the standings',
              '/standings',
              overtimeGame,
              oneOvertime,
              'Tigers against Lions, final after overtime, 5 to 7',
            ],
          ]) {
            await page.goto(`${origin}${league}${at}`);
            const label = `${width.name} ${where}`;
            const card = await cardOf(page, game);
            says(card, words, `${label}: the game's card`);
            note(
              `${label}: its link tells a screen reader "${link}"`,
              (card?.link ?? '').includes(link),
              card?.link,
            );
            if (card !== undefined) topLineWhole(card, width, label);
            await noSidewaysScroll(page, label);
          }

          // The standings' latest results: both games, and on a laptop three boards across.
          await page.goto(`${origin}${league}/standings`);
          await accessible(page, `${width.name} the standings`);
          const latest = (await listOf(page, overtimeGame)) ?? [];
          says(
            latest.find((c) => c.game === twoOvertimesGame),
            twoOvertimes,
            `${width.name} the standings' latest results: two overtimes`,
          );
          for (const card of latest) topLineWhole(card, width, `${width.name} latest results`);
          if (width.name === '1280') {
            note(
              '1280: the standings’ latest results stand three across',
              latest.length === 3 && new Set(latest.map((c) => Math.round(c.card.top))).size === 1,
              JSON.stringify(latest.map((c) => c.card)),
            );
          }

          // Beside them on the schedule, a game ended in regulation: "Final" alone, its pill in
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
          const plainBoard = await pillAt(page, '.ui-scoreboard .ui-game-state');
          note(
            `${width.name}: the regulation game's board says "Final"`,
            plainBoard.pill === 'Final' && plainBoard.said === null,
            JSON.stringify(plainBoard),
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
          // The staff lists' compact cards: the card whose link leads to the game, or the
          // one in the game's own row.
          const found = await page.evaluate((id) => {
            const cards = [...document.querySelectorAll('main .ui-game-card')];
            const card =
              cards.find((c) => c.querySelector(`a[href*="/games/${id}"]`)) ??
              cards.find((c) => c.closest(`[data-game="${id}"]`));
            const pill = card?.querySelector('.ui-game-state');
            return {
              pill: pill?.querySelector('[aria-hidden="true"]')?.textContent ?? null,
              said: pill?.querySelector('.ui-visually-hidden')?.textContent ?? null,
            };
          }, overtimeGame);
          says(found, oneOvertime, `${width.name} ${where}`);
          const card = await cardOf(page, overtimeGame);
          if (card !== undefined) topLineWhole(card, width, `${width.name} ${where}`);
          await noSidewaysScroll(page, `${width.name} ${where}`);
        } finally {
          await context.close();
        }
      });
    }

    await step(`${width.name}: the game's box score sheet says "Final, OT"`, async () => {
      const { context, page } = await open(width, 'owner');
      try {
        await page.goto(`${origin}${league}/admin/games/${overtimeGame}`);
        says(
          await pillAt(page, 'main .ui-page-head .ui-game-state'),
          oneOvertime,
          `${width.name} the box score sheet`,
        );
        await noSidewaysScroll(page, `${width.name} the box score sheet`);
      } finally {
        await context.close();
      }
    });
  }

  // The light design, on its own server and made-up world: the same two games.
  await step('in the light design: both games played', async () => {
    await playCase44(lightOrigin);
    await playTwoOvertimes(lightOrigin);
  });
  for (const width of widths) {
    await step(`${width.name}, light design: the boards and the standings`, async () => {
      const { context, page } = await open(width, undefined, lightOrigin);
      try {
        for (const [game, words] of [
          [overtimeGame, oneOvertime],
          [twoOvertimesGame, twoOvertimes],
        ]) {
          await page.goto(`${lightOrigin}${league}/games/${game}`);
          says(
            await pillAt(page, '.ui-scoreboard .ui-game-state'),
            words,
            `${width.name} light design: the game's board`,
          );
          await accessible(page, `${width.name} light design: the page of "${words.text}"`);
        }
        await page.goto(`${lightOrigin}${league}/standings`);
        await accessible(page, `${width.name} light design: the standings`);
        await noSidewaysScroll(page, `${width.name} light design: the standings`);
        const latest = (await listOf(page, overtimeGame)) ?? [];
        says(
          latest.find((c) => c.game === overtimeGame),
          oneOvertime,
          `${width.name} light design: the latest results, one overtime`,
        );
        says(
          latest.find((c) => c.game === twoOvertimesGame),
          twoOvertimes,
          `${width.name} light design: the latest results, two overtimes`,
        );
        for (const card of latest) {
          topLineWhole(card, width, `${width.name} light design: latest results`);
        }
        if (width.name === '1280') {
          note(
            '1280, light design: the latest results stand three across',
            latest.length === 3 && new Set(latest.map((c) => Math.round(c.card.top))).size === 1,
          );
        }
      } finally {
        await context.close();
      }
    });
  }
}

await browser?.close();
for (const server of servers) server.child.kill();

if (failures.length > 0) {
  console.error(`Overtime browser test failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`Overtime browser test passed (${checked.length} checks).`);
