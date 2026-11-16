// Lets only a few heavy commands run at the same time on this computer.
//
//   node scripts/heavy.mjs -- npm run typecheck
//   node scripts/heavy.mjs -- node tests/browser/live-game-test.mjs --no-build
//   node scripts/heavy.mjs --status          who holds a turn now
//
// Six lanes that each run a typecheck, a site build, browser tests or pictures at the same
// moment make every one of them several times slower. Measured on 2026-11-16: 21 to 26
// jobs stood in line for a processor with 14 threads, and the helpers spent more than half
// of their working time waiting for commands. This wrapper gives out turns: at most three
// heavy commands at once on the whole computer, every lane counted together (HEAVY_SLOTS,
// or a number in .local/heavy-slots.txt in the main folder, changes the three). A command
// that finds no turn free waits here, which costs no model call, and then runs.
//
// Use it for anything that runs for minutes: the typecheck, building the site, browser
// tests, pictures. Do not use it for one test file or a formatter. Give the command a time
// limit of 600000; if the limit passes while it waits or runs, it carries on in the
// background and you are told when it ends. Never wait for it with a loop or a sleep.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { claimTurn, commandLine, slotCount, turnLines } from './heavy-rules.mjs';

const here = process.cwd();
const commonDir = (
  spawnSync('git', ['rev-parse', '--git-common-dir'], { cwd: here, encoding: 'utf8' }).stdout ?? ''
).trim();
// The main folder of this repository, also when this runs in a lane, so that every lane
// counts the same turns.
const mainRoot = commonDir ? path.dirname(path.resolve(here, commonDir)) : here;
const dir = path.join(mainRoot, '.local/heavy');
let kept = '';
try {
  kept = fs.readFileSync(path.join(mainRoot, '.local/heavy-slots.txt'), 'utf8');
} catch {
  // No number kept: the usual three.
}
const slots = slotCount(process.env, kept);

if (process.argv.includes('--status')) {
  const lines = turnLines(dir);
  console.log(`heavy: ${lines.length} of ${slots} turns taken.`);
  for (const line of lines) console.log(`  ${line}`);
  process.exit(0);
}

const split = process.argv.indexOf('--');
const words = split === -1 ? [] : process.argv.slice(split + 1);
if (words.length === 0) {
  console.error('Usage: node scripts/heavy.mjs -- <command> [its words...]');
  process.exit(2);
}

const info = { pid: process.pid, command: words.join(' ').slice(0, 160), cwd: here };
const started = Date.now();
let turn = claimTurn(dir, slots, info);
if (!turn) {
  console.error(`heavy: ${slots} heavy commands are running on this computer. Waiting for a turn.`);
  while (!turn) {
    await new Promise((resolve) => setTimeout(resolve, 2000 + Math.random() * 1500));
    turn = claimTurn(dir, slots, info);
  }
  console.error(`heavy: waited ${Math.round((Date.now() - started) / 1000)} s for a turn.`);
}

const release = () => {
  if (turn) fs.rmSync(turn, { force: true });
  turn = null;
};
process.on('exit', release);
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    release();
    process.exit(130);
  });
}

const child = spawn(commandLine(words), { stdio: 'inherit', shell: true, cwd: here });
child.on('error', (error) => {
  console.error(`heavy: the command could not be started: ${error.message}`);
  release();
  process.exit(127);
});
child.on('exit', (code, signal) => {
  release();
  process.exit(code ?? (signal ? 1 : 0));
});
