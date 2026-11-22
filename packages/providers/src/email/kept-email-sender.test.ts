import type { EmailMessage } from '@srleagues/core';
import { describe, expect, it } from 'vitest';
import { captureEmail } from './capture-email.ts';
import { keptEmailSender, type EmailKept, type NotKeptKind } from './kept-email-sender.ts';

const message = (to: string): EmailMessage => ({
  from: 'SR Leagues <hello@example.test>',
  to,
  subject: 'Your sign-up code',
  html: '<p>Your code is 482913.</p>',
  text: 'Your code is 482913.',
  idempotencyKey: `key-${to}`,
});

function wired(keep: (email: EmailKept) => Promise<void> = async () => {}) {
  const capture = captureEmail();
  const kept: EmailKept[] = [];
  const told: NotKeptKind[] = [];
  const sender = keptEmailSender({
    appEnv: 'staging',
    sender: capture,
    keep: async (email) => {
      await keep(email);
      kept.push(email);
    },
    failureOf: (error) => ((error as { code?: string }).code === '23514' ? 'refused' : 'fault'),
    onNotKept: (kind) => told.push(kind),
  });
  return { capture, kept, told, sender };
}

describe('keptEmailSender', () => {
  it('refuses to be made outside staging: production writes nothing', () => {
    for (const appEnv of ['production', 'local', 'test'] as const) {
      expect(() =>
        keptEmailSender({
          appEnv,
          sender: captureEmail(),
          keep: () => Promise.reject(new Error('never')),
          failureOf: () => 'fault',
          onNotKept: () => {},
        }),
      ).toThrow(/only the test copy/);
    }
  });

  it('captures every email and keeps one to a made-up address', async () => {
    const { capture, kept, told, sender } = wired();
    await sender.send(message('new.owner@example.test'));
    expect(capture.messages()).toHaveLength(1);
    expect(kept).toEqual([
      { to: 'new.owner@example.test', subject: 'Your sign-up code', text: 'Your code is 482913.' },
    ]);
    expect(told).toEqual([]);
  });

  it('does not keep an address that is not made up, and says so by its kind only', async () => {
    const { capture, kept, told, sender } = wired();
    await sender.send(message('person@gmail.com'));
    expect(capture.messages()).toHaveLength(1);
    expect(kept).toEqual([]);
    expect(told).toEqual(['not-made-up']);
  });

  it('a failed keep never fails the email, and is told by its kind', async () => {
    const { capture, told, sender } = wired(() =>
      Promise.reject(Object.assign(new Error('new.owner@example.test 482913'), { code: '08006' })),
    );
    const sent = await sender.send(message('new.owner@example.test'));
    expect(sent.id).toMatch(/^captured-/);
    expect(capture.messages()).toHaveLength(1);
    expect(told).toEqual(['fault']);
  });
});
