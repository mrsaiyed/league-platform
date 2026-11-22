import { platformUrl } from '@srleagues/core';
import { t } from '../../server/messages.ts';

/**
 * The league's name, then terms, privacy and our small mark, on every league's pages,
 * always (U-8). On the app's made-up world on a computer (`madeUp`), one quiet line says
 * the league is made up and starts over (step 2.152); on the test copy (`testCopy`), the
 * same place says it is a test copy where everyone is made up (step 2.205). Never on a
 * real league.
 */
export function SiteFooter({
  name,
  madeUp = false,
  testCopy = false,
}: {
  readonly name?: string | undefined;
  readonly madeUp?: boolean;
  readonly testCopy?: boolean;
}) {
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
        {testCopy ? (
          <small className="site-footer-made-up" data-test-copy="">
            {t('footer.testCopy')}
          </small>
        ) : madeUp ? (
          <small className="site-footer-made-up" data-made-up="">
            {t('footer.madeUp')}
          </small>
        ) : null}
      </div>
    </footer>
  );
}
