// signed-in-leagues.ts (step 2.127, record 066): who the session is, and the leagues it
// belongs to, asked only for the session's own account, with U-9 applied before a name
// comes back; and the leagues-of-an-account port has this one caller.
import type { AccountLeagueRow } from '@srleagues/core';
import { startingDesign } from '@srleagues/site';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { RequestFacts } from './context.ts';
import { leaguesOfPerson, personOf } from './signed-in-leagues.ts';

const signedIn = {
  accountId: '01900000-0000-7000-8000-0000000000A1',
  email: 'olive@example.test',
  emailConfirmed: true,
  sessionId: 's',
  hasPassword: true,
  passwordEnteredAt: null,
  lastSignInAt: new Date('2026-11-01T10:00:00Z'),
};
const facts = (session: RequestFacts['session']): RequestFacts => ({
  host: 'h',
  path: '/',
  session,
});

const row = (n: number, status: AccountLeagueRow['status'], held: Partial<AccountLeagueRow>) => ({
  leagueId: `01900000-0000-7000-8000-00000000000${n}`,
  slug: `league-${n}`,
  name: `league-${n}`,
  status,
  isOwner: false,
  roles: [],
  leagueWideRoles: [],
  onRoster: false,
  ...held,
});

describe('personOf', () => {
  it('reads the session: a visitor, a signed-in person, an account problem', () => {
    expect(personOf(facts(null))).toEqual({ kind: 'visitor' });
    expect(personOf(facts({ ok: true, value: signedIn }))).toEqual({
      kind: 'signed-in',
      accountId: signedIn.accountId.toLowerCase(),
      email: 'olive@example.test',
    });
    expect(
      personOf(
        facts({ ok: false, error: { code: 'account-problem', problem: 'address-refused' } }),
      ),
    ).toEqual({ kind: 'account-problem', problem: 'address-refused' });
  });

  it('draws a session that ended or ran out as a visitor, never as someone', () => {
    for (const code of ['session-ended', 'access-expired'] as const) {
      expect(personOf(facts({ ok: false, error: { code } }))).toEqual({ kind: 'visitor' });
    }
  });
});

describe('leaguesOfPerson', () => {
  it('asks nothing for a visitor or an account problem', async () => {
    const asked: string[] = [];
    const ports = { leaguesOfAccount: async (id: string) => (asked.push(id), []) };
    expect(await leaguesOfPerson({ kind: 'visitor' }, ports, () => undefined)).toEqual([]);
    expect(
      await leaguesOfPerson(
        { kind: 'account-problem', problem: 'address-refused' },
        ports,
        () => undefined,
      ),
    ).toEqual([]);
    expect(asked).toEqual([]);
  });

  it("asks for the person's own account only, and drops what U-9 hides before naming", async () => {
    const asked: string[] = [];
    const ports = {
      leaguesOfAccount: async (id: string) => {
        asked.push(id);
        return [
          row(1, 'live', { onRoster: true }),
          row(2, 'draft', { onRoster: true }),
          row(3, 'archived', { roles: ['coach'] }),
        ];
      },
    };
    const sites = (id: string) =>
      id.endsWith('2')
        ? { name: 'Secret Draft League', design: startingDesign('clean-court') }
        : id.endsWith('1')
          ? { name: 'Zebra League', design: startingDesign('clean-court') }
          : undefined;
    const found = await leaguesOfPerson(
      { kind: 'signed-in', accountId: 'a1', email: 'a@example.test' },
      ports,
      sites,
    );
    expect(asked).toEqual(['a1']);
    expect(found.map((l) => l.name)).toEqual(['league-3', 'Zebra League']);
    expect(JSON.stringify(found)).not.toContain('Secret Draft League');
  });
});

describe('the leagues-of-an-account port has one caller (record 066)', () => {
  it('is called only here, with the session’s account, and defined only by the ports', () => {
    const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(full);
      }
    };
    walk(src);
    const using = (word: string) =>
      files
        .filter((file) => readFileSync(file, 'utf8').includes(word))
        .map((file) => path.relative(src, file).replaceAll('\\', '/'))
        .sort();
    expect(using('leaguesOfAccount')).toEqual([
      'server/database-ports.ts',
      'server/ports.ts',
      'server/signed-in-leagues.ts',
      'server/stand-in-ports.ts',
    ]);
    expect(using('leaguesOfPerson')).toEqual(['server/signed-in-leagues.ts']);
  });
});
