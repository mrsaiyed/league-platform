// What the panel "Who can see this season" says (step 2.182, A-18), decided in one place:
// what is true for this season AND this league. A season that is shown is seen by
// visitors only while the league itself is public (live or archived, U-9): in a league not
// published yet, the panel never says that visitors can see it, will see it now, or are
// seeing it, only that they will once the league is published.
import { t } from '../../server/messages.ts';
import type { Visibility } from './season-visibility.ts';

export type PanelFacts = {
  readonly visibility: Visibility;
  /** Whether visitors can see the league at all (live or archived, U-9). */
  readonly leagueShown: boolean;
  readonly seasonName: string;
};

export type PanelWords = {
  /** The season's state, in one line. */
  readonly state: string;
  /** A second line when the league is not public and the season is not shown. */
  readonly leagueNote?: string;
  /** The question before showing. */
  readonly showAsk: string;
  /** The answer once shown. */
  readonly shown: string;
};

export function panelWords(facts: PanelFacts): PanelWords {
  const season = facts.seasonName;
  const state =
    facts.visibility === 'hidden'
      ? t('seasonSettings.visibility.hidden', { season })
      : facts.visibility === 'over'
        ? t('seasonSettings.visibility.over', { season })
        : facts.leagueShown
          ? t('seasonSettings.visibility.shown', { season })
          : t('seasonSettings.visibility.shownLeagueHidden', { season });
  const leagueNote =
    facts.leagueShown || facts.visibility === 'shown'
      ? undefined
      : t('seasonSettings.visibility.leagueHidden');
  return {
    state,
    ...(leagueNote === undefined ? {} : { leagueNote }),
    showAsk: facts.leagueShown
      ? t('seasonSettings.showAsk', { season })
      : t('seasonSettings.showAskLeagueHidden', { season }),
    shown: facts.leagueShown
      ? t('seasonSettings.done.shown', { season })
      : t('seasonSettings.done.shownLeagueHidden', { season }),
  };
}
