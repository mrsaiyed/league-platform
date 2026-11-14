// The shell's screens (steps 1.17 and 1.18): placeholders for pages not built yet, the
// admin's navigation, the notice on a league that is not public, and the league's
// design, header and footer; and the frame of a page that belongs to no league (step 2.85).
export { AdminArea } from './admin-area.tsx';
export { AdminNav } from './admin-nav.tsx';
export { currentMenuPage, type MenuPage } from './current-menu-page.ts';
export { DesignStyle } from './design-style.tsx';
export { LeagueNotice } from './league-notice.tsx';
export { LeagueSitePage } from './league-site-page.tsx';
export { NotBuilt } from './not-built.tsx';
export { SiteFooter } from './site-footer.tsx';
export { SiteHeader } from './site-header.tsx';
export { StandalonePage } from './standalone-page.tsx';

/** What Next.js gives every page and layout under `[league]`. */
export type LeagueRouteProps = { readonly params: Promise<{ readonly league: string }> };
