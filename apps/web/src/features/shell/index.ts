// The shell's screens (steps 1.17 and 1.18): placeholders for pages not built yet, the
// admin's navigation, the notice on a league that is not public, and the league's
// design, header (with its season picker) and footer; the frame of a page that belongs to no
// league, and the two "not found" screens (step 2.85); the Terms and Privacy note until
// the lawyer's versions exist (step 2.135).
export {
  accountMenuOf,
  isAdminPage,
  isScoringPage,
  signInHrefFrom,
  waitingQuestionWords,
  type AccountMenu,
} from './account-menu.ts';
export { currentMenuPage, type MenuPage } from './current-menu-page.ts';
export { DesignStyle, displayStylesheet, displayStylesheetMark } from './design-style.tsx';
export { headerSeason, type HeaderSeason } from './header-season.ts';
export { LeagueNotice } from './league-notice.tsx';
export { LegalNote, legalNoteHref, type LegalPage } from './legal-note.tsx';
export { membershipsInWords, MyLeaguesList } from './my-leagues-list.tsx';
export { LeagueSitePage } from './league-site-page.tsx';
export { NotBuilt } from './not-built.tsx';
export { LeagueNotFound, PlatformNotFound } from './not-found-screens.tsx';
export { DocumentShown, RefusalFresh } from './refusal-fresh.tsx';
export { RefusalPage } from './refusal-page.tsx';
export { refusalScreenOf, type RefusalScreen } from './refusal-screen.ts';
export { SignedOutNotice } from './signed-out-notice.tsx';
export { SiteFooter } from './site-footer.tsx';
export { AccountButton, MyTeamEntry, SignOutFields, SiteHeader } from './site-header.tsx';
export { StandalonePage } from './standalone-page.tsx';
export { TestCopyLine } from './test-copy-line.tsx';

/** What Next.js gives every page and layout under `[league]`. */
export type LeagueRouteProps = { readonly params: Promise<{ readonly league: string }> };
