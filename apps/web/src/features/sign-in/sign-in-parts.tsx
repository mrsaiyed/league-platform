// The pieces every sign-in screen is made of (step 1.14). Words come from the
// message files (T-187); a problem or a notice is shown from its name in the address
// (problems.ts), never from anything the person typed.
import { botCheckDidNotLoad, type BotCheckAction, type BotCheckWidget } from '@srleagues/providers';
import type { ReactNode } from 'react';
import { webPorts } from '../../server/container.ts';
import { t, type TextKey } from '../../server/messages.ts';
import { noticeOf, notices, problemOf, problems } from '../../server/sign-in/problems.ts';
import { StandalonePage, TestCopyLine } from '../shell/index.ts';
import { BotCheckBox } from './bot-check-box.tsx';
import { ShowPassword } from './show-password.tsx';

/**
 * With scripts off, what each form says of its check (record 081, F5): on a screen that
 * draws "Continue with Google", and on one that does not (M27). The forgotten-password
 * screen never draws it.
 */
const needsScripts = {
  'sign-in': {
    google: 'signIn.botCheckNeedsScripts.signIn',
    noGoogle: 'signIn.botCheckNeedsScripts.signInNoGoogle',
  },
  'sign-up': {
    google: 'signIn.botCheckNeedsScripts.signUp',
    noGoogle: 'signIn.botCheckNeedsScripts.signUpNoGoogle',
  },
  reset: {
    google: 'signIn.botCheckNeedsScripts.reset',
    noGoogle: 'signIn.botCheckNeedsScripts.reset',
  },
} as const satisfies Record<BotCheckAction, { google: TextKey; noGoogle: TextKey }>;

/** The scripts-off words of `action`'s form; Google's only where `google` is drawn (M27). */
export function needsScriptsWords(action: BotCheckAction, google: boolean): TextKey {
  return needsScripts[action][google ? 'google' : 'noGoogle'];
}

/** The refusals that offer "Continue with Google", in their words for a screen without it. */
const withoutGoogle: Partial<Record<keyof typeof problems, TextKey>> = {
  botCheckDidNotLoad: 'problem.botCheckDidNotLoadNoGoogle',
  botCheckFailed: 'problem.botCheckFailedNoGoogle',
};

/**
 * A problem's words on a screen that draws "Continue with Google" (`google`) or not (M27):
 * Google is offered only where its button really is (it is off unless GOOGLE_SIGN_IN is
 * set, the test copy never offers it, and the code and forgotten-password screens never
 * draw it).
 */
export function problemWords(name: keyof typeof problems, google: boolean): TextKey {
  return (google ? undefined : withoutGoogle[name]) ?? problems[name];
}

/** A wait said in whole minutes, rounded up (record 081): never "900 seconds". */
export const minutesOf = (seconds: number): number => Math.max(1, Math.ceil(seconds / 60));

/** What Next.js gives a page: the address's query. */
export type SearchProps = {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
};

type Search = Readonly<Record<string, string | string[] | undefined>>;

/**
 * "Too many tries" in the words people use (M28): the wait in whole minutes (record 081);
 * on a screen with "Forgot your password?" (`forgotHint`), with the way in that does not
 * wait.
 */
function tooManyWords(seconds: number, forgotHint: boolean): string {
  const count = minutesOf(seconds);
  return t.plural(forgotHint ? 'problem.lockedOut' : 'problem.tooManyAttempts', count, { count });
}

export async function SignInScreen({
  title,
  intro,
  search,
  forgotHint = false,
  google = false,
  noticeWords,
  children,
}: {
  readonly title: TextKey;
  readonly intro?: string | undefined;
  readonly search: Search;
  /** The screen offers "Forgot your password?": a lock-out says it gets the person in now. */
  readonly forgotHint?: boolean;
  /** The screen draws "Continue with Google": only then may a refusal offer it (M27). */
  readonly google?: boolean;
  /** The words of a notice the screen words itself (the code screen names the address). */
  readonly noticeWords?: string | undefined;
  readonly children: ReactNode;
}) {
  const problem = problemOf(search);
  const notice = noticeOf(search);
  const said =
    noticeWords ??
    (notice === undefined || notice === 'codeSentAgain' ? undefined : t(notices[notice]));
  const { testCopy } = await webPorts();
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
        {/* Above the form, on the test copy only (step 2.205). */}
        <TestCopyLine shown={testCopy} />
        {problem === undefined ? null : (
          <p className="ui-refusal" role="alert">
            {problem.name === 'tooManyAttempts'
              ? tooManyWords(problem.wait, forgotHint)
              : t(problemWords(problem.name, google))}
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

/**
 * The bot check's widget, inside its form (T4 §6, record 081). The stand-in's is a hidden
 * field holding its passing answer; Turnstile's is its own box, drawn in explicit mode by
 * a client part (bot-check-box.tsx) each time the form appears, which writes a fresh answer
 * into the form for every try. With scripts off Turnstile cannot run, and the form is
 * refused: the page says so, in each form's own words.
 */
export function BotCheckField({
  widget,
  action,
  google = false,
}: {
  readonly widget: BotCheckWidget;
  readonly action: BotCheckAction;
  /** The screen draws "Continue with Google" (M27). */
  readonly google?: boolean;
}) {
  // Switched off (staging without Turnstile's keys, T-270): nothing is drawn or asked.
  if (widget.kind === 'off') return null;
  if (widget.kind === 'stand-in') {
    return <input type="hidden" name={widget.field} value={widget.passingAnswer} />;
  }
  return (
    <>
      <BotCheckBox
        siteKey={widget.siteKey}
        action={action}
        field={widget.field}
        scriptUrl={widget.scriptUrl}
        didNotLoad={botCheckDidNotLoad}
        waiting={t('signIn.botCheckWaiting')}
      />
      <noscript>
        <p>{t(needsScriptsWords(action, google))}</p>
      </noscript>
    </>
  );
}

/** Where to go after signing in, carried by the form; the server checks it again. */
export function NextField({ next }: { readonly next: string | null }) {
  return next === null ? null : <input type="hidden" name="next" value={next} />;
}

export function SubmitButton({ words }: { readonly words: TextKey }) {
  return <button type="submit">{t(words)}</button>;
}
