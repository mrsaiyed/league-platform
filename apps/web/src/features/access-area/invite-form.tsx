'use client';
// "Invite someone" on the Admins page (step 2.97, P4 §4) as the answer to a post (T-271,
// record 067): refused, the boxes still hold what was typed, the wrong one is marked and
// the sentence beside it says why; sent, the page is drawn again with "Invitation sent"
// beside the new invitation, once. It goes quiet once sent, and works with no script in the
// page (React's form state then answers in the page the post returns). Words from the server.
import { useActionState, useId } from 'react';
import { untouched, type FormState } from '../games-area/form-state.ts';
import { useOneSubmit } from '../games-area/use-one-submit.ts';

export type InviteFormProps = {
  readonly action: (state: FormState, form: FormData) => Promise<FormState>;
  /** Where the browser lands with scripts off: the form's own place on the page. */
  readonly permalink: string;
  /** League and the form's one-time token. */
  readonly hidden: Readonly<Record<string, string>>;
  readonly roles: readonly { readonly value: string; readonly label: string }[];
  readonly texts: {
    readonly email: string;
    readonly role: string;
    readonly chooseRole: string;
    readonly submit: string;
  };
};

export function InviteForm({ action, permalink, hidden, roles, texts }: InviteFormProps) {
  const [state, dispatch, pending] = useActionState(action, untouched, permalink);
  const onSubmit = useOneSubmit(pending, state);
  const problemId = `${useId()}-problem`;
  const refused = state.kind === 'refused' ? state : undefined;
  const marked = (field: string) =>
    refused?.wrong.includes(field) === true
      ? { 'aria-invalid': true as const, 'aria-describedby': problemId }
      : {};
  return (
    <form action={dispatch} onSubmit={onSubmit} className="staff-form" data-invite-form="">
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <p>
        <label className="staff-field">
          <span>{texts.email}</span>
          <input
            type="email"
            name="email"
            required
            maxLength={320}
            autoComplete="off"
            inputMode="email"
            spellCheck={false}
            defaultValue={refused?.typed['email'] ?? ''}
            {...marked('email')}
          />
        </label>
      </p>
      <p>
        <label className="staff-field">
          <span>{texts.role}</span>
          <select
            // React takes a select's defaultValue only as it is first drawn: drawn afresh
            // with what was picked, it keeps it through the form's reset after the answer.
            key={refused?.typed['role'] ?? ''}
            name="role"
            required
            defaultValue={refused?.typed['role'] ?? ''}
            {...marked('role')}
          >
            <option value="" disabled>
              {texts.chooseRole}
            </option>
            {roles.map((role) => (
              <option key={role.value} value={role.value}>
                {role.label}
              </option>
            ))}
          </select>
        </label>
      </p>
      {refused === undefined ? null : (
        <p id={problemId} className="ui-field-error" role="alert" data-invite-problem="">
          {refused.said}
        </p>
      )}
      <p className="staff-buttons">
        <button type="submit" className="ui-button" data-kind="main">
          {texts.submit}
        </button>
      </p>
    </form>
  );
}
