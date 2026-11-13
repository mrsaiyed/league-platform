// The route handler itself: its status, its no-store header, and that it asks the
// app's real start-up (webPorts), not something else.
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const webPorts = vi.fn();
vi.mock('../../../../server/container.ts', () => ({ webPorts }));

const { GET } = await import('./route.ts');
const { proxy } = await import('../../../../proxy.ts');

beforeEach(() => {
  webPorts.mockReset();
});

describe('GET /api/v1/health', () => {
  it('answers 200, ok and no-store once the app has started, and asks webPorts', async () => {
    webPorts.mockResolvedValue({});
    const response = await GET();
    expect(webPorts).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({ status: 'ok', app: 'web' });
  });

  it('answers 503 and down, still no-store, when start-up fails', async () => {
    webPorts.mockRejectedValue(new Error('postgres://app:secret-password@db.internal/league'));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const text = await response.text();
    expect(text).toContain('"down"');
    expect(text).not.toContain('secret-password');
  });

  it('answers 503 when webPorts throws at once instead of rejecting', async () => {
    webPorts.mockImplementation(() => {
      throw new Error('a setting is missing');
    });
    expect((await GET()).status).toBe(503);
  });

  it('is not gated by the proxy: it only passes the request on', () => {
    const response = proxy(new NextRequest('http://localhost:3000/api/v1/health'));
    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(response.headers.get('location')).toBeNull();
  });
});
