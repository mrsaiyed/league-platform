// The invitation email end to end (step 1.19 part 2, T-226, record 014): invite,
// the job it records, the email the job sends (captured, T-140) with a working link,
// and accepting with that link. On the in-memory stand-in for one league, with the
// real commands, the real address helper, the real template and words, and the
// capture adapter.
import {
  acceptInvitation,
  afterFailure,
  cancelInvitation,
  EmailSendError,
  hashInvitationToken,
  invite,
  maxJobAttempts,
  type EmailMessage,
  type EmailSender,
  type Job,
  type QueuedJob,
} from '@srleagues/core';
import { captureEmail } from '@srleagues/providers';
import { describe, expect, it } from 'vitest';
import { BadJobDataError, sendInvitationEmail } from './invitation-email-job.ts';
import { jobHandlers } from './job-handlers.ts';
import { leagueId, memoryLeague, ownerId, strangerId } from './memory-league.test-helper.ts';

const siteOrigin = 'https://leagues.example.test';
const sendingAddress = 'leagues@mail.example.test';
const linkShape =
  /https:\/\/leagues\.example\.test\/north-league\/invitation\/([A-Za-z0-9_-]{43})(?=\s|"|<|$)/;

/** A league with someone invited, the job that recorded, and a worker to run it. */
async function invited(email: EmailSender = captureEmail()) {
  const made = memoryLeague();
  const result = await invite(
    made.as(ownerId),
    { email: 'new.helper@example.test', role: 'editor' },
    made.deps,
  );
  if (!result.ok) throw new Error('not invited');
  const handler = jobHandlers({ transaction: made.transaction, email, siteOrigin, sendingAddress })[
    'email.send'
  ];
  if (handler === undefined) throw new Error('no email.send handler');
  const [recorded] = made.db.jobs;
  if (recorded === undefined) throw new Error('no job recorded');
  let attempt = 0;
  /** Runs the recorded job, as the queue would: the same id on every attempt. */
  const run = () => handler(queued(recorded, ++attempt));
  return { ...made, invitationId: result.value.invitationId, recorded, run };
}

function queued(job: Job, attempt: number): QueuedJob {
  return { id: '01900000-0000-7000-8000-0000000000f1', ...job, attempt };
}

function tokenIn(message: EmailMessage): string {
  const fromText = linkShape.exec(message.text)?.[1];
  const fromHtml = linkShape.exec(message.html)?.[1];
  if (fromText === undefined || fromText !== fromHtml) throw new Error('no link in the email');
  return fromText;
}

describe('the invitation email job', () => {
  it('sends the invited person a working link, which accepts the invitation', async () => {
    const email = captureEmail();
    const { db, deps, as, invitationId, recorded, run } = await invited(email);

    // The job holds the invitation's id and nothing else (T-131).
    expect(recorded).toEqual({ type: 'email.send', leagueId, ids: { invitationId } });
    expect(JSON.stringify(db.jobs)).not.toContain('example.test');

    await run();
    const [message, ...others] = email.messages();
    expect(others).toEqual([]);
    if (message === undefined) throw new Error('no email');
    expect(message).toMatchObject({
      to: 'new.helper@example.test',
      from: `"North \\"Made-up\\" League" <${sendingAddress}>`,
      subject: 'You are invited to help run North "Made-up" League',
    });
    expect(message.text).toContain(
      'You have been invited to help run North "Made-up" League as Editor.',
    );
    expect(message.text).toContain('Powered by SR Leagues');
    expect(message.html).toContain('North &quot;Made-up&quot; League');

    // The job ran for the league with no account set (T-226).
    expect(db.opened.at(-1)).toMatchObject({ leagueId, accountId: null });

    const token = tokenIn(message);
    expect(await acceptInvitation(as(strangerId), { token }, deps)).toMatchObject({ ok: true });
    expect(db.state.grants).toMatchObject([
      { accountId: strangerId, role: 'editor', grantedByAccountId: ownerId, revokedAt: null },
    ]);
    // Accepted, so running the job again sends nothing.
    await run();
    expect(email.messages()).toHaveLength(1);
  });

  it('commits the new link before handing the email over (record 014)', async () => {
    let made: Awaited<ReturnType<typeof invited>> | undefined;
    const seen: { open: number; storedHash: string | undefined; linkHash: string }[] = [];
    const watching: EmailSender = {
      send: async (message) => {
        if (made === undefined) throw new Error('not ready');
        seen.push({
          open: made.db.open,
          storedHash: made.db.state.invitations[0]?.tokenHash,
          linkHash: await hashInvitationToken(tokenIn(message)),
        });
        return { id: 'sent-1' };
      },
    };
    made = await invited(watching);
    await made.run();
    expect(seen).toHaveLength(1);
    expect(seen[0]?.open).toBe(0);
    expect(seen[0]?.storedHash).toBe(seen[0]?.linkHash);
  });

  it('sends a new link when run again; the first stops working (T-137, record 014)', async () => {
    const email = captureEmail();
    const { deps, as, run } = await invited(email);
    await run();
    await run();
    const [first, second] = email.messages();
    if (first === undefined || second === undefined) throw new Error('expected two emails');
    // Two links, two emails: the service must not drop the second as a repeat.
    expect(first.idempotencyKey).not.toBe(second.idempotencyKey);
    expect(tokenIn(first)).not.toBe(tokenIn(second));

    expect(await acceptInvitation(as(strangerId), { token: tokenIn(first) }, deps)).toMatchObject({
      error: { code: 'invitation-not-found' },
    });
    expect(await acceptInvitation(as(strangerId), { token: tokenIn(second) }, deps)).toMatchObject({
      ok: true,
    });
  });

  it('sends nothing, quietly, for a cancelled invitation', async () => {
    const email = captureEmail();
    const { db, deps, as, invitationId, run } = await invited(email);
    expect(await cancelInvitation(as(ownerId), { invitationId }, deps)).toMatchObject({
      ok: true,
    });
    const hash = db.state.invitations[0]?.tokenHash;
    await expect(run()).resolves.toBeUndefined();
    expect(email.messages()).toEqual([]);
    expect(db.state.invitations[0]?.tokenHash).toBe(hash);
  });

  it('sends nothing for an expired invitation, or in a league closed to new people', async () => {
    for (const change of [
      (s: ReturnType<typeof memoryLeague>['db']['state']) => {
        const stored = s.invitations[0];
        if (stored !== undefined) stored.expired = true;
      },
      (s: ReturnType<typeof memoryLeague>['db']['state']) => {
        if (s.league !== undefined) s.league = { ...s.league, status: 'archived' };
      },
      (s: ReturnType<typeof memoryLeague>['db']['state']) => {
        s.league = undefined;
      },
    ]) {
      const email = captureEmail();
      const { db, run } = await invited(email);
      change(db.state);
      await expect(run()).resolves.toBeUndefined();
      expect(email.messages()).toEqual([]);
    }
  });

  it('keeps the link it stored when the email service fails, and the retry sends a new one', async () => {
    const email = captureEmail();
    let failNext = true;
    const flaky: EmailSender = {
      send: async (message) => {
        if (failNext) {
          failNext = false;
          throw new EmailSendError('unavailable', true, 503);
        }
        return email.send(message);
      },
    };
    const { db, deps, as, run } = await invited(flaky);
    const before = db.state.invitations[0]?.tokenHash;

    const thrown = await run().then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(thrown).toBeInstanceOf(EmailSendError);
    // The queue keeps a fixed code, and tries again later.
    expect(afterFailure(thrown, 1, maxJobAttempts)).toEqual({
      outcome: 'retry',
      inSeconds: 120,
      errorCode: 'unavailable',
    });
    // The link was committed before the send failed (and was never emailed).
    expect(db.state.invitations[0]?.tokenHash).not.toBe(before);

    await run();
    const [message] = email.messages();
    if (message === undefined) throw new Error('no email on the retry');
    expect(await acceptInvitation(as(strangerId), { token: tokenIn(message) }, deps)).toMatchObject(
      { ok: true },
    );
  });

  it('never lets the link reach what the queue keeps of a failure (T-86)', async () => {
    let link = '';
    const leaky: EmailSender = {
      send: async (message) => {
        link = message.text;
        throw new Error(`could not send ${message.text} to ${message.to}`);
      },
    };
    const { run } = await invited(leaky);
    const thrown = await run().then(
      () => undefined,
      (error: unknown) => error,
    );
    const kept = JSON.stringify(afterFailure(thrown, 1, maxJobAttempts));
    expect(link).toMatch(linkShape);
    expect(kept).toBe('{"outcome":"retry","inSeconds":120,"errorCode":"unexpected"}');
  });

  it('fails at once a job with no invitation id', async () => {
    const made = memoryLeague();
    const handler = sendInvitationEmail({
      transaction: made.transaction,
      email: captureEmail(),
      siteOrigin,
      sendingAddress,
    });
    for (const ids of [{}, { invitationId: 'not-a-uuid' }]) {
      const thrown = await handler(queued({ type: 'email.send', leagueId, ids }, 1)).then(
        () => undefined,
        (error: unknown) => error,
      );
      expect(thrown).toBeInstanceOf(BadJobDataError);
      expect(afterFailure(thrown, 1, maxJobAttempts)).toEqual({
        outcome: 'failed',
        errorCode: 'bad_job_data',
      });
    }
    expect(made.db.opened).toEqual([]);
  });
});
