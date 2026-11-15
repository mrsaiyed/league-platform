// The tracker's database guard (record 055): the one check the web app, the worker
// and the tool that makes a league (npm run league:make, record 057) all run on a
// database address of the platform's before anything connects. The
// Al-Hadi tracker's Supabase project holds real games, and the platform never uses
// it (T-201). It reads the setting as text only and never opens it.
//
// It reads the address with pg-connection-string, the parser `pg` itself uses, after
// the same change packages/database makes before handing it to `pg` (the ssl settings
// taken out of its query string), so it checks the host, user, database and options
// the connection would really use, however they are spelled: percent-encoded, in
// capitals, as an IPv6 literal. What it refuses:
//
// - the same server, user and database as the tracker's DATABASE_URL;
// - any part, decoded, that names the tracker's Supabase project (supabase/site.json),
//   as the direct host (db.{ref}.supabase.co) and the pooler's user (postgres.{ref}) do;
// - a host, port, user, password, options or database name taken from the query
//   string, where they would win over the address itself;
// - a host or user that is not plain ASCII, which could stand for another spelling;
// - in staging and production, a host that is an IP address, which no name check can
//   tell from the tracker's;
// - in staging and production, where the address is opened, an address that leaves
//   its host, port, user or database to PGHOST, PGPORT, PGUSER or PGDATABASE in the
//   environment, and any PGOPTIONS there: `pg` would take them.
//
// Every refusal names the setting and a fixed reason, never the address or any part.
import { isIP } from 'node:net';
import { parse } from 'pg-connection-string';

/** What the guard checks against, beside the setting itself. */
export type TrackerGuardFacts = {
  /** The whole environment the app runs in: DATABASE_URL and the PG variables are read. */
  readonly env: Readonly<Record<string, string | undefined>>;
  /** APP_ENV as given (staging and production are stricter). */
  readonly appEnv: string | undefined;
  /**
   * True when the address is about to be opened on a hosted database whatever APP_ENV
   * says: the tool that makes a league from this computer (record 057) has no APP_ENV
   * and is as strict as staging and production. Left out, APP_ENV decides.
   */
  readonly hosted?: boolean | undefined;
  /**
   * The tracker's Supabase project reference (trackerProjectOf), null when
   * supabase/site.json could not be read, or undefined to leave that check out (tests
   * of other rules).
   */
  readonly trackerProject: string | null | undefined;
};

/** The query string keys that would decide where `pg` connects (or as whom). */
const placeKeys = new Set([
  'host',
  'hostaddr',
  'port',
  'user',
  'password',
  'options',
  'dbname',
  'database',
  'db',
  'service',
]);

/** What packages/database takes out of the address before `pg` reads it (create-database.ts). */
const sslKeys = ['sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'uselibpqcompat'];

/** The PG variables `pg` reads for a part the address leaves empty. */
const fromEnvironment = [
  ['host', 'PGHOST'],
  ['port', 'PGPORT'],
  ['user', 'PGUSER'],
  ['database', 'PGDATABASE'],
] as const;

type Target = {
  readonly host: string;
  readonly port: string;
  readonly user: string;
  readonly database: string;
  readonly options: string;
  readonly queryKeys: readonly string[];
};

const asciiOnly = /^[\x20-\x7e]*$/;
const blank = (value: string | undefined) => value === undefined || value.trim() === '';

/**
 * The problem with a postgres:// setting of the platform's own (PLATFORM_DATABASE_URL),
 * as one line `NAME: invalid, reason`, or undefined when there is none. A value that
 * is not a postgres:// address at all is left to the settings schema to report.
 */
export function platformDatabaseProblem(
  name: string,
  given: string,
  facts: TrackerGuardFacts,
): string | undefined {
  const value = given.trim();
  if (!/^postgres(?:ql)?:\/\//.test(value)) return undefined;
  const refuse = (reason: string) => `${name}: invalid, ${reason}`;
  const target = targetOf(value);
  if (target === undefined) return refuse('must be a postgres:// address that can be read');

  const tracker = facts.env['DATABASE_URL']?.trim();
  if (tracker !== undefined && tracker !== '') {
    const trackerTarget = /^postgres(?:ql)?:\/\//.test(tracker) ? targetOf(tracker) : undefined;
    if (value === tracker || (trackerTarget !== undefined && samePlace(target, trackerTarget))) {
      return refuse("must not be the tracker's database (DATABASE_URL)");
    }
  }
  const ref = facts.trackerProject;
  if (typeof ref === 'string' && ref !== '') {
    const parts = [value, target.host, target.user, target.database, target.options];
    if (parts.some((part) => namesProject(part, ref))) {
      return refuse("must not name the tracker's Supabase project (supabase/site.json)");
    }
  }
  if (target.queryKeys.some((key) => placeKeys.has(key.toLowerCase()))) {
    return refuse(
      'must not take its host, port, user, password, options or database name from its query string',
    );
  }
  if (!asciiOnly.test(target.host) || !asciiOnly.test(target.user)) {
    return refuse('must have a host and user of plain ASCII characters');
  }
  const byAppEnv = facts.appEnv === 'staging' || facts.appEnv === 'production';
  const hosted = facts.hosted ?? byAppEnv;
  if (hosted && isIpLiteral(target.host)) {
    return refuse(
      byAppEnv
        ? `must name its server by a host name, not an IP address, when APP_ENV is ${facts.appEnv}`
        : 'must name its server by a host name, not an IP address, for a hosted database',
    );
  }
  // Only where the address is opened: local work and tests never open it (T-201).
  if (!hosted) return undefined;
  for (const [part, variable] of fromEnvironment) {
    if (target[part] === '' && !blank(facts.env[variable])) {
      return refuse(`must give its own ${part}: ${variable} is set and would decide it`);
    }
  }
  if (!blank(facts.env['PGOPTIONS'])) {
    return refuse('cannot be checked while PGOPTIONS is set: it would decide the connection');
  }
  return undefined;
}

/**
 * The problem with an http(s) setting of the platform's own that must not be the
 * tracker's (SUPABASE_URL), as one line, or undefined.
 */
export function platformServiceProblem(
  name: string,
  given: string,
  facts: TrackerGuardFacts,
): string | undefined {
  const value = given.trim();
  const tracker = facts.env['DATABASE_URL']?.trim();
  if (tracker !== undefined && tracker !== '' && value === tracker) {
    return `${name}: invalid, must not be the tracker's database (DATABASE_URL)`;
  }
  const ref = facts.trackerProject;
  if (typeof ref !== 'string' || ref === '') return undefined;
  const host = URL.canParse(value) ? new URL(value).hostname : '';
  if (namesProject(value, ref) || namesProject(host, ref)) {
    return `${name}: invalid, must not name the tracker's Supabase project (supabase/site.json)`;
  }
  return undefined;
}

/**
 * The problem when the tracker's project could not be read: staging and production
 * refuse to start, since `names` cannot be checked against it. Undefined otherwise.
 */
export function trackerProjectProblem(
  names: readonly string[],
  facts: Pick<TrackerGuardFacts, 'appEnv' | 'trackerProject' | 'hosted'>,
): string | undefined {
  if (facts.trackerProject !== null) return undefined;
  const hosted = facts.hosted ?? (facts.appEnv === 'staging' || facts.appEnv === 'production');
  if (!hosted) return undefined;
  return `supabase/site.json: could not be read, so ${names.join(' and ')} cannot be checked against the tracker's project`;
}

/** The host names that mean this computer, beside any loopback address. */
const thisComputer = new Set(['localhost', 'localhost.localdomain']);

/**
 * Whether a postgres:// address connects to this computer (localhost, a loopback
 * address, or a local socket folder), read the way `pg` reads it: true, false, or
 * undefined when it cannot be read. A database anywhere else must have its
 * certificate checked.
 */
export function addressOnThisComputer(given: string): boolean | undefined {
  const value = given.trim();
  if (!/^postgres(?:ql)?:\/\//.test(value)) return undefined;
  const target = targetOf(value);
  if (target === undefined) return undefined;
  const host = target.host.replace(/^\[(.*)\]$/, '$1').toLowerCase();
  if (host === '' || host.startsWith('/')) return true;
  if (thisComputer.has(host) || host.endsWith('.localhost')) return true;
  if (isIP(host) === 4) return host.startsWith('127.');
  if (isIP(host) === 6) return host === '::1';
  return false;
}

/** The parts of the address `pg` would use, decoded as `pg` decodes them; undefined if unreadable. */
function targetOf(value: string): Target | undefined {
  try {
    const url = new URL(value);
    for (const key of sslKeys) url.searchParams.delete(key);
    const final = url.toString();
    const config = parse(final);
    return {
      // As decoded, not lower-cased: some characters lower-case into ASCII (the
      // Kelvin sign into k), which would hide them from the ASCII check.
      host: config.host ?? '',
      port: config.port ?? '',
      user: config.user ?? '',
      database: config.database ?? '',
      options: typeof config.options === 'string' ? config.options : '',
      queryKeys: [...new URL(final).searchParams.keys()],
    };
  } catch {
    return undefined;
  }
}

function samePlace(a: Target, b: Target): boolean {
  return (
    a.host.toLowerCase() === b.host.toLowerCase() &&
    (a.port || '5432') === (b.port || '5432') &&
    a.user === b.user &&
    (a.database || a.user) === (b.database || b.user)
  );
}

/** Whether `text` names the project `ref`, read raw, percent-decoded and Unicode-folded. */
function namesProject(text: string, ref: string): boolean {
  const wanted = ref.toLowerCase();
  const decoded = decodeAll(text);
  return [text, decoded, decoded.normalize('NFKC')].some((form) =>
    form.toLowerCase().includes(wanted),
  );
}

/** Percent-decoded until it no longer changes (a few rounds at most); bad escapes kept. */
function decodeAll(text: string): string {
  let current = text;
  for (let round = 0; round < 4; round += 1) {
    let next: string;
    try {
      next = decodeURIComponent(current);
    } catch {
      next = current.replace(/%([0-9a-f]{2})/gi, (_, hex: string) =>
        String.fromCharCode(parseInt(hex, 16)),
      );
    }
    if (next === current) return current;
    current = next;
  }
  return current;
}

/**
 * Whether a host is an IP address in any form the system's resolver takes: IPv4 and
 * IPv6 (brackets and zone included), and the old numeric forms such as 2130706433 or
 * 0x7f.1 that getaddrinfo still reads as an address.
 */
export function isIpLiteral(host: string): boolean {
  const bare = host.replace(/^\[(.*)\]$/, '$1');
  if (bare === '') return false;
  if (isIP(bare) !== 0 || bare.includes(':')) return true;
  return /^(?:0x[0-9a-f]*|[0-9]+)(?:\.(?:0x[0-9a-f]*|[0-9]+)){0,3}\.?$/i.test(bare);
}
