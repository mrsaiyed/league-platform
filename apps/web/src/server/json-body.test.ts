import { describe, expect, it } from 'vitest';
import { jsonBody, maxBodyBytes } from './json-body.ts';

const post = (body: BodyInit | null, headers: Record<string, string>) =>
  new Request('http://localhost:3000/api/v1/x', { method: 'POST', body, headers });

describe('jsonBody', () => {
  it('reads a body declared as JSON, with or without a charset', async () => {
    for (const type of ['application/json', 'Application/JSON; charset=utf-8']) {
      expect(await jsonBody(post('{"type":"open"}', { 'content-type': type }))).toEqual({
        type: 'open',
      });
    }
  });

  it('is no body unless it is declared as JSON', async () => {
    for (const headers of [
      {},
      { 'content-type': 'text/plain' },
      { 'content-type': 'application/x-www-form-urlencoded' },
      { 'content-type': 'application/jsonx' },
    ]) {
      expect(await jsonBody(post('{"type":"open"}', headers))).toBeUndefined();
    }
  });

  it('is no body when it is not JSON', async () => {
    expect(await jsonBody(post('{not json', { 'content-type': 'application/json' }))).toBe(
      undefined,
    );
    expect(await jsonBody(post(null, { 'content-type': 'application/json' }))).toBeUndefined();
  });

  it('measures the limit in bytes, not characters', async () => {
    // Each "é" is one character and two bytes: under the limit in characters, over it in bytes.
    const text = JSON.stringify('é'.repeat(maxBodyBytes / 2));
    expect(text.length).toBeLessThan(maxBodyBytes + 10);
    expect(new TextEncoder().encode(text).byteLength).toBeGreaterThan(maxBodyBytes);
    expect(await jsonBody(post(text, { 'content-type': 'application/json' }))).toBeUndefined();
    // Just within the limit in bytes is read.
    const within = JSON.stringify('a'.repeat(maxBodyBytes - 2));
    expect(await jsonBody(post(within, { 'content-type': 'application/json' }))).toBe(
      'a'.repeat(maxBodyBytes - 2),
    );
  });

  it('is no body when its declared length is over the limit', async () => {
    const request = post('{}', {
      'content-type': 'application/json',
      'content-length': String(maxBodyBytes + 1),
    });
    expect(await jsonBody(request)).toBeUndefined();
  });

  it('is no body when its bytes are not UTF-8', async () => {
    const bytes = new Uint8Array([0x22, 0xff, 0x22]);
    expect(await jsonBody(post(bytes, { 'content-type': 'application/json' }))).toBeUndefined();
  });
});
