// Where the web app listens. On its made-up stand-in (local work and tests, APP_ENV local or
// test, with LOCAL_DATA not set to made-up-database) the app's made-up people sign in by a
// cookie written in the code, so it then listens on this computer's loopback address only
// (127.0.0.1): no other computer, on the same network or anywhere, can reach it at all
// (step 2.152). On a database (the made-up one, staging, production) it listens as before.
// Every place that starts the web app's server passes Next.js's arguments through
// withLoopback; tests/web-listen.test.mjs fails on one that does not.

/** The loopback address the made-up stand-in listens on. */
export const loopback = '127.0.0.1';

/**
 * Whether these settings run the app on its made-up stand-in. Read as the app reads them
 * (apps/web/src/server/startup.ts), but failing closed: unless the settings plainly name a
 * hosted copy (APP_ENV staging or production) or the made-up database, it is the stand-in.
 */
export function runsOnStandIn(env) {
  if (env.APP_ENV === 'staging' || env.APP_ENV === 'production') return false;
  return env.LOCAL_DATA !== 'made-up-database';
}

/**
 * Next.js's arguments, with `--hostname 127.0.0.1` added to `dev` and `start` when the app
 * will run on its made-up stand-in. A hostname given already is dropped: the stand-in never
 * listens anywhere else.
 */
export function withLoopback(args, env) {
  const [command] = args;
  if ((command !== 'dev' && command !== 'start') || !runsOnStandIn(env)) return [...args];
  const kept = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--hostname' || arg === '-H') {
      i += 1;
      continue;
    }
    if (arg.startsWith('--hostname=') || arg.startsWith('-H=')) continue;
    kept.push(arg);
  }
  return [...kept, '--hostname', loopback];
}
