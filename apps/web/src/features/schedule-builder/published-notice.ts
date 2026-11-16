// What "published" says after the schedule is published (step 2.182, A-18): what is true
// for this season and this league. "Visitors can see it now." only when visitors can see
// both; a season not shown yet names itself and the way on (Season settings, for whoever
// may show it; whom to ask, for anyone else); a league not published yet says visitors
// cannot see the league. No link to publishing a league yet: that screen is step 2.125's.
import { t } from '../../server/messages.ts';

export type PublishedFacts = {
  /** Whether visitors can see the season (active or completed). */
  readonly seasonShown: boolean;
  /** Whether visitors can see the league at all (live or archived, U-9). */
  readonly leagueShown: boolean;
  readonly seasonName: string;
  /** Whether the person looking may show the season (`season.settings` at its program). */
  readonly mayShow: boolean;
};

export type PublishedNotice = {
  readonly text: string;
  /** What to do so visitors see the season, when it is hidden. */
  readonly next?:
    | { readonly kind: 'link'; readonly text: string }
    | { readonly kind: 'ask'; readonly text: string };
};

export function publishedNotice(facts: PublishedFacts): PublishedNotice {
  const season = facts.seasonName;
  const text = facts.leagueShown
    ? facts.seasonShown
      ? t('schedule.admin.published')
      : t('schedule.admin.publishedSeasonHidden', { season })
    : facts.seasonShown
      ? t('schedule.admin.publishedLeagueHidden')
      : t('schedule.admin.publishedBothHidden', { season });
  if (facts.seasonShown) return { text };
  return facts.mayShow
    ? { text, next: { kind: 'link', text: t('schedule.admin.showInSeasonSettings') } }
    : { text, next: { kind: 'ask', text: t('schedule.admin.askToShow') } };
}
