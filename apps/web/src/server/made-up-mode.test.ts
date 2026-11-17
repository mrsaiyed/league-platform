// The one test of made-up data (step 2.96), which startup, the stand-in and the local-only
// pages all ask, and the gate built on it (local-tools.ts).
import { describe, expect, it, vi } from 'vitest';
import type { LocalTools } from './local-tools.ts';
import { localToolsOf } from './local-tools.ts';
import { runsOnMadeUpData } from './made-up-mode.ts';
import { standInSignIn } from './stand-in-ports.ts';

const tools: LocalTools = {
  keptEmails: async () => [],
  madeUpPeople: async () => [],
  madeUpSignInOf: () => undefined,
  watchForCode: () => ({ code: async () => undefined, stop: () => {} }),
};

describe('runsOnMadeUpData', () => {
  it('is true for local work and tests only', () => {
    expect(runsOnMadeUpData('local')).toBe(true);
    expect(runsOnMadeUpData('test')).toBe(true);
    for (const other of ['staging', 'production', '', 'Local', 'TEST', ' local', 'development']) {
      expect(runsOnMadeUpData(other)).toBe(false);
    }
  });

  it('is the test the sign-in stand-in refuses by', () => {
    const made = (appEnv: string) => () =>
      standInSignIn({
        appEnv,
        publicBaseUrl: 'http://127.0.0.1:3000',
        log: () => {},
        emailFrom: 'hello@example.test',
      });
    for (const appEnv of ['staging', 'production']) expect(made(appEnv)).toThrow(/local work/);
    for (const appEnv of ['local', 'test']) expect(made(appEnv)).not.toThrow();
  });
});

describe('localToolsOf', () => {
  const publicBaseUrl = 'http://127.0.0.1:3000';
  const here = () => new Headers({ host: '127.0.0.1:3000', 'x-forwarded-for': '127.0.0.1' });

  it('gives nothing in staging and production, without asking for the ports', async () => {
    for (const appEnv of ['staging', 'production', 'anything else']) {
      const ports = vi.fn(async () => ({ localTools: tools }));
      expect(await localToolsOf({ appEnv, publicBaseUrl }, here(), ports)).toBeUndefined();
      expect(ports).not.toHaveBeenCalled();
    }
  });

  it('gives the ports’ tools in local and test, and nothing when the ports carry none', async () => {
    for (const appEnv of ['local', 'test']) {
      const settings = { appEnv, publicBaseUrl };
      expect(await localToolsOf(settings, here(), async () => ({ localTools: tools }))).toBe(tools);
      expect(
        await localToolsOf(settings, here(), async () => ({ localTools: null })),
      ).toBeUndefined();
    }
  });

  // Review of step 2.96, M1: the second lock. Ports that carry the tools but answer every
  // request (as the made-up database's did) still give nothing to a request from another
  // computer, or one passed on by another server, and are not even asked.
  it('gives nothing to a request not made on this computer, whatever the ports carry', async () => {
    const elsewhere = [
      new Headers({ host: '192.168.1.20:3000' }),
      new Headers({ host: 'my-laptop.lan:3000' }),
      new Headers({ host: 'leagues.example.com' }),
      new Headers({ host: '127.0.0.1:3000', 'x-forwarded-for': '192.168.1.30' }),
      new Headers({ host: '127.0.0.1:3000', forwarded: 'for=192.168.1.30' }),
      new Headers({ host: '127.0.0.1:3000', via: '1.1 a-proxy' }),
      new Headers({ host: '127.0.0.1:3000', 'x-forwarded-host': 'leagues.example.com' }),
      new Headers(),
    ];
    for (const appEnv of ['local', 'test']) {
      for (const request of elsewhere) {
        const ports = vi.fn(async () => ({ localTools: tools }));
        expect(
          await localToolsOf({ appEnv, publicBaseUrl }, request, ports),
          `${appEnv} ${[...request].join(' ')}`,
        ).toBeUndefined();
        expect(ports).not.toHaveBeenCalled();
      }
    }
  });
});
