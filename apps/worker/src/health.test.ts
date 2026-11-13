import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { createHeartbeat, startHealthServer } from './health.ts';

function clock(start = 1_000_000) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe('createHeartbeat', () => {
  it('is down before the first beat', () => {
    const c = clock();
    const hb = createHeartbeat({ queue: 'table', maxAgeMs: 60_000, now: c.now });
    expect(hb.health()).toEqual({
      httpStatus: 503,
      body: { status: 'down', app: 'worker', queue: 'table', secondsSinceBeat: null },
    });
  });

  it('is ok while the last beat is recent and down once it is too old', () => {
    const c = clock();
    const hb = createHeartbeat({ queue: 'pg-boss', maxAgeMs: 60_000, now: c.now });
    hb.beat();
    c.advance(59_999);
    expect(hb.health().httpStatus).toBe(200);
    expect(hb.health().body.secondsSinceBeat).toBe(59);
    c.advance(2);
    expect(hb.health().httpStatus).toBe(503);
    hb.beat();
    expect(hb.health().httpStatus).toBe(200);
  });
});

describe('startHealthServer', () => {
  it('serves /health with the heartbeat and 404s everything else', async () => {
    const c = clock();
    const hb = createHeartbeat({ queue: 'table', maxAgeMs: 60_000, now: c.now });
    const server = await startHealthServer(hb, 0);
    try {
      const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      expect((await fetch(`${base}/health`)).status).toBe(503);
      hb.beat();
      const up = await fetch(`${base}/health`);
      expect(up.status).toBe(200);
      expect(up.headers.get('cache-control')).toBe('no-store');
      expect(await up.json()).toMatchObject({ status: 'ok', app: 'worker' });
      expect((await fetch(`${base}/other`)).status).toBe(404);
      expect((await fetch(`${base}/health`, { method: 'POST' })).status).toBe(404);
      const head = await fetch(`${base}/health`, { method: 'HEAD' });
      expect(head.status).toBe(200);
      expect(head.headers.get('cache-control')).toBe('no-store');
      expect(await head.text()).toBe('');
    } finally {
      await new Promise<void>((done) => server.close(() => done()));
    }
  });
});
