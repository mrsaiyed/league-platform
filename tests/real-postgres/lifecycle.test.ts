// start, status and stop as a person runs them (step 2.202's done test): on a second
// server of its own, in its own folder and on its own port, so the one the other tests
// use keeps running. `stop` leaves no process of it and git sees nothing changed.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, readlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const folder = '.local/pg-lifecycle-test';
const full = path.join(root, folder);
const options = ['--folder', folder, '--port', '54339'];

const script = (command: string) => {
  const ran = spawnSync(process.execPath, ['scripts/real-postgres.mjs', command, ...options], {
    cwd: root,
    encoding: 'utf8',
  });
  return { status: ran.status, said: `${ran.stdout}${ran.stderr}` };
};
const gitStatus = () =>
  spawnSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
    cwd: root,
    encoding: 'utf8',
  }).stdout;

/** Whether the process runs: one that ended and waits to be collected (a zombie) does not. */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EPERM') return false;
  }
  if (!existsSync(`/proc/${pid}/stat`)) return true;
  const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
  return (
    stat
      .slice(stat.lastIndexOf(')') + 1)
      .trim()
      .split(' ')[0] !== 'Z'
  );
}

/** Every process working in the folder (Linux shows each one's working folder). */
function processesIn(dir: string): number[] {
  if (!existsSync('/proc')) return [];
  return readdirSync('/proc')
    .filter((entry) => /^\d+$/.test(entry))
    .filter((entry) => {
      try {
        const cwd = readlinkSync(`/proc/${entry}/cwd`);
        return cwd === dir || cwd.startsWith(dir + path.sep);
      } catch {
        return false;
      }
    })
    .map(Number);
}

describe('start, status and stop', () => {
  it('start makes a server, status sees it, stop leaves no process and a clean git status', () => {
    const before = gitStatus();
    expect(script('stop').said).toContain('No test PostgreSQL is running');

    const started = script('start');
    expect(started.said).toContain('Started a throw-away PostgreSQL');
    expect(started.said).toContain('localhost, port 54339');
    expect(started.status).toBe(0);
    const pid = Number(
      readFileSync(path.join(full, 'data', 'postmaster.pid'), 'utf8').split('\n')[0],
    );
    expect(alive(pid)).toBe(true);
    if (process.platform === 'linux') expect(processesIn(full).length).toBeGreaterThan(1);

    const status = script('status');
    expect(status.said).toContain(
      `is running in ${folder}, on localhost port 54339 (process ${pid})`,
    );
    // A second start changes nothing.
    expect(script('start').said).toContain('is already running');
    // Nothing said holds a password or an address.
    const written = JSON.parse(readFileSync(path.join(full, 'connection.json'), 'utf8'));
    for (const said of [started.said, status.said]) {
      expect(said).not.toContain(new URL(written.appUrl).password);
      expect(said).not.toContain(new URL(written.ownerUrl).password);
      expect(said).not.toContain('postgres://');
    }

    const stopped = script('stop');
    expect(stopped.said).toContain('No process of it is left');
    expect(stopped.status).toBe(0);
    expect(alive(pid)).toBe(false);
    expect(processesIn(full)).toEqual([]);
    expect(existsSync(full)).toBe(false);
    expect(gitStatus()).toBe(before);
    expect(script('status').said).toContain(`No test PostgreSQL is running in ${folder}`);
  });

  it('refuses a folder that is not inside .local', () => {
    const ran = spawnSync(
      process.execPath,
      ['scripts/real-postgres.mjs', 'stop', '--folder', 'docs'],
      { cwd: root, encoding: 'utf8' },
    );
    expect(ran.status).toBe(1);
    expect(ran.stderr).toContain('is not a folder of its own inside .local');
    expect(existsSync(path.join(root, 'docs'))).toBe(true);
  });
});
