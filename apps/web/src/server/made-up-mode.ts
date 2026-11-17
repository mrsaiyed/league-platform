// The one test of whether the web app runs on made-up data (T-201): APP_ENV local or
// test. startup.ts asks it to choose the made-up stand-in over a database, the stand-in
// asks it again before it is made (standInSignIn), and the local-only pages ask it before
// anything else (local-only.ts, step 2.96). One function, so the pages can never be on in
// a mode the stand-in is not. It is decided from the server's own settings, never from
// anything a request carries.

/** Whether APP_ENV is one that runs on made-up data only: local work or a test. */
export function runsOnMadeUpData(appEnv: string): boolean {
  return appEnv === 'local' || appEnv === 'test';
}
