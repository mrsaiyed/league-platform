// Run by .github/workflows/ci.yml when `npm run test:web:browser` fails: prints, as GitHub
// annotations, which browser test stopped, what failed and what the machine was, from the
// output the step kept (scripts/browser-failure-rules.mjs decides what is shown).
//
//   node scripts/browser-failure-notes.mjs <file with the browser tests' output>
//
// It reads only that file and the machine's own settings (it starts the browser the tests
// use, to read its version), and prints nothing else.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import { chromium } from 'playwright';
import { browserFailureNotes } from './browser-failure-rules.mjs';

const machine = [];
const what = (label, find) => {
  try {
    machine.push([label, find()]);
  } catch (error) {
    machine.push([label, `could not tell (${String(error?.message ?? error).split('\n')[0]})`]);
  }
};

// The browser the tests use on GitHub (tests/browser/web-browser-kit.mjs: Chromium when CI is set).
let browserVersion;
try {
  const browser = await (process.env.CI
    ? chromium.launch({ timeout: 60_000 })
    : chromium.launch({ channel: 'msedge', timeout: 60_000 }));
  browserVersion = `${process.env.CI ? 'Chromium' : 'Edge'} ${browser.version()}`;
  await browser.close();
} catch (error) {
  browserVersion = `did not start: ${String(error?.message ?? error).split('\n')[0]}`;
}
what('browser', () => browserVersion);
what('Playwright', () => createRequire(import.meta.url)('playwright/package.json').version);
what('operating system', () => {
  const named = fs.existsSync('/etc/os-release')
    ? /^PRETTY_NAME="?([^"\n]*)/m.exec(fs.readFileSync('/etc/os-release', 'utf8'))?.[1]
    : '';
  return `${named || os.type()} (${os.platform()} ${os.release()}, ${os.arch()})`;
});
what('Node', () => process.version);
what('time zone', () => {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const offset = -new Date().getTimezoneOffset();
  const sign = offset < 0 ? '-' : '+';
  const hours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0');
  const minutes = String(Math.abs(offset) % 60).padStart(2, '0');
  return `${zone} (UTC${sign}${hours}:${minutes}; TZ ${process.env.TZ ?? 'not set'})`;
});
what(
  'language',
  () => `${Intl.DateTimeFormat().resolvedOptions().locale} (LANG ${process.env.LANG ?? 'not set'})`,
);
what('time (UTC)', () => new Date().toISOString());
what(
  'processors and memory',
  () =>
    `${os.cpus().length} processors, ${(os.totalmem() / 2 ** 30).toFixed(1)} GB memory, ${(os.freemem() / 2 ** 30).toFixed(1)} GB free`,
);

let output;
try {
  output = fs.readFileSync(process.argv[2] ?? '', 'utf8');
} catch {
  output = '';
}
for (const note of browserFailureNotes(output, machine)) console.log(note);
