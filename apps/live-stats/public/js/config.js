// Which way the pages run. The stats server serves this file as is; the static site
// build (scripts/build-pages.mjs) replaces it with its Supabase project's address and key.
export const config = { mode: 'server' };
