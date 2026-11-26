// What every test here starts from: the running throw-away server's two addresses and
// the made-up authority's certificate (the test helper in packages/database), and the
// connections made from them, each encrypted with the certificate checked.
//
// Two made-up leagues are made the way the league-making tool makes one on a hosted
// database: the tables' owner for what only it may do, every command through app_login.
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { planNewLeague } from '@srleagues/core';
import {
  connectPostgresDriver,
  createDatabase,
  makeLeague,
  openLeagueMakingTarget,
  type DatabaseHandle,
  type PostgresDriver,
} from '@srleagues/database';
import { realPostgres } from '../../packages/database/src/real-postgres/real-postgres.test-helper.ts';

// `npm run test:real-postgres` names the folder when it is not the usual one.
export const server = realPostgres(process.env.REAL_POSTGRES_FOLDER || undefined);
export const ca = readFileSync(server.caFile, 'utf8');

/** The app's own database: app_login through a pool, as the web app opens it. */
export const appDatabase = (maxConnections = 4): DatabaseHandle =>
  createDatabase({ kind: 'postgres', url: server.appUrl, ca, maxConnections });

/** The tables' owner through a pool, for what checkLoginRole says of it. */
export const ownerDatabase = (): DatabaseHandle =>
  createDatabase({ kind: 'postgres', url: server.ownerUrl, ca, maxConnections: 1 });

/** One connection as the tables' owner, as a release's migration login. */
export const ownerSession = (): Promise<PostgresDriver> =>
  connectPostgresDriver(server.ownerUrl, { ca });

/** A word no earlier run used: the server may be one already running. */
export const fresh = () => randomBytes(4).toString('hex');

/**
 * A made-up login of its own, made by the tables' owner as a hosted set-up makes the
 * worker's and the website's (T-490, docs/operations/new-test-copy.md): `create role …
 * login`, then a plain grant of `roles`. Returns its address on this server.
 */
export async function makeLogin(
  owner: PostgresDriver,
  name: string,
  roles: readonly string[],
): Promise<string> {
  const password = randomBytes(18).toString('hex');
  await owner.exec(`create role ${name} with login password '${password}'`);
  if (roles.length > 0) await owner.exec(`grant ${roles.join(', ')} to ${name}`);
  const url = new URL(server.appUrl);
  url.username = name;
  url.password = password;
  return url.toString();
}

/** Drops what a made-up login owns, as itself (pg-boss's tables), then the login. */
export async function dropLogin(owner: PostgresDriver, name: string, url: string): Promise<void> {
  const login = await connectPostgresDriver(url, { ca });
  try {
    await login.exec('drop owned by current_user cascade');
  } finally {
    await login.close();
  }
  await owner.exec(`drop role if exists ${name}`);
}

/** Makes a made-up league through the league-making tool's hosted path; returns its id. */
export async function makeMadeUpLeague(word: string): Promise<string> {
  const opened = await openLeagueMakingTarget({
    kind: 'hosted',
    migration: { url: server.ownerUrl, ca },
    app: { url: server.appUrl, ca },
  });
  if (!opened.ok)
    throw new Error(`The league-making tool refused: ${JSON.stringify(opened.problem)}`);
  try {
    const planned = planNewLeague({
      name: `Made-up ${word} League`,
      shortName: `made-up-${word}`,
      sport: 'basketball',
      whoPlays: 'adults',
      city: 'Springfield',
      timeZone: 'America/Chicago',
      contactEmail: `hello-${word}@example.test`,
      ownerEmail: `owner-${word}@example.test`,
      seasonName: 'Fall 2026',
      staffEmail: `staff-${word}@example.test`,
    });
    if (!planned.ok) throw new Error(`The plan was refused: ${JSON.stringify(planned.problems)}`);
    const made = await makeLeague(opened.target, planned.plan);
    if (!made.ok) throw new Error(`No league was made: ${JSON.stringify(made.problem)}`);
    return made.made.leagueId;
  } finally {
    await opened.target.close();
  }
}
