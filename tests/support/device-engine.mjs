// The engine as the scorer's device runs it: live.ts with its types stripped, exactly as
// apps/live-stats/server.ts serves /js/engine.js and scripts/build-pages.mjs writes it.
// Tests run the same commands through this copy and through the server's (live.ts as
// imported) to show both give the same game.
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';

export async function deviceEngine() {
  const source = await readFile(
    new URL('../../packages/sports/src/basketball/live.ts', import.meta.url),
    'utf8',
  );
  const js = stripTypeScriptTypes(source);
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
}

/** Apply `commands` one second apart, from a new game under `rules`, with one engine. */
export function replay(engine, rules, commands) {
  let s = engine.newGame(rules, 0);
  commands.forEach((c, i) => (s = engine.apply(s, c, { id: `c${i}`, now: 1_000 * (i + 1) })));
  return s;
}
