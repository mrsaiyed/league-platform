// Next.js settings for the web app (record 020).
import type { NextConfig } from 'next';

const config: NextConfig = {
  // Our packages are TypeScript source used through their index.ts; Next.js compiles them.
  transpilePackages: [
    '@srleagues/contracts',
    '@srleagues/core',
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
  // forbidden(): "you do not have access" is answered with status 403 (U-6).
  experimental: { authInterrupts: true },
  poweredByHeader: false,
};

export default config;
