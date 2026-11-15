// Prints how many of the lead's helpers did something in the last three minutes, read for
// free from files on this computer (scripts/dashboard/live.mjs). No AI is involved.
//   node scripts/helpers-working.mjs
// The ten-minute scheduled check runs this. A helper at work means the build is alive, even
// when the lead is only waiting for reports and has not written its time stamp lately, so
// the lead need not spend a turn of its own just to renew that stamp.
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readLive, sessionsFolder } from './dashboard/live.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// The main folder of this repository, also when this runs from a private copy of it.
const commonDir = (
  spawnSync('git', ['rev-parse', '--git-common-dir'], { cwd: root, encoding: 'utf8' }).stdout ?? ''
).trim();
const live = readLive(sessionsFolder(path.dirname(path.resolve(root, commonDir || '.git'))));
const working = live.helpers.filter((helper) => helper.active).length;
console.log(`helpers working this minute: ${live.known ? working : 'unknown'}`);
