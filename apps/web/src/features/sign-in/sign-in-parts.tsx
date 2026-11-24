// The pieces every sign-in screen is made of (step 1.14). Words come from the
// message files (T-187); a problem or a notice is shown from its name in the address
// (problems.ts), never from anything the person typed.
import { botCheckDidNotLoad, type BotCheckAction, type BotCheckWidget } from '@srleagues/providers';
import type { ReactNode } from 'react';
import { webPorts } from '../../server/container.ts';
import { t, type TextKey } from '../../server/messages.ts';
import {
  noticeOf,
  notices,
  problemOf,
  problems,
  type Problem,
} from '../../server/sign-in/problems.ts';
import { StandalonePage, TestCopyLine } from '../shell/index.ts';
import { BotCheckBox } from './bot-check-box.tsx';
import { FocusRefusal } from './focus-refusal.tsx';
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

/**
 * The "problems" that only ask the person to sign in (a game kept on this device, a game to
 * score): drawn calm, in the main color, not as refused (step 2.102).
 */
const asksToSignIn: Readonly<Record<string, true>> = {
  backToYourGame: true,
  signInToScore: true,
  signInAgain: true,
};

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
  fields = [],
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
  /** The fields this screen draws with their own refusal beside them (fieldRefusal). */
  readonly fields?: readonly SignInField[];
  readonly children: ReactNode;
}) {
  const problem = problemOf(search);
  // A refusal of one field this screen draws sits beside that field, not above the form.
  const field = problem === undefined ? undefined : fieldOfProblem(problem.name);
  const atTop = field === undefined || !fields.includes(field);
  const notice = noticeOf(search);
  const said =
    noticeWords ??
    (notice === undefined || notice === 'codeSentAgain' ? undefined : t(notices[notice]));
  const { testCopy } = await webPorts();
  // In the frame of our own pages, on SR Leagues' own look (step 2.102): the form card, our
  // name as its kicker, a serif title, every field and button 44 high.
  return (
    <StandalonePage>
      <main className="ui-message ui-form-card sign-in">
        <p className="ui-kicker">{t('shell.siteName')}</p>
        <h1>{t(title)}</h1>
        {said === undefined ? null : (
          <p role="status" data-notice="">
            {said}
          </p>
        )}
        {intro === undefined ? null : <p>{intro}</p>}
        {/* Above the form, on the test copy only (step 2.205). */}
        <TestCopyLine shown={testCopy} />
        {problem === undefined || !atTop ? null : (
          <p
            className="ui-refusal"
            role="alert"
            id={formRefusalId}
            tabIndex={-1}
            data-sign-in-problem={problem.name}
            data-ask={problem.name in asksToSignIn ? '' : undefined}
          >
            {problem.name === 'tooManyAttempts'
              ? tooManyWords(problem.wait, forgotHint)
              : t(problemWords(problem.name, google))}
          </p>
        )}
        {children}
        {problem === undefined ? null : <FocusRefusal />}
      </main>
    </StandalonePage>
  );
}

/** The one field a refusal is about, where it is about one (DESIGN.md section 4, line 22). */
export type SignInField = 'email' | 'password' | 'code';
const problemFields: Partial<Record<Problem, SignInField>> = {
  invalidEmail: 'email',
  onlyMadeUpAddresses: 'email',
  codeWrong: 'code',
  codeExpired: 'code',
  passwordTooShort: 'password',
  passwordTooLong: 'password',
  passwordLeaked: 'password',
  wrongPassword: 'password',
};
/**
 * A refusal about the whole form that still names fields (step 2.102's fix round): it sits
 * above the form, and each field it names is marked wrong and points at it. "Wrong email
 * or password" cannot say which one, so it marks both.
 */
const problemMarks: Partial<Record<Problem, readonly SignInField[]>> = {
  wrongEmailOrPassword: ['email', 'password'],
};
/** The id of the refusal drawn above the form. */
const formRefusalId = 'form-refusal';

/** The field `name` is about, or undefined when it is about the whole form. */
export function fieldOfProblem(name: Problem): SignInField | undefined {
  return problemFields[name];
}

/** The refusal of `field` in the address, if the address carries one. */
function refusalOf(search: Search | undefined, field: SignInField) {
  const problem = search === undefined ? undefined : problemOf(search);
  if (problem === undefined || problem.name === 'tooManyAttempts') return undefined;
  return fieldOfProblem(problem.name) === field ? problem.name : undefined;
}

/** Whether the refusal above the form, in the address, names `field`. */
function markedByFormRefusal(search: Search | undefined, field: SignInField): boolean {
  const problem = search === undefined ? undefined : problemOf(search);
  return problem !== undefined && (problemMarks[problem.name]?.includes(field) ?? false);
}

/**
 * A field's own refusal, under its box (step 2.102): the same mark and words the screen
 * drew above the form before, and the field points at it (`aria-describedby`). Every
 * screen whose address can carry such a refusal draws the field it is about. A field a
 * refusal above the form names is marked too, pointing at that refusal.
 */
export function fieldRefusal(search: Search | undefined, field: SignInField) {
  const name = refusalOf(search, field);
  const id = `${field}-refusal`;
  if (name === undefined && markedByFormRefusal(search, field)) {
    return {
      input: { 'aria-invalid': true, 'aria-describedby': formRefusalId },
      refusal: null,
    } as const;
  }
  return {
    input: name === undefined ? {} : { 'aria-invalid': true, 'aria-describedby': id },
    refusal:
      name === undefined ? null : (
        <span className="ui-refusal" role="alert" id={id} data-sign-in-problem={name}>
          {t(problems[name])}
        </span>
      ),
  } as const;
}

/** `value`: the address to fill in again (one typed before, on this device). */
export function EmailField({
  value,
  search,
}: { readonly value?: string | undefined; readonly search?: Search } = {}) {
  const { input, refusal } = fieldRefusal(search, 'email');
  return (
    <p className="ui-field">
      <label>
        {t('signIn.email')}
        <input
          name="email"
          type="email"
          autoComplete="email"
          maxLength={254}
          required
          defaultValue={value}
          {...input}
        />
      </label>
      {refusal}
    </p>
  );
}

/**
 * `fresh`: a password being chosen, so the browser offers to make one up. Every password
 * field has "Show" beside it (L9), drawn once the page's script runs: with scripts off
 * there is nothing it could do, so it is not drawn.
 */
export function PasswordField({
  fresh = false,
  search,
}: {
  readonly fresh?: boolean;
  readonly search?: Search;
}) {
  const id = fresh ? 'new-password' : 'current-password';
  const { input, refusal } = fieldRefusal(search, 'password');
  return (
    <p className="ui-field">
      <label htmlFor={id}>{t('signIn.password')}</label>
      <span className="ui-field-row">
        <input
          id={id}
          name="password"
          type="password"
          autoComplete={fresh ? 'new-password' : 'current-password'}
          minLength={fresh ? 8 : 1}
          maxLength={1024}
          required
          {...input}
        />
        <ShowPassword field={id} show={t('password.show')} hide={t('password.hide')} />
      </span>
      {refusal}
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

/**
 * A form's button: the main one, filled with the main color (the default: one to a form),
 * or `second`, outlined, for another way (Google, a new code). DESIGN.md line 22.
 */
export function SubmitButton({
  words,
  kind = 'main',
}: {
  readonly words: TextKey;
  readonly kind?: 'main' | 'second';
}) {
  return (
    <button className="ui-button" data-kind={kind} type="submit">
      {t(words)}
    </button>
  );
}

/** "or", between two ways in, drawn with a hairline on each side. */
export function OrLine() {
  return <p className="ui-or">{t('signIn.or')}</p>;
}
