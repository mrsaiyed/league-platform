'use client';
// A person's form on the People screens (step 2.50): adding someone, and fixing their
// details on their own page. A refusal is the answer to the post itself, drawn from what
// was posted (T-271, record 067): every box still holds what was typed, a wrong box is
// marked (`aria-invalid`) and its sentence stands beneath it, and a refusal that is not
// about one box is said above the button. With scripts off the browser lands on the form
// (its permalink). It goes quiet once sent. Words come from the server, from the message
// files (T-187).
//
// The private details (a contact email, a date of birth, a child or an adult) are boxes
// only when the server gave them (`privateDetails`): for a role that may not see them the
// form has no such boxes, posts none, and the page's data holds none (R-16).
//
// The browser's own checking is off (`noValidate`), as on the box score grid: the server
// tells what is wrong, in words beside the box, with scripts on or off.
import { useActionState, useId } from 'react';
import { untouched, type FormState } from '../games-area/form-state.ts';
import { useOneSubmit } from '../games-area/use-one-submit.ts';
import type { PrivateDetails } from './people-view.ts';
import type { PersonBox } from './person-input.ts';

export type PersonFormWords = {
  readonly firstName: string;
  readonly lastName: string;
  readonly privateTitle: string;
  readonly privateBody: string;
  readonly email: string;
  readonly emailHelp: string;
  readonly birthDate: string;
  readonly birthDateHelp: string;
  readonly child: string;
  readonly childHelp: string;
  readonly childChoices: Readonly<Record<'' | 'child' | 'adult', string>>;
  /** Each box's sentence when it is wrong. */
  readonly wrong: Readonly<Record<PersonBox, string>>;
  readonly submit: string;
};

export function PersonForm({
  action,
  permalink,
  hidden,
  values,
  privateDetails,
  today,
  words,
  main = false,
}: {
  readonly action: (state: FormState, form: FormData) => Promise<FormState>;
  /** Where the browser lands with scripts off: the form's place on its page. */
  readonly permalink: string;
  /** The form's hidden values: league, the person and their version, its one-time token. */
  readonly hidden: Readonly<Record<string, string>>;
  readonly values: { readonly firstName: string; readonly lastName: string };
  /** The private details as stored, only for a role that may see them; else undefined. */
  readonly privateDetails: PrivateDetails | undefined;
  /** The league's today, the latest date of birth the box offers. */
  readonly today: string;
  readonly words: PersonFormWords;
  /** The page's one filled button (DESIGN.md line 22); else outlined. */
  readonly main?: boolean;
}) {
  const [state, dispatch, pending] = useActionState(action, untouched, permalink);
  const onSubmit = useOneSubmit(pending, state);
  const id = useId();
  const refused = state.kind === 'refused' ? state : undefined;
  // Drawn afresh after each refusal, so every box shows what was posted.
  const drawn = refused === undefined ? 'stored' : JSON.stringify(refused.typed);
  const typed = (name: string, stored: string): string => refused?.typed[name] ?? stored;
  const wrong = (name: PersonBox) => refused?.wrong.includes(name) === true;
  const general = refused !== undefined && refused.wrong.length === 0;
  const box = (name: PersonBox, help?: string) => {
    const errorId = `${id}-${name}-error`;
    const helpId = `${id}-${name}-help`;
    const describedBy = [wrong(name) ? errorId : '', help === undefined ? '' : helpId]
      .filter((part) => part !== '')
      .join(' ');
    return {
      control: {
        id: `${id}-${name}`,
        name,
        ...(describedBy === '' ? {} : { 'aria-describedby': describedBy }),
        ...(wrong(name) ? { 'aria-invalid': true } : {}),
      },
      after: (
        <>
          {wrong(name) ? (
            <small id={errorId} className="ui-field-error" role="alert" data-wrong={name}>
              {words.wrong[name]}
            </small>
          ) : null}
          {help === undefined ? null : (
            <small id={helpId} className="ui-field-help">
              {help}
            </small>
          )}
        </>
      ),
    };
  };
  const firstName = box('firstName');
  const lastName = box('lastName');
  const email = box('contactEmail', words.emailHelp);
  const birthDate = box('birthDate', words.birthDateHelp);
  const child = box('child', words.childHelp);
  const generalId = `${id}-refused`;
  return (
    <form action={dispatch} onSubmit={onSubmit} className="staff-form" noValidate key={drawn}>
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <div className="staff-fields">
        <label className="staff-field">
          <span>{words.firstName}</span>
          <input
            {...firstName.control}
            type="text"
            required
            maxLength={100}
            autoComplete="off"
            defaultValue={typed('firstName', values.firstName)}
          />
          {firstName.after}
        </label>
        <label className="staff-field">
          <span>{words.lastName}</span>
          <input
            {...lastName.control}
            type="text"
            required
            maxLength={100}
            autoComplete="off"
            defaultValue={typed('lastName', values.lastName)}
          />
          {lastName.after}
        </label>
      </div>
      {privateDetails === undefined ? null : (
        <>
          <h3>{words.privateTitle}</h3>
          <p className="staff-quiet">{words.privateBody}</p>
          <label className="staff-field">
            <span>{words.email}</span>
            <input
              {...email.control}
              type="email"
              maxLength={320}
              autoComplete="off"
              defaultValue={typed('contactEmail', privateDetails.contactEmail)}
            />
            {email.after}
          </label>
          <div className="staff-fields">
            <label className="staff-field">
              <span>{words.birthDate}</span>
              <input
                {...birthDate.control}
                type="date"
                min="1900-01-01"
                max={today}
                defaultValue={typed('birthDate', privateDetails.birthDate)}
              />
              {birthDate.after}
            </label>
            <label className="staff-field">
              <span>{words.child}</span>
              <select {...child.control} defaultValue={typed('child', privateDetails.child)}>
                {(['', 'child', 'adult'] as const).map((choice) => (
                  <option key={choice} value={choice}>
                    {words.childChoices[choice]}
                  </option>
                ))}
              </select>
              {child.after}
            </label>
          </div>
        </>
      )}
      {general ? (
        <p id={generalId} className="ui-field-error" role="alert">
          {refused.said}
        </p>
      ) : null}
      <p className="staff-buttons">
        <button
          type="submit"
          className="ui-button"
          {...(main ? { 'data-kind': 'main' } : {})}
          {...(general ? { 'aria-describedby': generalId } : {})}
        >
          {words.submit}
        </button>
      </p>
    </form>
  );
}
