// T-30 and T-60 at startup: the stand-in for local work, and the login check that
// stops staging and production on a database role that could see past the fence.
import { describe, expect, it, vi } from 'vitest';
import type { DatabaseHandle } from '@srleagues/database';
import { loadConfig } from './config-schema.ts';
import { startWebApp, type DatabasePackage, type StartupDeps } from './startup.ts';

const env = {
  PUBLIC_BASE_URL: 'http://localhost:3000',
  PLATFORM_DATABASE_URL: 'postgres://app:made-up-password@localhost:5432/league_local',
  SUPABASE_URL: 'https://made-up-project.supabase.example.test',
  SUPABASE_SECRET_KEY: 'made-up-supabase-key',
  RESEND_API_KEY: 'made-up-resend-key',
  EMAIL_FROM: 'hello@example.test',
  // Required in staging and production (config-schema.ts).
  TRUSTED_PROXY: 'one',
};
const configFor = (appEnv: string) => loadConfig({ ...env, APP_ENV: appEnv });

function deps(problems: string[] | Error) {
  const close = vi.fn(async () => {});
  const db = { close } as unknown as DatabaseHandle;
  const createDatabase = vi.fn((_source: { kind: 'postgres'; url: string }) => db);
  const checkLoginRole = vi.fn(async (_db: DatabaseHandle) => {
    if (problems instanceof Error) throw problems;
    return problems;
  });
  // Only these two are reached in staging and production today.
  const database = vi.fn(
    async () => ({ createDatabase, checkLoginRole }) as unknown as DatabasePackage,
  );
  const given: StartupDeps = { database, log: () => {} };
  return { given, database, createDatabase, checkLoginRole, close };
}

describe('startWebApp', () => {
  it('runs local work and tests on the stand-in, with no database', async () => {
    for (const appEnv of ['local', 'test']) {
      const d = deps([]);
      const ports = await startWebApp(configFor(appEnv), d.given);
      expect(await ports.findLeague('north-valley')).toMatchObject({ slug: 'north-valley' });
      expect(d.database).not.toHaveBeenCalled();
    }
  });

  it('runs on the made-up database with LOCAL_DATA=made-up-database (record 055)', async () => {
    const config = loadConfig({ ...env, APP_ENV: 'test', LOCAL_DATA: 'made-up-database' });
    const database = vi.fn(() => import('@srleagues/database'));
    const ports = await startWebApp(config, { database, log: () => {} });
    expect(database).toHaveBeenCalledOnce();
    expect(await ports.findLeague('lakeside')).toMatchObject({ slug: 'lakeside' });
    expect(await ports.findLeague('north-valley')).toBeUndefined();
    // The made-up member signs in on the sign-in stand-in, as on the stand-in.
    const signedIn = await ports.signIn.signIn({
      email: 'member@example.test',
      password: 'made-up member password',
      device: {
        deviceId: 'made-up-device-0000000001',
        label: 'made-up',
        networkAddress: '127.0.0.1',
      },
    });
    if (!signedIn.ok)
      throw new Error(`the made-up member could not sign in: ${signedIn.error.code}`);
    // Who they are is one of the database's own accounts, not the stand-in's user id.
    const who = await ports.identify(signedIn.value.session.accessToken);
    const service = await ports.signIn.identify({
      accessToken: signedIn.value.session.accessToken,
    });
    expect(who.ok && service.ok && who.value.accountId !== service.value.accountId).toBe(true);
  }, 120_000);

  it('refuses the made-up database too for a site address that is not local', async () => {
    const d = deps([]);
    const config = loadConfig({
      ...env,
      APP_ENV: 'local',
      LOCAL_DATA: 'made-up-database',
      PUBLIC_BASE_URL: 'https://leagues.example.com',
    });
    await expect(startWebApp(config, d.given)).rejects.toThrow(/PUBLIC_BASE_URL/);
    expect(d.database).not.toHaveBeenCalled();
  });

  it('refuses the stand-in for a site address that is not local or a test name', async () => {
    const d = deps([]);
    const config = loadConfig({
      ...env,
      APP_ENV: 'local',
      PUBLIC_BASE_URL: 'https://leagues.example.com',
    });
    await expect(startWebApp(config, d.given)).rejects.toThrow(/PUBLIC_BASE_URL/);
    expect(d.database).not.toHaveBeenCalled();
  });

  it('checks the login role first in staging and production, and stops on a problem (T-60)', async () => {
    for (const appEnv of ['staging', 'production']) {
      const d = deps(['it is a superuser', 'it bypasses row-level security']);
      await expect(startWebApp(configFor(appEnv), d.given)).rejects.toThrow(
        'The web app cannot start: the database login role is not fit for the app (T-60): ' +
          'it is a superuser; it bypasses row-level security.',
      );
      expect(d.createDatabase).toHaveBeenCalledWith({
        kind: 'postgres',
        url: env.PLATFORM_DATABASE_URL,
      });
      expect(d.checkLoginRole).toHaveBeenCalledOnce();
      expect(d.close).toHaveBeenCalledOnce();
    }
  });

  it('stops without repeating the driver message when the database cannot be reached', async () => {
    const d = deps(new Error('connect failed for postgres://app:made-up-password@db'));
    const failure = await startWebApp(configFor('staging'), d.given).catch((e: unknown) => e);
    expect(String(failure)).toMatch(/could not be reached/);
    expect(String(failure)).not.toMatch(/made-up-password/);
    expect(d.close).toHaveBeenCalledOnce();
  });

  it('stops with a plain reason after a good check, until real sign-in is wired', async () => {
    const d = deps([]);
    await expect(startWebApp(configFor('production'), d.given)).rejects.toThrow(
      /sign-in on the real service is not wired yet/,
    );
    expect(d.checkLoginRole).toHaveBeenCalledOnce();
  });
});
