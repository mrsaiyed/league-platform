import { platformUrl } from '@srleagues/core';
import { t } from '../../server/messages.ts';

/** Terms, privacy and our small mark, on every league's pages, always (U-8). */
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-column">
        <nav aria-label={t('footer.label')}>
          <a href={platformUrl('terms')}>{t('footer.terms')}</a>
          <a href={platformUrl('privacy')}>{t('footer.privacy')}</a>
        </nav>
        <small className="powered-by">{t('site.poweredBy')}</small>
      </div>
    </footer>
  );
}
