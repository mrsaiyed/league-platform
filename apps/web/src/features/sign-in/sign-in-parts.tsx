// The pieces every sign-in screen is made of (step 1.14). Words come from the
// message files (T-187); a problem is shown from its name in the address
// (problems.ts), never from anything the person typed.
import { botCheckDidNotLoad, type BotCheckAction, type BotCheckWidget } from '@srleagues/providers';
import type { ReactNode } from 'react';
import { t, type TextKey } from '../../server/messages.ts';
import { problemOf, problems } from '../../server/sign-in/problems.ts';
import { StandalonePage } from '../shell/index.ts';
import { BotCheckBox } from './bot-check-box.tsx';

/** With scripts off, what each form says of its check (record 081, F5). */
const needsScripts = {
  'sign-in': 'signIn.botCheckNeedsScripts.signIn',
  'sign-up': 'signIn.botCheckNeedsScripts.signUp',
  reset: 'signIn.botCheckNeedsScripts.reset',
} as const satisfies Record<BotCheckAction, TextKey>;

/** A wait said in whole minutes, rounded up (record 081): never "900 seconds". */
export const minutesOf = (seconds: number): number => Math.max(1, Math.ceil(seconds / 60));

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
          <p className="ui-refusal" role="alert">
            {problem.name === 'tooManyAttempts'
              ? t.plural('problem.tooManyAttempts', minutesOf(problem.wait), {
                  count: minutesOf(problem.wait),
                })
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
 * field holding its passing answer; Turnstile's is its own box, drawn in explicit mode by
 * a client part (bot-check-box.tsx) each time the form appears, which writes a fresh answer
 * into the form for every try. With scripts off Turnstile cannot run, and the form is
 * refused: the page says so, in each form's own words.
 */
export function BotCheckField({
  widget,
  action,
}: {
  readonly widget: BotCheckWidget;
  readonly action: BotCheckAction;
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
        <p>{t(needsScripts[action])}</p>
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
