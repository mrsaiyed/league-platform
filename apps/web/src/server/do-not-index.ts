// "Do not index" outside production (step 2.93's last part, record 081): before the first
// online test copy is opened to anyone, every page of it tells search engines to leave it
// out, three ways. Every answer carries the header `X-Robots-Tag: noindex` (the proxy sets
// it on everything it sees, pages, API answers and error pages alike; next.config.ts on
// the few files the proxy never sees, in every mode, as they are files and never pages);
// every page carries the same mark in its own head (`<meta name="robots">`, the root
// layout); and `/robots.txt` asks every robot to keep out of the whole site.
//
// Production answers none of the three: what production lets search engines show (a
// youth league's pages above all, T4 §4) is step 2.60's to build. Failing closed: if the
// app's settings cannot be read, the copy is taken for one that is not production.
import { getConfig } from './config.ts';

/** The header every answer outside production carries, and its value. */
export const doNotIndexHeader = { name: 'X-Robots-Tag', value: 'noindex' } as const;

/** What `/robots.txt` says outside production: every robot, nowhere. */
export const keepOutRobots = 'User-agent: *\nDisallow: /\n';

/** Whether a copy in this APP_ENV is marked "do not index": every one but production. */
export function marksDoNotIndex(appEnv: string | undefined): boolean {
  return appEnv !== 'production';
}

/** Whether this server's answers are marked "do not index" (its own settings). */
export function doNotIndex(): boolean {
  try {
    return marksDoNotIndex(getConfig().APP_ENV);
  } catch {
    // Settings that cannot be read are no production's.
    return true;
  }
}
