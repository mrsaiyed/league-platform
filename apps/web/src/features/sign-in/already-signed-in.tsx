// `/signin` and `/signup` for someone who is signed in already (step 2.163; the using-it
// audit, L10): it says so and who they are, with the one way on they came for (the page
// to come back to, or their account) and a way to sign out and use another account,
// which comes back to the sign-in screen saying "You are signed out." Signing out here is
// the same as anywhere: it also clears the games the tracker kept on this device (T-115).
// Plain links and a plain form, so it works with scripts off.
import { platformUrl } from '@srleagues/core';
import { t } from '../../server/messages.ts';
import { signOutAction } from '../../server/sign-in/actions.ts';
import { screenUrl } from '../../server/sign-in/problems.ts';
import { StandalonePage, waitingQuestionWords } from '../shell/index.ts';
import { SignOutForm } from '../tracker/index.ts';

export function AlreadySignedIn({
  email,
  next,
}: {
  /** The address the sign-in service holds for the session. */
  readonly email: string;
  /** The page to come back to, already checked (safeReturnPath), or null. */
  readonly next: string | null;
}) {
  return (
    <StandalonePage>
      <main className="ui-message sign-in">
        <h1>{t('signIn.already.title')}</h1>
        <p>{t('signIn.already.body', { email })}</p>
        <a className="ui-button" data-kind="main" href={next ?? platformUrl('account')}>
          {t(next === null ? 'signIn.already.account' : 'signIn.already.carryOn')}
        </a>
        <SignOutForm action={signOutAction} waitingQuestion={waitingQuestionWords()}>
          <input type="hidden" name="next" value={screenUrl('signin', { next })} />
          <button className="ui-button" data-kind="quiet" type="submit">
            {t('signIn.already.switch')}
          </button>
        </SignOutForm>
      </main>
    </StandalonePage>
  );
}
