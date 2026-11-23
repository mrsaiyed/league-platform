import { t } from '../../server/messages.ts';

/**
 * The league's own notice at the top of every public page (step 2.60, F-10): the admin's
 * words from League settings, drawn as text (never markup), not dismissible. A named
 * note region, so a screen reader can reach it and says whose it is.
 */
export function SiteNotice({ notice }: { readonly notice: string }) {
  return notice === '' ? null : (
    <aside className="site-notice league-own-notice" aria-label={t('shell.leagueNotice')}>
      <p>{notice}</p>
    </aside>
  );
}
