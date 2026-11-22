import { t } from '../../server/messages.ts';

/**
 * The test copy's one line (step 2.205, T-13, T-201): every league and person there is made
 * up, so no real person's details belong in it. Drawn only when `shown` (the ports'
 * `testCopy`, APP_ENV staging): above the sign-in forms and on the account pages, where a
 * page that belongs to no league has no footer. A league's pages and the admin's frame say
 * it in their footer instead (SiteFooter). Never on the scoring screen (DESIGN.md §7).
 */
export function TestCopyLine({ shown }: { readonly shown: boolean }) {
  return shown ? (
    <p className="ui-notice" data-test-copy="">
      {t('footer.testCopy')}
    </p>
  ) : null;
}
