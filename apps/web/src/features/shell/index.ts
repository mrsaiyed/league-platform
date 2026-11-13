// The shell's screens (step 1.17): placeholders for pages not built yet, the
// admin's navigation and the notice on a league that is not public.
export { AdminArea } from './admin-area.tsx';
export { AdminNav } from './admin-nav.tsx';
export { LeagueNotice } from './league-notice.tsx';
export { LeagueSitePage } from './league-site-page.tsx';
export { NotBuilt } from './not-built.tsx';

/** What Next.js gives every page and layout under `[league]`. */
export type LeagueRouteProps = { readonly params: Promise<{ readonly league: string }> };
