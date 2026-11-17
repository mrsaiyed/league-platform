// The shell's screens (steps 1.17 and 1.18): placeholders for pages not built yet, the
// admin's navigation, the notice on a league that is not public, and the league's
// design, header (with its season picker) and footer; the frame of a page that belongs to no
// league, and the two "not found" screens (step 2.85).
export {
  accountMenuOf,
  isScoringPage,
  signInHrefFrom,
  waitingQuestionWords,
  type AccountMenu,
} from './account-menu.ts';
export { currentMenuPage, type MenuPage } from './current-menu-page.ts';
export { DesignStyle, displayStylesheet, displayStylesheetMark } from './design-style.tsx';
export { headerSeason, type HeaderSeason } from './header-season.ts';
export { LeagueNotice } from './league-notice.tsx';
export { membershipsInWords, MyLeaguesList } from './my-leagues-list.tsx';
export { LeagueSitePage } from './league-site-page.tsx';
export { NotBuilt } from './not-built.tsx';
export { LeagueNotFound, PlatformNotFound } from './not-found-screens.tsx';
export { SiteFooter } from './site-footer.tsx';
export { AccountButton, SiteHeader } from './site-header.tsx';
export { StandalonePage } from './standalone-page.tsx';

/** What Next.js gives every page and layout under `[league]`. */
export type LeagueRouteProps = { readonly params: Promise<{ readonly league: string }> };
