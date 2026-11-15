// One read of the session per request (step 2.127): every page, layout and screen takes
// this request's facts from thisRequestFacts, never reads the session itself; and when that
// read fails, the account button and the refusal screen are drawn as for a visitor.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./container.ts', () => ({ webPorts: async () => ({}) }));
vi.mock('./this-request.ts', () => ({
  thisRequestFacts: async () => {
    throw new Error('The sign-in service did not answer.');
  },
}));

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sources(full);
    return /\.tsx?$/.test(name) && !/\.test(-helper)?\.tsx?$/.test(name) ? [full] : [];
  });
}

describe("this request's facts, read once", () => {
  it('are read by no page, layout or screen but through thisRequestFacts', () => {
    const readers = sources(src)
      .filter((file) => /\brequestFacts\(/.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(src, file).replaceAll('\\', '/'))
      .sort();
    // The API's routes (league-api-route.ts) are requests of their own, with no page.
    expect(readers).toEqual([
      'server/league-api-route.ts',
      'server/request-facts.ts',
      'server/this-request.ts',
    ]);
    const identifying = sources(path.join(src, 'app'))
      .concat(sources(path.join(src, 'features')))
      .filter((file) => /\.identify\(/.test(readFileSync(file, 'utf8')));
    expect(identifying).toEqual([]);
  });

  it('when the session cannot be read, the refusal screen and the button see a visitor', async () => {
    const { signedInEmail } = await import('./load-league-page.ts');
    expect(await signedInEmail()).toBeNull();
  });
});
