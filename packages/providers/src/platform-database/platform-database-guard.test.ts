// The tracker's database guard (record 055): every spelling of the tracker's address
// is refused, before anything connects, and no refusal repeats any part of the value.
// Every address and project reference here is made up and answers nobody.
import { describe, expect, it } from 'vitest';
import {
  addressOnThisComputer,
  isIpLiteral,
  platformDatabaseProblem,
  platformServiceProblem,
  trackerProjectProblem,
  type TrackerGuardFacts,
} from './platform-database-guard.ts';

const ref = 'abcdefghijklmnopqrst';
const name = 'PLATFORM_DATABASE_URL';
const secret = 'made-up-pw-7c1';
const facts = (overrides: Partial<TrackerGuardFacts> = {}): TrackerGuardFacts => ({
  env: {},
  appEnv: 'production',
  trackerProject: ref,
  ...overrides,
});
const problem = (value: string, overrides: Partial<TrackerGuardFacts> = {}) =>
  platformDatabaseProblem(name, value, facts(overrides));

const namesTracker = `${name}: invalid, must not name the tracker's Supabase project (supabase/site.json)`;
const fromQuery = `${name}: invalid, must not take its host, port, user, password, options or database name from its query string`;
const trackerDatabase = `${name}: invalid, must not be the tracker's database (DATABASE_URL)`;
const notAscii = `${name}: invalid, must have a host and user of plain ASCII characters`;
const ipHost = (appEnv: string) =>
  `${name}: invalid, must name its server by a host name, not an IP address, when APP_ENV is ${appEnv}`;

/** Each refusal names the setting and a fixed reason: no part of the value. */
function expectNoValueIn(line: string | undefined, value: string): void {
  expect(line).toBeDefined();
  const reason = (line ?? '').slice(`${name}: invalid, `.length);
  // The password, the project, and any host or address the value names.
  const parts = [secret, ref, 'example.test', 'supabase.co', 'supabase.com', '192.0', '127.0'];
  for (const part of parts) expect(reason.toLowerCase()).not.toContain(part);
  expect(reason).not.toContain(value.trim());
}

describe('platformDatabaseProblem', () => {
  it('lets a platform address of its own through', () => {
    for (const value of [
      `postgres://app:${secret}@db.example.test:5432/league`,
      `postgresql://app.otherprojectref1234:${secret}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
      `postgres://app:${secret}@localhost:5432/league?application_name=web`,
    ]) {
      expect(problem(value)).toBeUndefined();
    }
  });

  it('refuses the tracker’s project in the host or the pooler’s user, in any case', () => {
    for (const value of [
      `postgres://postgres:${secret}@db.${ref}.supabase.co:5432/postgres`,
      `postgres://postgres:${secret}@DB.${ref.toUpperCase()}.SUPABASE.CO:5432/postgres`,
      `postgres://postgres.${ref}:${secret}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
      `postgres://app:${secret}@db.example.test:5432/${ref}`,
    ]) {
      expect(problem(value)).toBe(namesTracker);
      expectNoValueIn(problem(value), value);
    }
  });

  it('refuses the tracker’s project percent-encoded in the user or the host', () => {
    // %61 is "a": pg-connection-string decodes the user and the host before connecting.
    const encoded = `%61${ref.slice(1)}`;
    for (const value of [
      `postgres://postgres.${encoded}:${secret}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
      `postgres://postgres:${secret}@db.${encoded}.supabase.co:5432/postgres`,
      `postgres://postgres%2E${encoded}:${secret}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
      `postgres://postgres:${secret}@db.%2561${ref.slice(1)}.supabase.co/postgres`,
    ]) {
      expect(problem(value)).toBe(namesTracker);
      expectNoValueIn(problem(value), value);
    }
  });

  it('refuses the tracker’s project in the query string, and any place taken from it', () => {
    for (const value of [
      `postgres://app:${secret}@pooler.example.test:6543/postgres?user=postgres.${ref}`,
      `postgres://app:${secret}@pooler.example.test:6543/postgres?user=postgres.%61${ref.slice(1)}`,
      `postgres://app:${secret}@elsewhere.example.test/postgres?host=db.${ref}.supabase.co`,
      `postgres://app:${secret}@pooler.example.test:6543/postgres?options=reference%3D${ref}`,
    ]) {
      expect(problem(value)).toBe(namesTracker);
    }
    for (const query of [
      'host=db.example.test',
      'hostaddr=192.0.2.1',
      'port=6543',
      'user=someone',
      'password=another',
      'options=-c%20search_path%3Dx',
      'dbname=other',
      'database=other',
      'HOST=db.example.test',
      'h%6Fst=db.example.test',
      'application_name=web&user=someone',
    ]) {
      const value = `postgres://app:${secret}@db.example.test:5432/league?${query}`;
      expect(problem(value), query).toBe(fromQuery);
      expectNoValueIn(problem(value), value);
    }
  });

  it('refuses a host or user that is not plain ASCII, which could fold into the tracker’s', () => {
    // The Kelvin sign lower-cases into k; full-width letters fold into ASCII.
    const kelvin = 'db.Kelvin.example.test';
    expect(problem(`postgres://app:${secret}@${kelvin}/league`)).toBe(notAscii);
    expect(problem(`postgres://Kim:${secret}@db.example.test/league`)).toBe(notAscii);
    const wide = `db.ａ${ref.slice(1)}.supabase.co`;
    expect(problem(`postgres://app:${secret}@${wide}/postgres`)).toBe(namesTracker);
    expect(problem(`postgres://app:${secret}@db.example.test/league`)).toBeUndefined();
  });

  it('refuses an IP address as the host in staging and production, not in local work', () => {
    for (const host of [
      '127.0.0.1',
      '192.0.2.10',
      '[::1]',
      '[2001:db8::5]',
      '[::ffff:192.0.2.10]',
      '2130706433',
      '0x7f.1',
      '0177.0.0.1',
    ]) {
      const value = `postgres://app:${secret}@${host}:5432/league`;
      for (const appEnv of ['staging', 'production']) {
        expect(problem(value, { appEnv }), `${host} ${appEnv}`).toBe(ipHost(appEnv));
        expectNoValueIn(problem(value, { appEnv }), value);
      }
      expect(problem(value, { appEnv: 'local' }), host).toBeUndefined();
    }
    expect(problem(`postgres://app:${secret}@localhost:5432/league`)).toBeUndefined();
    expect(problem(`postgres://app:${secret}@db7.example.test:5432/league`)).toBeUndefined();
  });

  it('refuses an address that leaves its place to PGHOST, PGPORT, PGUSER or PGDATABASE', () => {
    const bare = 'postgres:///postgres';
    const env = (variables: Record<string, string>) => ({ env: variables });
    expect(problem(bare, env({ PGHOST: 'db.example.test' }))).toBe(
      `${name}: invalid, must give its own host: PGHOST is set and would decide it`,
    );
    expect(problem(`postgres://db.example.test/league`, env({ PGUSER: 'someone' }))).toBe(
      `${name}: invalid, must give its own user: PGUSER is set and would decide it`,
    );
    expect(problem(`postgres://app@db.example.test`, env({ PGDATABASE: 'other' }))).toBe(
      `${name}: invalid, must give its own database: PGDATABASE is set and would decide it`,
    );
    expect(problem(`postgres://app@db.example.test/league`, env({ PGPORT: '6543' }))).toBe(
      `${name}: invalid, must give its own port: PGPORT is set and would decide it`,
    );
    const full = `postgres://app:${secret}@db.example.test:5432/league`;
    expect(problem(full, env({ PGOPTIONS: `-c reference=${ref}` }))).toBe(
      `${name}: invalid, cannot be checked while PGOPTIONS is set: it would decide the connection`,
    );
    // An address that gives each part itself is not decided by them.
    const set = { PGHOST: 'x.example.test', PGUSER: 'x', PGDATABASE: 'x', PGPORT: '1' };
    expect(problem(full, env(set))).toBeUndefined();
    // Local work and tests never open the address (T-201).
    expect(problem(bare, { appEnv: 'test', env: { PGHOST: 'db.example.test' } })).toBeUndefined();
  });

  it('refuses the tracker’s DATABASE_URL, also written another way', () => {
    const tracker = `postgres://postgres:${secret}@tracker.example.test:5432/postgres`;
    for (const value of [
      tracker,
      `  ${tracker} `,
      `postgres://postgres:${secret}@TRACKER.example.test/postgres`,
      `postgresql://postgres:other-made-up@tracker.example.test:5432/postgres?sslmode=require`,
      `postgres://%70ostgres:${secret}@tracker.example.test:5432/postgres`,
    ]) {
      expect(problem(value, { env: { DATABASE_URL: tracker } }), value).toBe(trackerDatabase);
      expectNoValueIn(problem(value, { env: { DATABASE_URL: tracker } }), value);
    }
    // Another database on the same server is not the tracker's.
    expect(
      problem(`postgres://postgres:${secret}@tracker.example.test:5432/league`, {
        env: { DATABASE_URL: tracker },
      }),
    ).toBeUndefined();
  });

  it('refuses an address it cannot read, without repeating it', () => {
    const value = `postgres://app:${secret}@[not-an-ip/league`;
    expect(problem(value)).toBe(`${name}: invalid, must be a postgres:// address that can be read`);
    expectNoValueIn(problem(value), value);
  });

  it('leaves the project check out without a project, and anything not postgres:// to the schema', () => {
    const named = `postgres://postgres:${secret}@db.${ref}.supabase.co:5432/postgres`;
    expect(problem(named, { trackerProject: undefined })).toBeUndefined();
    expect(problem(named, { trackerProject: null })).toBeUndefined();
    expect(problem(`mysql://app:${secret}@db.${ref}.supabase.co/x`)).toBeUndefined();
  });
});

describe('platformDatabaseProblem for a tool with no APP_ENV that opens a hosted database', () => {
  const hosted = (value: string, env: Record<string, string> = {}) =>
    platformDatabaseProblem(
      'MIGRATION_DATABASE_URL',
      value,
      facts({ appEnv: undefined, hosted: true, env }),
    );

  it('is as strict as production, and names its own setting', () => {
    expect(hosted(`postgres://app:${secret}@192.0.2.10:5432/league`)).toBe(
      'MIGRATION_DATABASE_URL: invalid, must name its server by a host name, not an IP address, for a hosted database',
    );
    expect(hosted('postgres:///postgres', { PGHOST: 'db.example.test' })).toBe(
      'MIGRATION_DATABASE_URL: invalid, must give its own host: PGHOST is set and would decide it',
    );
    expect(
      hosted(
        `postgres://postgres.${ref}:${secret}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
      ),
    ).toBe(
      "MIGRATION_DATABASE_URL: invalid, must not name the tracker's Supabase project (supabase/site.json)",
    );
    expect(
      hosted(`postgres://app:${secret}@db.example.test:5432/league?host=elsewhere.example.test`),
    ).toBe(
      'MIGRATION_DATABASE_URL: invalid, must not take its host, port, user, password, options or database name from its query string',
    );
    expect(hosted(`postgres://app:${secret}@db.example.test:5432/league`)).toBeUndefined();
  });

  it('cannot be loosened by hosted: false in staging or production', () => {
    const ip = `postgres://app:${secret}@192.0.2.10:5432/league`;
    for (const appEnv of ['staging', 'production']) {
      expect(platformDatabaseProblem(name, ip, facts({ appEnv, hosted: false })), appEnv).toBe(
        ipHost(appEnv),
      );
      expect(
        trackerProjectProblem(['A'], { appEnv, hosted: false, trackerProject: null }),
      ).toBeDefined();
    }
  });

  it('refuses it when the tracker’s project could not be read', () => {
    expect(
      trackerProjectProblem(['MIGRATION_DATABASE_URL'], {
        appEnv: undefined,
        hosted: true,
        trackerProject: null,
      }),
    ).toBe(
      "supabase/site.json: could not be read, so MIGRATION_DATABASE_URL cannot be checked against the tracker's project",
    );
  });
});

describe('the address cannot change how the connection is encrypted', () => {
  it('refuses, by name, every query string key the parser reads for SSL, in any spelling', () => {
    const base = `postgres://app:${secret}@db.example.test:5432/league`;
    for (const [query, key] of [
      ['ssl=0', 'ssl'],
      ['ssl=no-verify', 'ssl'],
      ['ssl=true', 'ssl'],
      ['ssl=1', 'ssl'],
      ['SSL=0', 'ssl'],
      ['s%73l=0', 'ssl'],
      ['sslnegotiation=direct', 'sslnegotiation'],
      ['sslmode=disable', 'sslmode'],
      ['sslmode=verify-full', 'sslmode'],
      ['sslrootcert=made-up.crt', 'sslrootcert'],
      ['sslcert=made-up.crt', 'sslcert'],
      ['sslkey=made-up.key', 'sslkey'],
      ['uselibpqcompat=true', 'uselibpqcompat'],
      ['application_name=web&ssl=0', 'ssl'],
    ]) {
      const value = `${base}?${query}`;
      for (const appEnv of ['local', 'production']) {
        expect(problem(value, { appEnv }), `${query} ${appEnv}`).toBe(
          `${name}: invalid, must not set ${key} in its query string: whether and how the connection is encrypted is never taken from the address`,
        );
      }
      expectNoValueIn(problem(value), value);
    }
    expect(problem(`${base}?application_name=web`)).toBeUndefined();
  });
});

describe('addressOnThisComputer', () => {
  it('counts only localhost, 127.0.0.1 and ::1 as this computer', () => {
    for (const value of [
      'postgres://app@localhost:5432/league',
      'postgres://app@LOCALHOST/league',
      'postgres://app@127.0.0.1:5432/league',
      'postgres://app@[::1]:5432/league',
    ]) {
      expect(addressOnThisComputer(value), value).toBe(true);
    }
    for (const value of [
      'postgres://app@db.example.test:5432/league',
      `postgres://postgres.${ref}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
      'postgres://app@192.0.2.10/league',
      'postgres://app@localhost.example.test/league',
      'postgres://app@%6Cocalhost.example.test/league',
      // A name that may lead here, another loopback address, a socket, or no host at all.
      'postgres://app@db.localhost/league',
      'postgres://app@127.0.0.2/league',
      'postgres://app@%2Fvar%2Frun%2Fpostgresql/league',
      'postgres:///league',
    ]) {
      expect(addressOnThisComputer(value), value).toBe(false);
    }
    expect(addressOnThisComputer('mysql://app@localhost/league')).toBeUndefined();
    expect(addressOnThisComputer('postgres://app@[not-an-ip/league')).toBeUndefined();
  });
});

describe('platformServiceProblem', () => {
  const service = (value: string, overrides: Partial<TrackerGuardFacts> = {}) =>
    platformServiceProblem('SUPABASE_URL', value, facts(overrides));
  const namesIt =
    "SUPABASE_URL: invalid, must not name the tracker's Supabase project (supabase/site.json)";

  it('refuses the tracker’s project however its address is spelled', () => {
    for (const value of [
      `https://${ref}.supabase.co`,
      `https://${ref.toUpperCase()}.supabase.co`,
      `https://%61${ref.slice(1)}.supabase.co`,
      `https://ａ${ref.slice(1)}.supabase.co`,
    ]) {
      expect(service(value), value).toBe(namesIt);
    }
    expect(service('https://otherprojectref1234.supabase.co')).toBeUndefined();
  });

  it('refuses the tracker’s DATABASE_URL', () => {
    const tracker = 'https://made-up.example.test';
    expect(service(tracker, { env: { DATABASE_URL: tracker } })).toBe(
      "SUPABASE_URL: invalid, must not be the tracker's database (DATABASE_URL)",
    );
  });
});

describe('trackerProjectProblem', () => {
  it('refuses staging and production when the tracker’s project could not be read', () => {
    for (const appEnv of ['staging', 'production']) {
      expect(trackerProjectProblem(['A', 'B'], { appEnv, trackerProject: null })).toBe(
        "supabase/site.json: could not be read, so A and B cannot be checked against the tracker's project",
      );
    }
    expect(trackerProjectProblem(['A'], { appEnv: 'local', trackerProject: null })).toBeUndefined();
    expect(trackerProjectProblem(['A'], { appEnv: 'production', trackerProject: ref })).toBe(
      undefined,
    );
    expect(
      trackerProjectProblem(['A'], { appEnv: 'production', trackerProject: undefined }),
    ).toBeUndefined();
  });
});

describe('isIpLiteral', () => {
  it('knows every form of an IP address from a host name', () => {
    for (const host of ['10.0.0.1', '::1', '[::1]', 'fe80::1%eth0', '2130706433', '0x7f.0.0.1']) {
      expect(isIpLiteral(host), host).toBe(true);
    }
    for (const host of ['', 'localhost', 'db.example.test', 'cafe', 'db1', '1.example.test']) {
      expect(isIpLiteral(host), host).toBe(false);
    }
  });
});
