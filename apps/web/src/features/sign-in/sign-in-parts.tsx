// The pieces every sign-in screen is made of (step 1.14). Words come from the
// message files (T-187); a problem is shown from its name in the address
// (problems.ts), never from anything the person typed.
import type { BotCheckAction, BotCheckWidget } from '@srleagues/providers';
import type { ReactNode } from 'react';
import { t, type TextKey } from '../../server/messages.ts';
import { problemOf, problems } from '../../server/sign-in/problems.ts';
import { StandalonePage } from '../shell/index.ts';

/** What Next.js gives a page: the address's query. */
export type SearchProps = {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
};

export function SignInScreen({
  title,
  intro,
  search,
  children,
}: {
  readonly title: TextKey;
  readonly intro?: string | undefined;
  readonly search: Readonly<Record<string, string | string[] | undefined>>;
  readonly children: ReactNode;
}) {
  const problem = problemOf(search);
  // In the frame of our own pages, on the neutral design, so every field and button is 44
  // high (step 2.127). Their real look is step 2.102's.
  return (
    <StandalonePage>
      <main className="ui-message sign-in">
        <h1>{t(title)}</h1>
        {intro === undefined ? null : <p>{intro}</p>}
        {problem === undefined ? null : (
          <p role="alert">
            {problem.name === 'tooManyAttempts'
              ? t.plural('problem.tooManyAttempts', problem.wait, { count: problem.wait })
              : t(problems[problem.name])}
          </p>
        )}
        {children}
      </main>
    </StandalonePage>
  );
}

export function EmailField() {
  return (
    <p>
      <label>
        {t('signIn.email')}
        <input name="email" type="email" autoComplete="email" maxLength={254} required />
      </label>
    </p>
  );
}

/** `fresh`: a password being chosen, so the browser offers to make one up. */
export function PasswordField({ fresh = false }: { readonly fresh?: boolean }) {
  return (
    <p>
      <label>
        {t('signIn.password')}
        <input
          name="password"
          type="password"
          autoComplete={fresh ? 'new-password' : 'current-password'}
          minLength={fresh ? 8 : 1}
          maxLength={1024}
          required
        />
      </label>
    </p>
  );
}

/**
 * The bot check's widget, inside its form (T4 §6, record 081). The stand-in's is a hidden
 * field holding its passing answer; Turnstile's is its own box, which its script (from its
 * own origin, carrying this answer's nonce) fills, and which writes its answer into the
 * form. With scripts off Turnstile cannot run, and the form is refused: the page says so.
 */
export function BotCheckField({
  widget,
  action,
  nonce,
}: {
  readonly widget: BotCheckWidget;
  readonly action: BotCheckAction;
  readonly nonce?: string | undefined;
}) {
  // Switched off (staging without Turnstile's keys, T-270): nothing is drawn or asked.
  if (widget.kind === 'off') return null;
  if (widget.kind === 'stand-in') {
    return <input type="hidden" name={widget.field} value={widget.passingAnswer} />;
  }
  return (
    <>
      <script src={widget.scriptUrl} async defer nonce={nonce} />
      <div
        className="cf-turnstile"
        data-sitekey={widget.siteKey}
        data-action={action}
        data-response-field-name={widget.field}
      />
      <noscript>
        <p>{t('signIn.botCheckNeedsScripts')}</p>
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
