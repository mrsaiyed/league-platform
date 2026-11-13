// T-140: captured, never sent; one email per idempotency key (T-137).
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { EmailMessage } from '@srleagues/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { captureEmail } from './capture-email.ts';

const message: EmailMessage = {
  from: '"North League" <hello@example.test>',
  to: 'player@example.test',
  replyTo: 'contact@example.test',
  subject: 'You are invited',
  html: '<p>Join <a href="http://localhost:3000/accept">here</a></p>',
  text: 'Join: http://localhost:3000/accept',
  idempotencyKey: 'invitation:0190abcd-0000-7000-8000-00000000000f',
};

let folder: string;
beforeAll(async () => {
  folder = await mkdtemp(path.join(tmpdir(), 'captured-email-'));
});
afterAll(async () => {
  await rm(folder, { recursive: true, force: true });
});

describe('captureEmail', () => {
  it('keeps each email for tests to read, with an id and the time', async () => {
    const capture = captureEmail({ now: () => new Date('2026-11-13T10:00:00Z') });
    const sent = await capture.send(message);
    expect(sent.id).toMatch(/^captured-/);
    expect(capture.messages()).toEqual([
      { ...message, id: sent.id, capturedAt: '2026-11-13T10:00:00.000Z' },
    ]);
  });

  it('keeps one email per idempotency key, as the real service sends one', async () => {
    const capture = captureEmail();
    const first = await capture.send(message);
    const again = await capture.send({ ...message, subject: 'Changed' });
    expect(again).toEqual(first);
    expect(capture.messages()).toHaveLength(1);
    await capture.send({ ...message, idempotencyKey: 'another' });
    expect(capture.messages()).toHaveLength(2);
    capture.clear();
    expect(capture.messages()).toEqual([]);
  });

  it('keeps only the newest emails in memory', async () => {
    const capture = captureEmail({ maxKept: 2 });
    for (const key of ['one', 'two', 'three']) {
      await capture.send({ ...message, idempotencyKey: key });
    }
    expect(capture.messages().map((m) => m.idempotencyKey)).toEqual(['two', 'three']);
  });

  it('writes each email to a folder to inspect, named by time and id only', async () => {
    const capture = captureEmail({ directory: path.join(folder, 'new') });
    const { id } = await capture.send(message);
    const files = (await readdir(path.join(folder, 'new'))).sort();
    expect(files).toHaveLength(2);
    for (const file of files) {
      expect(file).toContain(id);
      expect(file).not.toContain('example');
    }
    const json = JSON.parse(await readFile(path.join(folder, 'new', files[1]!), 'utf8'));
    expect(json).toMatchObject({ ...message, id });
    expect(await readFile(path.join(folder, 'new', files[0]!), 'utf8')).toBe(message.html);
  });
});
