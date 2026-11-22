// The kept emails (step 2.96): written to the working folder's .local/captured-email only
// for made-up addresses and only once started, read back newest first with their code and
// their links to this site only.
import { captureEmail } from '@srleagues/providers';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  isMadeUpAddress,
  keepingSender,
  keptEmailOf,
  keptEmailsFolderFrom,
  keptEmailsShown,
  readKeptEmails,
} from './kept-emails.ts';
import { t } from './messages.ts';

const origin = 'http://127.0.0.1:3000';
/** The scratch folders this file made in the system's temp folder: removed after each test. */
const made: string[] = [];
const scratch = () => {
  const folder = mkdtempSync(path.join(os.tmpdir(), 'kept-emails-'));
  made.push(folder);
  return folder;
};
afterEach(() => {
  // An email still being kept as the test ends can leave the folder not yet empty on a busy
  // machine (GitHub, 2026-11-22): the removal tries again instead of failing the test.
  for (const folder of made.splice(0)) {
    rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
const message = (to: string, text: string, key = `key-${to}-${text}`) => ({
  from: 'SR Leagues <hello@example.test>',
  to,
  subject: 'Your code to create your account',
  html: '<p>made up</p>',
  text,
  idempotencyKey: key,
});

describe('isMadeUpAddress', () => {
  it('is true for names kept for made-up mail only', () => {
    for (const address of [
      'owner@example.test',
      'owner@lakeside.example.test',
      'Someone@Example.COM',
      'a@b.example',
      'a@x.invalid',
      'a@app.localhost',
      'a@mail.example.org',
      'a@example.net',
    ]) {
      expect(isMadeUpAddress(address), address).toBe(true);
    }
    for (const address of [
      'someone@gmail.com',
      'someone@example.com.evil.org',
      'someone@notexample.com',
      'someone@test',
      'no-at-sign.test',
      '@example.test',
      'a@exa mple.test',
    ]) {
      expect(isMadeUpAddress(address), address).toBe(false);
    }
  });
});

// Review of step 2.96, L7: the page names every kind of address it keeps, and no other.
describe('the kept emails page’s words', () => {
  it('name exactly the made-up addresses isMadeUpAddress keeps', () => {
    const intro = t('standIn.keptEmails.intro');
    const endings = [...intro.matchAll(/(?<![\w.])\.(test|example|invalid|localhost)\b/g)].map(
      (m) => `.${m[1]}`,
    );
    const names = [...intro.matchAll(/\bexample\.(com|net|org)\b/g)].map((m) => m[0]);
    expect(endings).toEqual(['.test', '.example', '.invalid', '.localhost']);
    expect(names).toEqual(['example.com', 'example.net', 'example.org']);
    for (const ending of endings) expect(isMadeUpAddress(`a@b${ending}`), ending).toBe(true);
    for (const name of names) {
      expect(isMadeUpAddress(`a@${name}`), name).toBe(true);
      expect(isMadeUpAddress(`a@mail.${name}`), name).toBe(true);
    }
    expect(intro).toContain('a name under them');
  });
});

describe('keptEmailsFolderFrom', () => {
  it('is .local/captured-email in the first folder up whose package.json lists workspaces', () => {
    const root = scratch();
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({ workspaces: ['apps/*'] }));
    const app = path.join(root, 'apps', 'web');
    mkdirSync(app, { recursive: true });
    writeFileSync(path.join(app, 'package.json'), JSON.stringify({ name: 'web' }));
    expect(keptEmailsFolderFrom(app)).toBe(path.join(root, '.local', 'captured-email'));
  });

  it('is none where no such folder is found', () => {
    expect(keptEmailsFolderFrom(scratch())).toBeNull();
  });

  it('finds this repository’s own, inside its git-ignored .local folder', () => {
    const found = keptEmailsFolderFrom(process.cwd());
    expect(found).not.toBeNull();
    expect(path.relative(process.cwd(), found ?? '')).toBe(path.join('.local', 'captured-email'));
  });
});

describe('keepingSender', () => {
  it('writes only after startKeeping, only for made-up addresses, and always keeps in memory', async () => {
    const folder = path.join(scratch(), 'captured-email');
    const memory = captureEmail();
    let notKept = 0;
    const keeping = keepingSender(memory, folder, {
      now: () => new Date('2026-11-16T12:00:00Z'),
      onNotKept: () => (notKept += 1),
    });
    await keeping.sender.send(message('owner@example.test', 'Your code is 111111.'));
    expect(() => readdirSync(folder)).toThrow();
    keeping.startKeeping();
    await keeping.sender.send(message('new@example.test', 'Your code is 222222.'));
    await keeping.sender.send(message('someone@gmail.com', 'Your code is 333333.'));
    expect(memory.messages().map((m) => m.to)).toEqual([
      'owner@example.test',
      'new@example.test',
      'someone@gmail.com',
    ]);
    const kept = await readKeptEmails(folder, origin);
    expect(kept.map((m) => m.to)).toEqual(['new@example.test']);
    expect(kept[0]?.code).toBe('222222');
    expect(notKept).toBe(0);
  });

  // Review of step 2.96, L4: the folder does not grow without end.
  it('keeps the newest files it wrote as the page shows them, never removing another’s', async () => {
    const folder = path.join(scratch(), 'captured-email');
    const worker = captureEmail({ directory: folder, now: () => new Date('2026-11-16T09:00:00Z') });
    const { id: workersId } = await worker.send(message('player@example.test', 'From the worker.'));
    let minute = 0;
    const keeping = keepingSender(captureEmail(), folder, {
      now: () => new Date(Date.UTC(2026, 10, 16, 10, minute++)),
      onNotKept: () => {},
    });
    keeping.startKeeping();
    for (let n = 0; n < keptEmailsShown + 3; n += 1) {
      await keeping.sender.send(message(`p${n}@example.test`, `Your code is ${100000 + n}.`));
    }
    const files = readdirSync(folder);
    expect(files.filter((file) => file.endsWith('.json'))).toHaveLength(keptEmailsShown + 1);
    expect(files.filter((file) => file.includes(workersId))).toHaveLength(2);
    const kept = await readKeptEmails(folder, origin, keptEmailsShown + 10);
    expect(kept.map((m) => m.to)).not.toContain('p0@example.test');
    expect(kept.map((m) => m.to)).not.toContain('p2@example.test');
    expect(kept.map((m) => m.to)).toContain('p3@example.test');
    expect(kept[0]?.to).toBe(`p${keptEmailsShown + 2}@example.test`);
  });

  it('writes nothing without a folder', async () => {
    const memory = captureEmail();
    const keeping = keepingSender(memory, null, { now: () => new Date(), onNotKept: () => {} });
    keeping.startKeeping();
    await keeping.sender.send(message('new@example.test', 'Your code is 222222.'));
    expect(memory.messages()).toHaveLength(1);
  });
});

describe('readKeptEmails', () => {
  it('reads the newest first, skips what is not a kept email, and is empty for no folder', async () => {
    const folder = path.join(scratch(), 'captured-email');
    const times = ['2026-11-16T10:00:00Z', '2026-11-16T11:00:00Z', '2026-11-16T12:00:00Z'];
    for (const [n, at] of times.entries()) {
      const kept = captureEmail({ directory: folder, now: () => new Date(at) });
      await kept.send(message(`p${n}@example.test`, `Your code is 10000${n}.`));
    }
    writeFileSync(path.join(folder, 'zzz-not-an-email.json'), '{"no": "fields"}');
    writeFileSync(path.join(folder, 'zzzz-broken.json'), '{');
    const kept = await readKeptEmails(folder, origin);
    expect(kept.map((m) => m.to)).toEqual([
      'p2@example.test',
      'p1@example.test',
      'p0@example.test',
    ]);
    expect((await readKeptEmails(folder, origin, 2)).length).toBeLessThanOrEqual(2);
    expect(await readKeptEmails(path.join(folder, 'missing'), origin)).toEqual([]);
  });
});

// Review of step 2.96, L3: the worker's capture writes every address into the folder it is
// given, so the page checks each address as it reads.
describe('readKeptEmails and the address', () => {
  it('shows no email to an address that is not made up, whoever wrote the file', async () => {
    const folder = path.join(scratch(), 'captured-email');
    // As the worker writes them (EMAIL_CAPTURE_DIR): every address, no check.
    const worker = captureEmail({ directory: folder, now: () => new Date('2026-11-16T12:00:00Z') });
    await worker.send(message('someone@gmail.com', 'Your code is 444444.'));
    await worker.send(message('player@example.test', 'Your code is 555555.'));
    await worker.send(message('owner@example.com.evil.org', 'Your code is 666666.'));
    const kept = await readKeptEmails(folder, origin);
    expect(kept.map((m) => m.to)).toEqual(['player@example.test']);
    expect(JSON.stringify(kept)).not.toContain('444444');
    expect(JSON.stringify(kept)).not.toContain('666666');
  });
});

describe('keptEmailOf', () => {
  const email = (text: string) =>
    keptEmailOf(
      {
        id: 'captured-1',
        capturedAt: '2026-11-16T12:00:00Z',
        to: 'a@example.test',
        subject: 's',
        text,
      },
      origin,
    );

  it('finds a 6-digit code standing alone', () => {
    expect(email('Your code is 123456. It works for 10 minutes.').code).toBe('123456');
    expect(email('No code here, only a link token abc123456def.').code).toBeNull();
  });

  it('gives as links only those to this site, each once', () => {
    const found = email(
      `Accept the invitation: ${origin}/north-valley/invitation/made-up-token.\n` +
        `Again: ${origin}/north-valley/invitation/made-up-token\n` +
        'Elsewhere: https://elsewhere.example.com/x\n' +
        `Powered by SR Leagues: ${origin}`,
    );
    expect(found.links).toEqual([`${origin}/north-valley/invitation/made-up-token`, origin]);
  });
});
