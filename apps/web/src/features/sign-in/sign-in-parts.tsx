// The pieces every sign-in screen is made of (step 1.14). Words come from the
// message files (T-187); a problem is shown from its name in the address
// (problems.ts), never from anything the person typed.
import type { ReactNode } from 'react';
import { t, type TextKey } from '../../server/messages.ts';
import { problemOf, problems } from '../../server/sign-in/problems.ts';

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
  readonly intro?: string;
  readonly search: Readonly<Record<string, string | string[] | undefined>>;
  readonly children: ReactNode;
}) {
  const problem = problemOf(search);
  return (
    <main className="sign-in">
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

/** Where to go after signing in, carried by the form; the server checks it again. */
export function NextField({ next }: { readonly next: string | null }) {
  return next === null ? null : <input type="hidden" name="next" value={next} />;
}

export function SubmitButton({ words }: { readonly words: TextKey }) {
  return <button type="submit">{t(words)}</button>;
}
