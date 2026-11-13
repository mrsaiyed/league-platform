// T-30 and T-60 at startup: the stand-in for local work, and the login check that
// stops staging and production on a database role that could see past the fence.
import { describe, expect, it, vi } from 'vitest';
import type { DatabaseHandle } from '@srleagues/database';
import { loadConfig } from './config-schema.ts';
import { startWebApp, type StartupDeps } from './startup.ts';

const env = {
  PUBLIC_BASE_URL: 'http://localhost:3000',
  DATABASE_URL: 'postgres://app:made-up-password@localhost:5432/league_local',
  SESSION_SECRET: 'made-up-session-secret-0123456789abcdef',
  SUPABASE_URL: 'http://localhost:54321',
  SUPABASE_SECRET_KEY: 'made-up-supabase-key',
  RESEND_API_KEY: 'made-up-resend-key',
  EMAIL_FROM: 'hello@example.test',
  STRIPE_SECRET_KEY: 'made-up-stripe-key',
  STRIPE_WEBHOOK_SECRET: 'made-up-webhook-key',
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
  const database = vi.fn(async () => ({ createDatabase, checkLoginRole }));
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
      expect(d.createDatabase).toHaveBeenCalledWith({ kind: 'postgres', url: env.DATABASE_URL });
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
