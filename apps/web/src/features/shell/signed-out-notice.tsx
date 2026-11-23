import { t } from '../../server/messages.ts';
import { noticeOf, notices } from '../../server/sign-in/problems.ts';

/**
 * "You are signed out." on the page a person signed out from (R-30, step 2.163), read from
 * the address as it arrived (its `notice`), and said only to someone who is signed out: a
 * person who signs in again and comes back to the same address is not told it. One of the
 * sign-out notices only; anything else in the address is ignored.
 */
export function SignedOutNotice({
  path,
  signedIn,
}: {
  /** The address as it arrived: path and query. */
  readonly path: string;
  readonly signedIn: boolean;
}) {
  if (signedIn) return null;
  const notice = noticeOf(new URL(path, 'http://site.invalid').searchParams);
  if (notice !== 'signedOut' && notice !== 'signedOutEverywhere' && notice !== 'alreadySignedOut') {
    return null;
  }
  return (
    <p className="site-notice" role="status" data-notice="">
      {t(notices[notice])}
    </p>
  );
}
