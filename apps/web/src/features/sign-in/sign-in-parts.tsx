// The pieces every sign-in screen is made of (step 1.14). Words come from the
// message files (T-187); a problem or a notice is shown from its name in the address
// (problems.ts), never from anything the person typed.
import type { ReactNode } from 'react';
import { t, type TextKey } from '../../server/messages.ts';
import {
  noticeOf,
  notices,
  problemOf,
  problems,
  waitInWords,
} from '../../server/sign-in/problems.ts';
import { StandalonePage } from '../shell/index.ts';
import { ShowPassword } from './show-password.tsx';

/** What Next.js gives a page: the address's query. */
export type SearchProps = {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
};

type Search = Readonly<Record<string, string | string[] | undefined>>;

/**
 * "Too many tries" in the words people use (M28): the wait in seconds under a minute,
 * otherwise in minutes; on a screen with "Forgot your password?" (`forgotHint`), with the
 * way in that does not wait.
 */
function tooManyWords(seconds: number, forgotHint: boolean): string {
  const wait = waitInWords(seconds);
  const key = forgotHint
    ? wait.unit === 'seconds'
      ? 'problem.lockedOut'
      : 'problem.lockedOutMinutes'
    : wait.unit === 'seconds'
      ? 'problem.tooManyAttempts'
      : 'problem.tooManyAttemptsMinutes';
  return t.plural(key, wait.count, { count: wait.count });
}

export function SignInScreen({
  title,
  intro,
  search,
  forgotHint = false,
  noticeWords,
  children,
}: {
  readonly title: TextKey;
  readonly intro?: string | undefined;
  readonly search: Search;
  /** The screen offers "Forgot your password?": a lock-out says it gets the person in now. */
  readonly forgotHint?: boolean;
  /** The words of a notice the screen words itself (the code screen names the address). */
  readonly noticeWords?: string | undefined;
  readonly children: ReactNode;
}) {
  const problem = problemOf(search);
  const notice = noticeOf(search);
  const said =
    noticeWords ??
    (notice === undefined || notice === 'codeSentAgain' ? undefined : t(notices[notice]));
  // In the frame of our own pages, on the neutral design, so every field and button is 44
  // high (step 2.127). Their real look is step 2.102's.
  return (
    <StandalonePage>
      <main className="ui-message sign-in">
        <h1>{t(title)}</h1>
        {said === undefined ? null : (
          <p role="status" data-notice="">
            {said}
          </p>
        )}
        {intro === undefined ? null : <p>{intro}</p>}
        {problem === undefined ? null : (
          <p role="alert">
            {problem.name === 'tooManyAttempts'
              ? tooManyWords(problem.wait, forgotHint)
              : t(problems[problem.name])}
          </p>
        )}
        {children}
      </main>
    </StandalonePage>
  );
}

/** `value`: the address to fill in again (one typed before, on this device). */
export function EmailField({ value }: { readonly value?: string | undefined } = {}) {
  return (
    <p>
      <label>
        {t('signIn.email')}
        <input
          name="email"
          type="email"
          autoComplete="email"
          maxLength={254}
          required
          defaultValue={value}
        />
      </label>
    </p>
  );
}

/**
 * `fresh`: a password being chosen, so the browser offers to make one up. Every password
 * field has "Show" beside it (L9), drawn once the page's script runs: with scripts off
 * there is nothing it could do, so it is not drawn.
 */
export function PasswordField({ fresh = false }: { readonly fresh?: boolean }) {
  const id = fresh ? 'new-password' : 'current-password';
  return (
    <p>
      <label htmlFor={id}>{t('signIn.password')}</label>
      <input
        id={id}
        name="password"
        type="password"
        autoComplete={fresh ? 'new-password' : 'current-password'}
        minLength={fresh ? 8 : 1}
        maxLength={1024}
        required
      />
      <ShowPassword field={id} show={t('password.show')} hide={t('password.hide')} />
    </p>
  );
}

/** Where to go after signing in, carried by the form; the server checks it again. */
export function NextField({ next }: { readonly next: string | null }) {
  return next === null ? null : <input type="hidden" name="next" value={next} />;
}

export function SubmitButton({ words }: { readonly words: TextKey }) {
  return <button type="submit">{t(words)}</button>;
}
