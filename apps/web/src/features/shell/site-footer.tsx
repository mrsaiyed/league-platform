import { platformUrl } from '@srleagues/core';
import { t } from '../../server/messages.ts';

/**
 * The league's name, then terms, privacy and our small mark, on every league's pages,
 * always (U-8).
 */
export function SiteFooter({ name }: { readonly name?: string | undefined }) {
  return (
    <footer className="site-footer">
      <div className="site-column">
        {name ? (
          <p className="site-footer-name" dir="auto">
            {name}
          </p>
        ) : null}
        <nav aria-label={t('footer.label')}>
          <a href={platformUrl('terms')}>{t('footer.terms')}</a>
          <a href={platformUrl('privacy')}>{t('footer.privacy')}</a>
        </nav>
        <small className="powered-by">{t('site.poweredBy')}</small>
      </div>
    </footer>
  );
}
