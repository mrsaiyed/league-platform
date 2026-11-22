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
import { SavedLine } from '../games-area/saved-line.tsx';
import { useOneSubmit } from '../games-area/use-one-submit.ts';
import type { PrivateDetails } from './people-view.ts';
import { changedBox, wasField, type PersonBox } from './person-input.ts';

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
  /** The tick under an unlikely date of birth shown back before saving (R-28). */
  readonly birthDateChecked: string;
  /** Beside the button when a box is marked: the sentence is up there, by the box. */
  readonly checkMarked: string;
  /** Beside a box this person changed that someone saved meanwhile: holds `{value}`. */
  readonly meanwhile: string;
  /** The same, when someone emptied the box meanwhile. */
  readonly meanwhileEmpty: string;
};

export function PersonForm({
  action,
  permalink,
  hidden,
  values,
  privateDetails,
  today,
  words,
  childNote,
  saved,
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
  /** The league's own today, the latest date of birth the box offers (as the commands). */
  readonly today: string;
  readonly words: PersonFormWords;
  /**
   * Said beside the child-or-adult choice when the record's date of birth makes them an
   * adult but they are marked as a child, who is then treated as a child (R-28).
   */
  readonly childNote?: string | undefined;
  /** "Saved: …" from the last save, said once; it goes as soon as the form is sent again. */
  readonly saved?: string | undefined;
  /** The page's one filled button (DESIGN.md line 22); else outlined. */
  readonly main?: boolean;
}) {
  const [state, dispatch, pending] = useActionState(action, untouched, permalink);
  const onSubmit = useOneSubmit(pending, state);
  const id = useId();
  const refused = state.kind === 'refused' ? state : undefined;
  // Drawn afresh after each refusal and after each save. React resets a form once its
  // action has worked, and a select goes back to the choice it was first drawn with, not
  // the one saved: a second save would then send that old choice (it cleared "An adult"
  // to "Not recorded").
  const drawn = `${JSON.stringify([values, privateDetails ?? null])}:${JSON.stringify(refused?.typed ?? null)}`;
  // What each box holds as stored now; each is posted beside it as what it held when the
  // form was drawn, so the server sends only what this person changed.
  const stored: Partial<Record<PersonBox, string>> = {
    firstName: values.firstName,
    lastName: values.lastName,
    ...(privateDetails === undefined
      ? {}
      : {
          contactEmail: privateDetails.contactEmail,
          birthDate: privateDetails.birthDate,
          child: privateDetails.child,
        }),
  };
  // After a refusal only the boxes this person changed keep what was typed; every other
  // box takes what is stored now (someone else may have saved meanwhile: the page is drawn
  // again as it is now). A box they changed that someone saved meanwhile says so.
  const changed = (name: PersonBox) => refused !== undefined && changedBox(refused.typed, name);
  const typed = (name: PersonBox, now: string): string =>
    changed(name) ? (refused?.typed[name] ?? now) : now;
  const meanwhileOf = (name: PersonBox): string | undefined => {
    const started = refused?.typed[wasField(name)];
    const now = stored[name];
    if (!changed(name) || started === undefined || now === undefined || now === started) {
      return undefined;
    }
    if (now === '') return words.meanwhileEmpty;
    const shown = name === 'child' ? words.childChoices[privateDetails?.child ?? ''] : now;
    return words.meanwhile.replace('{value}', shown);
  };
  const wrong = (name: PersonBox) => refused?.wrong.includes(name) === true;
  const general = refused !== undefined && refused.wrong.length === 0;
  // A refusal about a box is also said beside the button, where the person is looking
  // when they tap it at the foot of the form; the box's own sentence is beside the box.
  const marked = refused !== undefined && refused.wrong.length > 0;
  const box = (name: PersonBox, help?: string) => {
    const errorId = `${id}-${name}-error`;
    const helpId = `${id}-${name}-help`;
    const meanwhileId = `${id}-${name}-meanwhile`;
    const meanwhile = meanwhileOf(name);
    const describedBy = [
      wrong(name) ? errorId : '',
      meanwhile === undefined ? '' : meanwhileId,
      help === undefined ? '' : helpId,
    ]
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
              {name === 'birthDate' && refused?.code === 'birth-date-check'
                ? refused.said
                : words.wrong[name]}
            </small>
          ) : null}
          {meanwhile === undefined ? null : (
            <small id={meanwhileId} className="ui-field-error" data-meanwhile={name}>
              {meanwhile}
            </small>
          )}
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
      {saved === undefined || pending || refused !== undefined ? null : <SavedLine text={saved} />}
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {Object.entries(stored).map(([name, value]) => (
        <input key={`was-${name}`} type="hidden" name={wasField(name as PersonBox)} value={value} />
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
              {childNote === undefined ? null : (
                <small className="ui-field-help" data-child-note="true">
                  {childNote}
                </small>
              )}
            </label>
          </div>
          {refused?.code === 'birth-date-check' ? (
            <p>
              <label className="staff-check">
                <input type="checkbox" name="birthDateChecked" /> {words.birthDateChecked}
              </label>
            </p>
          ) : null}
        </>
      )}
      {general ? (
        <p id={generalId} className="ui-field-error" role="alert">
          {refused.said}
        </p>
      ) : null}
      {marked ? (
        <p id={generalId} className="ui-field-error" role="alert" data-check-marked="true">
          {words.checkMarked}
        </p>
      ) : null}
      <p className="staff-buttons">
        <button
          type="submit"
          className="ui-button"
          {...(main ? { 'data-kind': 'main' } : {})}
          {...(general || marked ? { 'aria-describedby': generalId } : {})}
        >
          {words.submit}
        </button>
      </p>
    </form>
  );
}
