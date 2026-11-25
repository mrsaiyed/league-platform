// startOwnEmailChange (T-73, T-457): nothing changes yet; a code to the new address, a notice
// to the old one, each once; a taken address answers exactly as a free one does.
import { describe, expect, it } from 'vitest';
import { ana, fresh, password, setup } from './own-email-change.test-helper.ts';
import { startOwnEmailChange } from './start-own-email-change.ts';

describe('asking to change the email (T-73)', () => {
  it('sends a code to the new address and a notice to the old one, once each; nothing changes', async () => {
    const env = await setup();
    env.capture.clear();
    const started = await startOwnEmailChange(
      env.context,
      { newEmail: fresh, password },
      env.startDeps,
    );
    expect(started).toEqual({ ok: true, value: { newEmail: fresh } });
    expect(env.capture.messages().map((m) => [m.to, m.purpose, m.code !== null])).toEqual([
      [fresh, 'email-change', true],
    ]);
    expect(env.mails).toEqual([{ kind: 'asked', to: ana, newEmail: fresh }]);
    expect(await env.signsIn(ana)).toBe(true);
    expect(await env.signsIn(fresh)).toBe(false);
  });

  it('answers an address taken at the service, or in our records, exactly as a free one', async () => {
    const free = await setup();
    const atService = await setup();
    const inOurs = await setup();
    inOurs.takenHere.add('cy@example.test');
    const answers = [
      await startOwnEmailChange(
        free.context,
        { newEmail: 'cy@example.test', password },
        free.startDeps,
      ),
      await startOwnEmailChange(
        atService.context,
        { newEmail: 'bo@example.test', password },
        atService.startDeps,
      ),
      await startOwnEmailChange(
        inOurs.context,
        { newEmail: 'cy@example.test', password },
        inOurs.startDeps,
      ),
    ];
    expect(answers[1]).toEqual({ ok: true, value: { newEmail: 'bo@example.test' } });
    expect(answers[2]).toEqual(answers[0]);
    // The old address is told either way; only the free one's mailbox gets a code.
    for (const env of [free, atService, inOurs]) expect(env.mails).toHaveLength(1);
    expect(inOurs.capture.latestCodeFor('cy@example.test')).toBeUndefined();
    expect(atService.capture.messages().at(-1)).toMatchObject({
      to: 'bo@example.test',
      code: null,
    });
  });

  it('a wrong password, the same address, a bad one or no session change nothing and send nothing', async () => {
    const env = await setup();
    env.capture.clear();
    const start = (newEmail: string, typed = password, context = env.context) =>
      startOwnEmailChange(context, { newEmail, password: typed }, env.startDeps);
    expect(await start(fresh, 'not my password')).toEqual({
      ok: false,
      error: { code: 'wrong-password', box: 'password' },
    });
    expect(await start(ana)).toEqual({ ok: false, error: { code: 'same-email', box: 'newEmail' } });
    expect(await start('not an address')).toEqual({
      ok: false,
      error: { code: 'invalid-email', box: 'newEmail' },
    });
    expect(await start(fresh, password, { ...env.context, accountId: undefined })).toEqual({
      ok: false,
      error: { code: 'signed-out', box: null },
    });
    expect(env.capture.messages()).toEqual([]);
    expect(env.mails).toEqual([]);
  });
});
