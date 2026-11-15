// Where the web app listens. In local work and tests (APP_ENV local or test) it listens on
// this computer's loopback address only (127.0.0.1), whatever LOCAL_DATA says: on the
// made-up stand-in the app's made-up people sign in by a cookie written in the code, and on
// the made-up database the made-up member signs in with a password written in the code
// (stand-in-ports.ts, standInMember), so no other computer, on the same network or
// anywhere, may reach either (step 2.152). A deployed server (APP_ENV staging or production)
// listens as it is told. Every place that starts the web app's server passes Next.js's
// arguments through withLoopback; tests/web-listen.test.mjs fails on one that does not.

/** The loopback address local work and tests listen on. */
export const loopback = '127.0.0.1';

/**
 * Whether these settings are local work or a test, which listen on the loopback address
 * only. Failing closed: unless APP_ENV plainly names a deployed copy (staging or
 * production), it is. What LOCAL_DATA says does not matter: the made-up database's
 * made-up member has a password written in the code too.
 */
export function listensOnLoopbackOnly(env) {
  return env.APP_ENV !== 'staging' && env.APP_ENV !== 'production';
}

/**
 * Next.js's arguments, with `--hostname 127.0.0.1` added to `dev` and `start` in local work
 * and tests. A hostname given already is dropped there: they never listen anywhere else.
 */
export function withLoopback(args, env) {
  const [command] = args;
  if ((command !== 'dev' && command !== 'start') || !listensOnLoopbackOnly(env)) return [...args];
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
