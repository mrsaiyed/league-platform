import { platformUrl } from '@srleagues/core';
import { t, type TextKey } from '../../server/messages.ts';
import type { Shown } from '../../server/releases.ts';

/** The footer's own pages, in its order, with their words. */
const footerLinks = [
  ['terms', 'footer.terms'],
  ['privacy', 'footer.privacy'],
] as const satisfies readonly (readonly [string, TextKey])[];

/** One of the footer's own pages. */
export type FooterPage = (typeof footerLinks)[number][0];

/**
 * The footer's pages this server may draw a link to (step 2.140): only those released, in
 * staging and production; all of them in local work and tests (server/releases.ts).
 */
export const footerPagesOf = (shown: Pick<Shown, 'platformPage'>): readonly FooterPage[] =>
  footerLinks.map(([page]) => page).filter((page) => shown.platformPage(page));

/**
 * The league's name, then terms, privacy and our small mark, on every league's pages,
 * always (U-8). On the app's made-up world on a computer (`madeUp`), one quiet line says
 * the league is made up and starts over (step 2.152); never on a real league. A link is
 * drawn only to a page that may be shown here (`pages`, footerPagesOf; step 2.140): a page
 * not built yet is no page in staging and production, and nothing leads to it.
 */
export function SiteFooter({
  name,
  madeUp = false,
  pages = footerLinks.map(([page]) => page),
}: {
  readonly name?: string | undefined;
  readonly madeUp?: boolean;
  /** The footer's pages to link to; left out, all of them. */
  readonly pages?: readonly FooterPage[];
}) {
  const links = footerLinks.filter(([page]) => pages.includes(page));
  return (
    <footer className="site-footer">
      <div className="site-column">
        {name ? (
          <p className="site-footer-name" dir="auto">
            {name}
          </p>
        ) : null}
        {links.length === 0 ? null : (
          <nav aria-label={t('footer.label')}>
            {links.map(([page, words]) => (
              <a key={page} href={platformUrl(page)}>
                {t(words)}
              </a>
            ))}
          </nav>
        )}
        <small className="powered-by">{t('site.poweredBy')}</small>
        {madeUp ? (
          <small className="site-footer-made-up" data-made-up="">
            {t('footer.madeUp')}
          </small>
        ) : null}
      </div>
    </footer>
  );
}
