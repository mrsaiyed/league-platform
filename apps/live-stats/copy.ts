// Copy live stats between databases: `npm run stats:copy`.
//
// By default from this computer's database (.local/live-stats) to DATABASE_URL (from
// the environment or .env), so games tracked before Supabase existed, or at a gym
// with no internet, end up online. Shows what it will do and asks first.
//
//   npm run stats:copy                    copy this computer's games up, after asking
//   npm run stats:copy -- --dry-run       only show what would be copied
//   npm run stats:copy -- --yes           copy without asking
//   npm run stats:copy -- --from DATABASE_URL --to .local/backups/2026-12-02
//                                         back the hosted database up into a folder
//   npm run stats:copy -- --replace       also overwrite games that differ on the other side
import path from 'node:path';
import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { copyLiveStats } from '../../packages/database/src/live-stats/copy.ts';
import type { CopyReport } from '../../packages/database/src/live-stats/copy.ts';
import {
  PostgresRepository,
  describeDatabaseError,
} from '../../packages/database/src/live-stats/postgres.ts';
import { localDataDir, lockDataDir, openDb } from './storage.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const env = process.env;
const { values: args } = parseArgs({
  options: {
    from: { type: 'string' },
    to: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    yes: { type: 'boolean', short: 'y', default: false },
    replace: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});
if (args.help) {
  console.log(
    'Usage: npm run stats:copy -- [--from <folder|url|DATABASE_URL>] [--to <folder|url|DATABASE_URL>]\n' +
      '                             [--dry-run] [--yes] [--replace]\n' +
      'Defaults: from this computer (.local/live-stats) to DATABASE_URL.',
  );
  process.exit(0);
}

// The word DATABASE_URL stands for the connection string in .env or the environment.
const named = (spec: string | undefined) =>
  spec?.trim().toUpperCase() === 'DATABASE_URL' ? env.DATABASE_URL?.trim() || undefined : spec;
const from = named(args.from) ?? localDataDir(env, root);
const to = named(args.to ?? 'DATABASE_URL');
if (args.from && !from) {
  console.error('DATABASE_URL is not set (in .env or the environment).');
  process.exit(1);
}
if (!to) {
  console.error(
    'Where to? Set DATABASE_URL (in .env or the environment) to the Supabase connection string,\n' +
      'or pass --to <connection string or folder>.',
  );
  process.exit(1);
}
const isUrl = (s: string) => /^postgres(?:ql)?:/i.test(s.trim());
if (!isUrl(from) && !isUrl(to) && path.resolve(from) === path.resolve(to)) {
  console.error('The source and the destination are the same.');
  process.exit(1);
}

const ACTIONS: Record<CopyReport['games'][number]['action'], string> = {
  add: 'copy',
  update: 'bring up to date (the copy there is behind)',
  same: 'already there',
  'newer-there': 'skip: the copy there is further along',
  conflict: 'skip: tracked differently there (use --replace to overwrite it)',
  replace: 'overwrite the copy there (--replace)',
};
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
// Fixtures are in Houston: dates read in Central time, as on the schedule.
const day = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Chicago',
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }).format(new Date(iso))
    : 'No date';
function show(report: CopyReport) {
  console.log(
    `Teams:   ${report.teams.add} to add, ${report.teams.same} already there\n` +
      `Players: ${report.players.add} to add, ${report.players.update} to update, ${report.players.same} already there`,
  );
  if (!report.games.length) console.log('Games:   none tracked here yet');
  else {
    console.log('Games:');
    for (const g of report.games)
      console.log(
        `  ${day(g.startsAt)} · ${g.label} · ${plural(g.actions, 'action')} → ${ACTIONS[g.action]}`,
      );
  }
}

const releases: (() => Promise<void>)[] = [];
try {
  // An embedded database can only be open in one place: not while its stats server runs.
  for (const spec of [from, to])
    if (!isUrl(spec))
      releases.push(
        await lockDataDir(
          path.resolve(spec),
          (pid) =>
            `The stats server (process ${pid}) is using ${path.resolve(spec)}. Stop it with Ctrl+C, then run this again.`,
        ),
      );
  const source = await openDb(from, env);
  releases.push(() => source.db.close());
  const target = await openDb(to, env, { create: true });
  releases.push(() => target.db.close());
  console.log(`From: ${source.label}\nTo:   ${target.label}\n`);
  await new PostgresRepository(target.db).initialize();

  const options = { replace: args.replace };
  const preview = await copyLiveStats(source.db, target.db, { ...options, apply: false });
  show(preview);
  const work =
    preview.teams.add +
    preview.players.add +
    preview.players.update +
    preview.games.filter((g) => ['add', 'update', 'replace'].includes(g.action)).length;
  if (!work) console.log('\nNothing to copy: everything is already there.');
  else if (args['dry-run']) console.log('\nDry run: nothing was copied.');
  else {
    let go = args.yes;
    if (!go) {
      if (!process.stdin.isTTY) throw new Error('Add --yes to copy without being asked.');
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      go = /^y(es)?$/i.test((await rl.question('\nCopy now? [y/N] ')).trim());
      rl.close();
    }
    if (!go) console.log('Nothing was copied.');
    else {
      const done = await copyLiveStats(source.db, target.db, { ...options, apply: true });
      const games = done.games.filter((g) => ['add', 'update', 'replace'].includes(g.action));
      console.log(
        `\nCopied: ${plural(done.teams.add, 'team')}, ${plural(done.players.add, 'player')} added and ${done.players.update} updated, ${plural(games.length, 'game')} with ${plural(
          games.reduce((n, g) => n + g.actions, 0),
          'recorded action',
        )}.`,
      );
    }
  }
} catch (error) {
  console.error(describeDatabaseError(error));
  process.exitCode = 1;
} finally {
  for (const release of releases.reverse()) await release().catch(() => {});
}
