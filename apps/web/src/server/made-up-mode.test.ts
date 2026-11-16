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
  newestCodeFor: async () => undefined,
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
  it('gives nothing in staging and production, without asking for the ports', async () => {
    for (const appEnv of ['staging', 'production', 'anything else']) {
      const ports = vi.fn(async () => ({ localTools: tools }));
      expect(await localToolsOf(appEnv, ports)).toBeUndefined();
      expect(ports).not.toHaveBeenCalled();
    }
  });

  it('gives the ports’ tools in local and test, and nothing when the ports carry none', async () => {
    for (const appEnv of ['local', 'test']) {
      expect(await localToolsOf(appEnv, async () => ({ localTools: tools }))).toBe(tools);
      expect(await localToolsOf(appEnv, async () => ({ localTools: null }))).toBeUndefined();
    }
  });
});
