import { describe, expect, it } from 'vitest';
import { commandLogger, createLogger, memorySink } from './logger.ts';
import { redact } from './redact.ts';

const fixedNow = () => Date.UTC(2026, 10, 12, 12, 0, 0);
const parse = (line: string | undefined) => JSON.parse(line ?? '{}') as Record<string, unknown>;

describe('logger', () => {
  it('writes one JSON line with time, level, message and fields', () => {
    const { sink, lines } = memorySink();
    createLogger({ sink, now: fixedNow }).info('hello', { count: 2 });
    expect(lines).toHaveLength(1);
    expect(parse(lines[0])).toEqual({
      time: '2026-11-12T12:00:00.000Z',
      level: 'info',
      msg: 'hello',
      count: 2,
    });
  });

  it('carries the request ID through child loggers', () => {
    const { sink, lines } = memorySink();
    const log = createLogger({ sink, now: fixedNow }).child({ requestId: 'req-1' });
    log.info('a');
    log.child({ leagueId: 'l1' }).warn('b');
    expect(parse(lines[0]).requestId).toBe('req-1');
    expect(parse(lines[1])).toMatchObject({ requestId: 'req-1', leagueId: 'l1', level: 'warn' });
  });

  it('drops lines below the level', () => {
    const { sink, lines } = memorySink();
    const log = createLogger({ sink, level: 'warn' });
    log.debug('x');
    log.info('x');
    log.error('x');
    expect(lines).toHaveLength(1);
  });

  it('does not let fields overwrite time, level or msg', () => {
    const { sink, lines } = memorySink();
    createLogger({ sink, now: fixedNow }).info('real', { level: 'debug', msg: 'fake', time: 'x' });
    expect(parse(lines[0])).toMatchObject({ level: 'info', msg: 'real' });
  });

  it('survives a throwing sink and circular fields', () => {
    const log = createLogger({
      sink: () => {
        throw new Error('disk full');
      },
    });
    expect(() => log.info('x')).not.toThrow();
    const { sink, lines } = memorySink();
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    createLogger({ sink }).info('x', { loop });
    expect(lines).toHaveLength(1);
  });

  it('does not let call fields override bound ones, and falls back to info for an unknown level', () => {
    const { sink, lines } = memorySink();
    const log = createLogger({ sink, level: 'loud' as never }).child({ requestId: 'req-1' });
    log.debug('hidden');
    log.info('shown', { requestId: 'forged' });
    expect(lines).toHaveLength(1);
    expect(parse(lines[0]).requestId).toBe('req-1');
  });

  it('notes unreadable fields but keeps the request ID', () => {
    const { sink, lines } = memorySink();
    const hostile = new Proxy(
      {},
      {
        ownKeys: () => {
          throw new Error('no');
        },
      },
    );
    createLogger({ sink })
      .child({ requestId: 'req-2' })
      .info('x', hostile as never);
    expect(parse(lines[0])).toMatchObject({ requestId: 'req-2', fields: '[unreadable]' });
  });

  it('writes the T-196 command line with ids, timing and outcome', () => {
    const { sink, lines } = memorySink();
    const log = commandLogger(createLogger({ sink, now: fixedNow }));
    log({
      command: 'leagues.create',
      requestId: 'req-9',
      leagueId: '01900000-0000-7000-8000-000000000001',
      accountId: null,
      durationMs: 12,
      outcome: 'refused',
      errorCode: 'name-taken',
    });
    expect(parse(lines[0])).toMatchObject({
      command: 'leagues.create',
      requestId: 'req-9',
      leagueId: '01900000-0000-7000-8000-000000000001',
      accountId: null,
      durationMs: 12,
      outcome: 'refused',
      errorCode: 'name-taken',
    });
  });
});

describe('redaction (T-86)', () => {
  const email = 'jamal.rivera@example.com';
  const token = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcDEF123_-xyz';

  it('strips email, name and token-shaped values from fields and the message', () => {
    const { sink, lines } = memorySink();
    createLogger({ sink }).error(`could not send to ${email}`, {
      email,
      fullName: 'Jamal Rivera',
      note: `contact ${email} please`,
      header: `Bearer ${token}`,
      sessionToken: 'abc',
      secret: 'k1'.repeat(20),
      nested: { player: { firstName: 'Jamal' }, raw: 'a1'.repeat(24) },
    });
    const out = lines[0] ?? '';
    for (const leaked of [email, 'Jamal', 'Rivera', token, 'k1'.repeat(20), 'a1'.repeat(24)]) {
      expect(out).not.toContain(leaked);
    }
    expect(out).toContain('[redacted]');
  });

  it('keeps ids and fixed words', () => {
    const id = '01900000-0000-7000-8000-000000000001';
    expect(
      redact({ leagueId: id, requestId: 'req-1', errorCode: 'too-many', outcome: 'ok' }),
    ).toEqual({ leagueId: id, requestId: 'req-1', errorCode: 'too-many', outcome: 'ok' });
  });

  it('reduces errors to name and scrubbed message, with no stack', () => {
    const out = redact({ err: new Error(`bad ${email}`) }) as { err: Record<string, unknown> };
    expect(out.err).toEqual({ name: 'Error', message: 'bad [redacted]' });
  });
});
