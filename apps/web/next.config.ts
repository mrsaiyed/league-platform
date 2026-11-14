// Next.js settings for the web app (record 020).
import type { NextConfig } from 'next';

// Sent with every answer (record 020): no page may be put in another site's frame
// (against tricking a click), the browser keeps to the type we say, other sites are
// told only our origin when a link is followed, and the browser features we do not
// use are switched off.
const everyAnswer = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  },
];

const config: NextConfig = {
  // Our packages are TypeScript source used through their index.ts; Next.js compiles them.
  transpilePackages: [
    '@srleagues/contracts',
    '@srleagues/core',
    '@srleagues/emails',
    '@srleagues/observability',
    '@srleagues/providers',
    '@srleagues/site',
    '@srleagues/sports',
    '@srleagues/ui',
  ],
  // Database drivers run as they are on the server, never bundled. The database
  // package itself is loaded at run time, not bundled (container.ts).
  serverExternalPackages: ['pg', 'pg-boss', 'kysely', '@electric-sql/pglite'],
  // The gate type-checks everything with the repository's own TypeScript (npm run
  // typecheck). Next.js's own check needs TypeScript's older JavaScript interface,
  // which TypeScript 7 does not have, so it is not run twice here.
  typescript: { ignoreBuildErrors: true },
  experimental: {
    // forbidden(): "you do not have access" is answered with status 403 (U-6).
    authInterrupts: true,
    // The largest form a server action reads. Next.js's own default is 1 MB, which would
    // refuse a fixtures file between our import limit (maxReportBytes, 800 KB) and 1 MB
    // with its own error page before our "file too large" notice could be shown. A little
    // above our limit, so our notice always shows, and still small.
    serverActions: { bodySizeLimit: '2mb' },
  },
  poweredByHeader: false,
  headers: async () => [
    { source: '/:path*', headers: everyAnswer },
    // An invitation's address holds its secret: it is never passed on (record 023).
    // Later rules win for the same header.
    {
      source: '/:league/invitation/:rest*',
      headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }],
    },
    // Google's return address holds its one-time code (step 1.14).
    {
      source: '/signin/google',
      headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }],
    },
  ],
};

export default config;
