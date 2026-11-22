// Pictures of the running product with made-up data. Modes: sim | score | sheets. --build builds first.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import {
  planSimulation,
  simulatedOwner,
} from '../../packages/database/src/seed/simulate-league-plan.ts';
import {
  buildNext,
  freePort,
  launch,
  startNext,
  waitFor,
} from '../../tests/browser/web-browser-kit.mjs';
import {
  addPlayers,
  court,
  scorekeeper,
  starters,
  stopClockGame,
  trackerPath,
} from '../../tests/browser/tracker-driver.mjs';

const out = '/home/user/league-platform/.local/look';
mkdirSync(out, { recursive: true });
const mode = process.argv[2];
const shotsFile = path.join(out, `shots-${mode}.json`);
const shots = [];
const skipped = [];
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true };
const wide = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 };

async function shot(page, file, group, title, { wideShot = false, top = 0 } = {}) {
  await page.waitForTimeout(500);
  const vw = page.viewportSize().width;
  const full = await page.evaluate(() => document.documentElement.scrollHeight);
  const y = Math.max(0, Math.min(top, full - 100));
  const height = Math.max(100, Math.min(full - y, 2600));
  await page.screenshot({
    path: path.join(out, file),
    type: 'jpeg',
    quality: 88,
    fullPage: true,
    clip: { x: 0, y, width: vw, height },
  });
  const u = new URL(page.url());
  const h1 = (
    await page
      .locator('h1')
      .first()
      .innerText({ timeout: 2000 })
      .catch(() => '')
  ).trim();
  const text = (
    await page
      .locator('main')
      .first()
      .innerText({ timeout: 2000 })
      .catch(() => '')
  )
    .replace(/\s+/g, ' ')
    .slice(0, 300);
  shots.push({
    file,
    group,
    title,
    address: u.pathname + u.search,
    wide: wideShot,
    h1,
    cropTop: y,
    fullHeight: full,
    text,
  });
  console.log('shot', file, u.pathname, 'h1:', h1, 'full', full, 'top', y);
}
const go = async (page, origin, address) => {
  const r = await page.goto(origin + address, { waitUntil: 'load' });
  return r?.status();
};
const firstHref = (page, re) =>
  page
    .evaluate((src) => {
      const r = new RegExp(src);
      const all = [...document.querySelectorAll('a[href]')].map(
        (a) => new URL(a.href).pathname + new URL(a.href).search,
      );
      return (
        all.find((h) => r.test(h)) ??
        'NONE ' +
          all
            .filter((h) => /games|teams/.test(h))
            .slice(0, 8)
            .join(' ')
      );
    }, re.source)
    .then((h) => {
      if (h.startsWith('NONE')) {
        console.log(h);
        return null;
      }
      return h;
    });
const safe = async (label, fn) => {
  try {
    await fn();
  } catch (e) {
    skipped.push(`${label}: ${String(e.message).split('\n')[0]}`);
    console.log('SKIP', label, String(e.message).split('\n')[0]);
  }
};

if (mode === 'sheets') {
  const manifest = JSON.parse(readFileSync(path.join(out, 'manifest.json'), 'utf8'));
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1800, height: 800 } });
  for (let i = 0; i < manifest.length; i += 6) {
    const group = manifest.slice(i, i + 6);
    const html = `<!doctype html><html><body style="margin:0;padding:16px;background:#fff;font:20px sans-serif;display:flex;gap:12px;align-items:flex-start">${group
      .map(
        (m) =>
          `<figure style="margin:0;width:${(1800 - 32 - 60) / 6}px;text-align:center"><img src="file://${out}/${m.file}" style="width:100%;border:1px solid #999"><figcaption><b>${m.file.slice(0, 2)}</b> ${m.wide ? '(wide)' : ''}</figcaption></figure>`,
      )
      .join('')}</body></html>`;
    const f = path.join(out, `sheet-${i / 6 + 1}.html`);
    writeFileSync(f, html);
    await page.goto('file://' + f);
    await page.waitForTimeout(300);
    await page.screenshot({
      path: path.join(out, `sheet-${i / 6 + 1}.jpg`),
      type: 'jpeg',
      quality: 80,
      fullPage: true,
    });
  }
  await browser.close();
  process.exit(0);
}

if (process.argv.includes('--build')) {
  if (!(await buildNext())) throw new Error('build failed');
  console.log('built');
}

const origin = `http://localhost:${await freePort()}`;
let server;
let browser;
try {
  if (mode === 'sim') {
    const only = process.argv.includes('--fix');
    const size = { teams: 24, divisions: 4, rounds: 10, tracked: 6, seed: 7 };
    const plan = planSimulation(size);
    const { slug } = plan;
    server = startNext(['start', '--port', new URL(origin).port], {
      APP_ENV: 'test',
      LOCAL_DATA: 'made-up-database',
      LOCAL_SIMULATED_LEAGUE: Object.entries(size)
        .map(([n, v]) => `--${n} ${v}`)
        .join(' '),
      PUBLIC_BASE_URL: origin,
    });
    await waitFor(`${origin}/`, server, [{ address: `/${slug}/standings` }]);
    writeFileSync(
      '/home/user/league-platform/.local/lanes/2.236-simulate/.local/look-work/server-output.txt',
      server.output(),
    );
    browser = await launch();
    // The games the schedule links to, with their text.
    const schedule = await (await fetch(`${origin}/${slug}/schedule`)).text();
    const addresses = [...new Set(schedule.match(new RegExp(`/${slug}/games/[0-9a-f-]+`, 'g')))];
    const games = await Promise.all(
      addresses.map(async (address) => {
        const html = await (await fetch(origin + address)).text();
        const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
        return { address, text: main.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ') };
      }),
    );
    console.log('games linked', games.length);
    const find = (t) => games.find(({ text }) => t(text))?.address;
    const tracked = (t) => t.includes('Play by play') && t.includes('Box scores');
    const typedGame = find(
      (t) =>
        t.includes('No statistics were recorded for this game.') &&
        !/forfeited this game\./.test(t) &&
        !t.includes('postponed') &&
        !t.includes('ancelled'),
    );
    const trackedGame = find((t) => tracked(t) && !t.includes('Final, OT'));
    const otGame = find((t) => tracked(t) && t.includes('Final, OT'));
    const postponedGame = find((t) => t.includes('This game has been postponed.'));
    const forfeitGame = find((t) => / forfeited this game\./.test(t));
    console.log({ typedGame, trackedGame, otGame, postponedGame, forfeitGame });

    const pc = await browser.newContext(phone);
    const p = await pc.newPage();
    p.setDefaultTimeout(60_000);
    const wc = await browser.newContext(wide);
    const w = await wc.newPage();
    w.setDefaultTimeout(60_000);
    await safe('01', async () => {
      await go(p, origin, `/${slug}`);
      await shot(p, '01-home-phone.jpg', 'A', "The league's home");
    });
    await safe('02', async () => {
      await go(w, origin, `/${slug}`);
      await shot(w, '02-home-wide.jpg', 'A', "The league's home, wide", { wideShot: true });
    });
    await safe('03', async () => {
      await go(p, origin, `/${slug}/schedule`);
      await shot(p, '03-schedule-phone.jpg', 'A', 'The schedule');
    });
    let topTeam = null;
    await safe('04', async () => {
      await go(p, origin, `/${slug}/standings`);
      const row = await p.locator('main table tbody tr').first().innerText();
      const team = plan.divisions.flatMap((d) => d.teams).find((t) => row.includes(t.name));
      console.log('top row', row.replace(/\s+/g, ' '), team?.shortName);
      topTeam = team ? `/${slug}/teams/${team.shortName}` : null;
      const where = await p.evaluate(() => {
        const re = /head-to-head|level on|tiebreak|ahead of|point difference|coin/i;
        const els = [...document.querySelectorAll('main *')].filter(
          (e) =>
            e.children.length === 0 || ['P', 'LI', 'DD', 'SMALL', 'SPAN', 'TD'].includes(e.tagName),
        );
        const hit = els.find(
          (e) => re.test(e.textContent ?? '') && (e.textContent ?? '').length < 400,
        );
        if (!hit) return null;
        return {
          y: hit.getBoundingClientRect().top + window.scrollY,
          text: hit.textContent.trim().slice(0, 200),
        };
      });
      console.log('standings note', JSON.stringify(where));
      const full = await p.evaluate(() => document.documentElement.scrollHeight);
      const top = where && where.y > 2400 ? Math.max(0, where.y - 1600) : 0;
      await shot(p, '04-standings-phone.jpg', 'A', 'The standings', {
        top: Math.min(top, Math.max(0, full - 2600)),
      });
      shots.at(-1).noteFound = where;
    });
    await safe('05', async () => {
      await go(w, origin, `/${slug}/standings`);
      await shot(w, '05-standings-wide.jpg', 'A', 'The standings, wide', { wideShot: true });
    });
    await safe('06', async () => {
      await go(p, origin, `/${slug}/stats`);
      await shot(p, '06-statistics-phone.jpg', 'A', 'The statistics');
    });
    await safe('07', async () => {
      if (!topTeam) throw new Error('no team link');
      await go(p, origin, topTeam);
      await shot(p, '07-team-phone.jpg', 'A', "A team's page");
    });
    await safe('08', async () => {
      if (!typedGame) throw new Error('not found');
      await go(p, origin, typedGame);
      await shot(p, '08-typed-final-phone.jpg', 'A', 'A final game, score typed in');
    });
    await safe('09', async () => {
      if (!trackedGame) throw new Error('not found');
      await go(p, origin, trackedGame);
      await shot(
        p,
        '09-tracked-box-score-phone.jpg',
        'A',
        'A game scored play by play: its box score',
      );
      const pbp = await p.evaluate(() => {
        const h = [...document.querySelectorAll('main h2, main h3')].find((e) =>
          /play by play/i.test(e.textContent ?? ''),
        );
        return h ? h.getBoundingClientRect().top + window.scrollY : null;
      });
      const link = await p.evaluate(
        () =>
          [...document.querySelectorAll('main a[href]')]
            .find((a) => /play by play/i.test(a.textContent ?? ''))
            ?.getAttribute('href') ?? null,
      );
      console.log('pbp heading at', pbp, 'link', link);
      if (link && !link.startsWith('#')) {
        await go(p, origin, link);
        await shot(p, '10-play-by-play-phone.jpg', 'A', 'The same game: play by play');
      } else if (pbp !== null) {
        await shot(
          p,
          '10-play-by-play-phone.jpg',
          'A',
          'The same game: play by play, further down',
          { top: pbp - 40 },
        );
      } else skipped.push('10: play by play is within the first picture of 09');
    });
    await safe('11', async () => {
      if (!otGame) throw new Error('not found');
      await go(p, origin, otGame);
      await shot(p, '11-overtime-phone.jpg', 'A', 'The overtime game');
    });
    await safe('12', async () => {
      if (!postponedGame) throw new Error('not found');
      await go(p, origin, postponedGame);
      await shot(p, '12-postponed-phone.jpg', 'A', 'A postponed game still waiting');
    });
    await safe('13', async () => {
      if (!forfeitGame) throw new Error('not found');
      await go(p, origin, forfeitGame);
      await shot(p, '13-forfeit-phone.jpg', 'A', 'A forfeited game');
    });

    // The owner, signed in.
    const ac = await browser.newContext(phone);
    const a = await ac.newPage();
    a.setDefaultTimeout(60_000);
    await go(a, origin, '/signin/made-up-people');
    await a.getByRole('heading', { level: 1, name: 'Be a made-up person' }).waitFor();
    await Promise.all([
      a.waitForURL((url) => url.pathname !== '/signin/made-up-people'),
      a.getByRole('button', { name: `Open ${plan.name} as ${simulatedOwner.displayName}` }).click(),
    ]);
    if (new URL(a.url()).pathname === '/signup/password') {
      await a.getByLabel('Password').fill('a made-up chosen password');
      await Promise.all([
        a.waitForURL((url) => url.pathname !== '/signup/password'),
        a.getByRole('button', { name: 'Save and sign in' }).click(),
      ]);
    }
    console.log('signed in at', a.url());
    const ad = `/${slug}/admin`;
    await safe('20', async () => {
      await go(a, origin, ad);
      await shot(a, '20-admin-home-phone.jpg', 'B', "The admin's first page");
    });
    await safe('21', async () => {
      await go(a, origin, `${ad}/games`);
      await shot(a, '21-admin-games-phone.jpg', 'B', 'Games');
    });
    await safe('22', async () => {
      await go(a, origin, `${ad}/games`);
      const g = typedGame ? `${ad}/games/${typedGame.split('/').pop()}` : null;
      if (!g) throw new Error('no game link');
      await go(a, origin, g);
      await shot(a, '22-admin-game-phone.jpg', 'B', "One game's page in the admin");
    });
    const awc = await browser.newContext({ ...wide, storageState: await ac.storageState() });
    const aw = await awc.newPage();
    aw.setDefaultTimeout(60_000);
    await safe('23', async () => {
      await go(aw, origin, `${ad}/schedule`);
      await shot(aw, '23-schedule-builder-wide.jpg', 'B', 'The schedule builder, wide', {
        wideShot: true,
      });
    });
    await safe('24', async () => {
      await go(a, origin, `${ad}/teams`);
      await shot(a, '24-admin-teams-phone.jpg', 'B', 'Teams');
    });
    await safe('25', async () => {
      await go(a, origin, `${ad}/teams`);
      const t = await firstHref(a, new RegExp(`^${ad}/teams/[^/?#]+$`));
      if (!t) throw new Error('no team link');
      await go(a, origin, t);
      await shot(a, '25-admin-roster-phone.jpg', 'B', "One team's roster");
    });
    await safe('26', async () => {
      await go(a, origin, `${ad}/people`);
      await shot(a, '26-admin-people-phone.jpg', 'B', 'People');
    });
    await safe('27', async () => {
      await go(a, origin, `${ad}/people`);
      const t = await firstHref(a, new RegExp(`^${ad}/people/[^/?#]+$`));
      if (!t) throw new Error('no person link');
      await go(a, origin, t);
      await shot(a, '27-admin-person-phone.jpg', 'B', "One person's record");
    });
    await safe('28', async () => {
      await go(a, origin, `${ad}/settings`);
      await shot(a, '28-admin-settings-phone.jpg', 'B', "The league's settings");
    });
    await safe('28b', async () => {
      await go(a, origin, `${ad}/season`);
      await shot(a, '28b-admin-season-phone.jpg', 'B', "The season's settings");
    });
  }

  if (mode === 'score') {
    server = startNext(['start', '--port', new URL(origin).port], {
      APP_ENV: 'test',
      PUBLIC_BASE_URL: origin,
    });
    await waitFor(`${origin}/`, server);
    await addPlayers(origin);
    await stopClockGame(origin);
    browser = await launch();
    const ctx = await browser.newContext(phone);
    await ctx.addCookies([{ ...scorekeeper, url: origin }]);
    const page = await ctx.newPage();
    page.setDefaultTimeout(30_000);
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
    for (const j of starters) await c.tile('home', j).tap();
    for (const j of starters.slice(0, 3)) await c.tile('away', j).tap();
    await shot(page, '30-scoring-pick-fives-phone.jpg', 'C', 'Picking the starting fives');
    for (const j of starters.slice(3)) await c.tile('away', j).tap();
    await page.locator('[data-scoring][data-stage="play"]').waitFor();
    await play('home', 5, 'p2');
    await play('away', 3, 'p3');
    await play('home', 9, 'p2');
    await play('home', 7, 'p1');
    await play('away', 11, 'p2');
    await play('home', 5, 'p3');
    await play('home', 11, 'foul');
    await play('away', 9, 'foul');
    console.log('score', JSON.stringify(await c.score()));
    await shot(page, '31-scoring-pad-phone.jpg', 'C', 'The scoring pad in the middle of a game');
    await c.fromMore('more-end');
    await c.pad.locator('[data-end-ask]').waitFor();
    await shot(page, '32-end-game-question-phone.jpg', 'C', 'The "End the game?" question');
    await c.answer('yes').click();
    await c.pad.locator('[data-final]').waitFor();
    await page
      .locator('[data-final="saved"]')
      .waitFor({ timeout: 20_000 })
      .catch(() => console.log('final not saved within 20s'));
    await shot(page, '33-final-panel-phone.jpg', 'C', 'The final panel');
  }
} catch (e) {
  console.log('STOPPED', String(e.stack).split('\n').slice(0, 4).join(' | '));
} finally {
  writeFileSync(shotsFile, JSON.stringify({ shots, skipped }, null, 1));
  await browser?.close();
  server?.child.kill();
  console.log('skipped', JSON.stringify(skipped));
}
process.exit(0);
