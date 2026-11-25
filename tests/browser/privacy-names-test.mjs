// Step 2.162: "Names on public pages" and the parents' confirmation in a real browser,
// against the web app on its made-up stand-in (APP_ENV=test). Nothing leaves this
// computer; every league, team and person is made up. Builds the app first unless given
// --no-build (npm run test:web:browser builds it once in web-exit-test.mjs, then runs this
// with --no-build). Scripts are switched off on the settings screen: its forms work as
// plain forms.
//
// The owner of the adult league (north-valley) chooses Hidden: a visitor sees "#4" on a
// team's page and "A player (name not shown)" in the statistics, and no player's name.
// (In the statistics a hidden player will be shown as "#12" with the team by step 2.146;
// today the statistics list no numbers.) Then first name and last initial, then full
// names again, with no confirmation asked. The owner of the youth league (harbor-city)
// saves full names without the tick: a visitor still sees the young players by first name
// and last initial and a coach (recorded as an adult) in full. With the tick, the young
// players are in full and the screen says since when; unticked again, back as before.
import {
  accessibilityProblems,
  buildNext,
  freePort,
  launch,
  startNext,
  waitFor,
  whatWentWrong,
  settingAnswer,
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
const names = 'section[data-setting="privacy.publicNames"]';
const confirmation = 'section[data-setting="privacy.childrenInFullConfirmed"]';

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

if (browser) {
  const owner = await browser.newContext({ javaScriptEnabled: false });
  await owner.addCookies([{ name: 'srl_session', value: 'local-owner-token', url: origin }]);
  const visitor = await browser.newContext();
  const admin = await owner.newPage();
  const page = await visitor.newPage();
  admin.setDefaultTimeout(60_000);
  page.setDefaultTimeout(60_000);

  const settings = (league) => `${origin}/${league}/admin/settings`;
  // "Saved: <the setting's short name>." whole (T-419), beside the setting itself (step 2.155 part 4).
  const saved = (label, answer, setting) => {
    const said = answer.text;
    note(
      `${label}: the screen says it was saved`,
      answer.saved && said === `Saved: ${setting}.`,
      said,
    );
  };
  /** Chooses a names value as the owner, never touching the tick. */
  const choose = async (league, value) => {
    await admin.goto(settings(league));
    await admin.locator(`${names} input[type=radio][value="${value}"]`).check();
    const answer = await settingAnswer(
      admin,
      names,
      admin.locator(`${names} button[type=submit]`).first(),
    );
    saved(`${league} saves ${value}`, answer, 'Names on public pages');
  };
  /** Ticks or unticks the parents' confirmation and saves it. */
  const tick = async (league, ticked) => {
    await admin.goto(settings(league));
    const box = admin.locator(`${confirmation} input[type=checkbox]`);
    if (ticked) await box.check();
    else await box.uncheck();
    const answer = await settingAnswer(
      admin,
      confirmation,
      admin.locator(`${confirmation} button[type=submit]`).first(),
    );
    saved(
      `${league} ${ticked ? 'ticks' : 'unticks'} the confirmation`,
      answer,
      "Children's full names",
    );
  };
  const seen = async (address) => {
    await page.goto(`${origin}${address}`);
    return page.locator('main').innerText();
  };

  await step('the adult league', async () => {
    await admin.goto(settings('north-valley'));
    const privacy = await admin.locator('section[data-area="privacy"]').innerText();
    note(
      'adult: Privacy opens with its sentence',
      privacy.includes(
        'Your league is for adults, so it starts with full names. Choose less here at any time.',
      ),
    );
    note(
      'adult: it says what is in force',
      privacy.includes(
        'Now: adults are shown by full name, and children by first name and last initial.',
      ),
    );
    note(
      'adult with a recorded child: the tick is offered',
      privacy.includes('This league has players recorded as children.') &&
        (await admin.locator(`${confirmation} input[type=checkbox]`).count()) === 1,
    );
    note(
      'adult: the settings screen passes the checks',
      (await accessibilityProblems(admin)).length === 0,
      (await accessibilityProblems(admin)).join('; '),
    );

    const start = await seen('/north-valley/teams/falcons');
    note('adult start: a visitor sees full names', start.includes('Dana Whitfield'));

    await choose('north-valley', 'hidden');
    const team = await seen('/north-valley/teams/falcons');
    note('hidden: the team page shows "#4"', team.includes('#4'));
    note('hidden: the team page shows no name', !/Dana|Whitfield|Marcus|Oyelaran/.test(team));
    const stats = await seen('/north-valley/stats');
    note(
      'hidden: the statistics say "A player (name not shown)"',
      stats.includes('A player (name not shown)'),
    );
    note('hidden: the statistics show no name', !/Dana|Whitfield|Marcus|Oyelaran/.test(stats));

    await choose('north-valley', 'firstNameLastInitial');
    note(
      'first name and last initial: team page',
      (await seen('/north-valley/teams/falcons')).includes('Dana W.'),
    );
    const initial = await seen('/north-valley/stats');
    note(
      'first name and last initial: statistics',
      initial.includes('Dana W.') && !initial.includes('Dana Whitfield'),
    );

    await admin.goto(settings('north-valley'));
    await choose('north-valley', 'fullName');
    note(
      'full names again: no confirmation asked',
      !(await admin.content()).includes('confirmation-needed'),
    );
    note(
      'full names again: team page',
      (await seen('/north-valley/teams/falcons')).includes('Dana Whitfield'),
    );
    note(
      'full names again: statistics',
      (await seen('/north-valley/stats')).includes('Dana Whitfield'),
    );
  });

  await step('the youth league', async () => {
    await admin.goto(settings('harbor-city'));
    const privacy = await admin.locator('section[data-area="privacy"]').innerText();
    note(
      'youth: Privacy opens with its sentence',
      privacy.includes('Your league is for young players.'),
    );

    await choose('harbor-city', 'fullName');
    const before = await seen('/harbor-city/teams/comets');
    note(
      'youth, full names without the tick: young players by initial',
      before.includes('Sam R.') && !before.includes('Sam Rivera'),
    );
    note('youth, full names without the tick: the coach in full', before.includes('Dev Anand'));

    await tick('harbor-city', true);
    const given = await seen('/harbor-city/teams/comets');
    note('youth, with the tick: young players in full', given.includes('Sam Rivera'));
    note(
      'youth, with the tick: statistics in full',
      (await seen('/harbor-city/stats')).includes('Sam Rivera'),
    );
    await admin.goto(settings('harbor-city'));
    const confirmed = await admin.locator('section[data-area="privacy"]').innerText();
    note(
      'youth: the screen says the confirmation is in force and since when',
      /Confirmed on [A-Z][a-z]+ \d{1,2}, \d{4}\./.test(confirmed) &&
        confirmed.includes('Now: everyone is shown by full name, children too.'),
    );
    note(
      'youth: the tick is drawn ticked',
      await admin.locator(`${confirmation} input[type=checkbox]`).isChecked(),
    );

    await tick('harbor-city', false);
    const after = await seen('/harbor-city/teams/comets');
    note(
      'youth, unticked again: back to first name and last initial',
      after.includes('Sam R.') && !after.includes('Sam Rivera'),
    );
    note('youth, unticked again: the coach still in full', after.includes('Dev Anand'));
  });
}

await browser?.close();
server?.child.kill();

if (failures.length > 0) {
  console.error(`Names on public pages browser check failed:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(
  `Names on public pages browser check passed: ${checked.length} checks in a real browser.`,
);
