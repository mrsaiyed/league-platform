'use client';
// One part of Season settings as a form (step 2.47): its fields under their headings, its
// presets where it has them, Save, and the way back. Each answer is the answer to the
// post itself, drawn from what was posted (T-271, record 067), with scripts on in place
// and with scripts off in the page the post answers (the form's permalink):
// - refused: every box holds what was typed, the wrong ones are marked and their sentence
//   is beside them, and why it was not saved is said beside Save;
// - a preset chosen: the game rules' boxes filled from it, nothing saved;
// - a change that moves the standings (S-1, step 2.25): the teams it moves, and the
//   question, before anything is saved; "No, change the rules" gives the boxes back as
//   they were typed.
// - refused because someone else saved the season meanwhile (T-418): the boxes keep what
//   was typed and "Saved now: …" stands beside each box whose saved value differs.
// After a refusal the first marked box has the focus; each refusal is a new line, even one
// that reads as the last (step 2.155 part 4). A save that works sends the browser to the
// season's settings, where "Saved" is said beside the part, once. Every word comes from the
// server, from the message files (T-187).
import {
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import type { SavedNowWords } from '../list-forms/index.ts';
import {
  typedOnly,
  untouched,
  type FormField,
  type FormGroup,
  type PartFormTexts,
  type PartState,
  type TypedFields,
} from './part-form-state.ts';

export type PartFormProps = {
  readonly action: (state: PartState, form: FormData) => Promise<PartState>;
  /** The route's league value, which finds the page again (the gate checks it). */
  readonly league: string;
  readonly seasonId: string;
  readonly part: string;
  /** The season's version as this page read it (A-8): never taken from what was typed. */
  readonly version: number;
  /** This drawing of the form's one-time token (server/same-request.ts). */
  readonly token: string;
  /** The part's values as saved: the boxes before anything is typed. */
  readonly saved: TypedFields;
  readonly groups: readonly FormGroup[];
  /** Where Cancel goes: the season's settings, at this part. */
  readonly back: string;
  /** This page at the part, where the browser lands with scripts off. */
  readonly permalink: string;
  readonly texts: PartFormTexts;
};

/** A form goes quiet once sent: a second tap before the answer sends nothing. */
function useOneSubmit(pending: boolean, answer: unknown) {
  const busy = useRef(false);
  useEffect(() => {
    if (!pending) busy.current = false;
  }, [pending, answer]);
  return (event: FormEvent<HTMLFormElement>) => {
    if (busy.current) event.preventDefault();
    else busy.current = true;
  };
}

export function PartForm(props: PartFormProps) {
  const { action, texts } = props;
  const [state, dispatch, pending] = useActionState(action, untouched, props.permalink);
  const onSubmit = useOneSubmit(pending, state);
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  // A mark that changes with every answer: two refusals that read the same are two lines.
  const [answers, setAnswers] = useState({ state, count: 0 });
  if (answers.state !== state) setAnswers({ state, count: answers.count + 1 });
  // After a refusal the first marked box has the focus, where its sentence is.
  useEffect(() => {
    if (state.kind !== 'refused') return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);
  const common = (step: string) => (
    <>
      <input type="hidden" name="league" value={props.league} />
      <input type="hidden" name="seasonId" value={props.seasonId} />
      <input type="hidden" name="part" value={props.part} />
      <input type="hidden" name="version" value={props.version} />
      <input type="hidden" name="requestToken" value={props.token} />
      <input type="hidden" name="step" value={step} />
    </>
  );

  if (state.kind === 'ask') {
    // What was typed rides along, unchanged, in both answers.
    const typed = Object.entries(typedOnly(state.typed)).filter(([n]) => n !== 'requestToken');
    const carried = typed.map(([name, value]) => (
      <input key={name} type="hidden" name={name} value={value} />
    ));
    return (
      <div className="ui-notice" role="group" aria-labelledby={`${id}-ask`} data-rules-ask="">
        <p id={`${id}-ask`}>{state.heading}</p>
        <ul className="admin-season-moves">
          {state.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p>{state.after}</p>
        <div className="staff-buttons">
          <form action={dispatch} onSubmit={onSubmit}>
            {common('confirm')}
            {carried}
            <button type="submit" className="ui-button" data-kind="main">
              {texts.ask.yes}
            </button>
          </form>
          <form action={dispatch} onSubmit={onSubmit}>
            {common('change')}
            {carried}
            <button type="submit" className="ui-button">
              {texts.ask.no}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const values = state.kind === 'untouched' ? props.saved : state.typed;
  const wrong = state.kind === 'refused' ? state.wrong : [];
  const now = state.kind === 'refused' ? state.savedNow : undefined;
  const shown = { values, wrong, id, saved: props.saved, now };
  const formId = `${id}-form`;
  const problemId = `${id}-problem`;
  // Drawn afresh with each answer, so every box starts from the values it is given.
  const drawing = `${state.kind}:${JSON.stringify(values)}`;
  return (
    <div className="admin-season-edit" key={drawing}>
      {texts.presets === undefined ? null : (
        <form
          action={dispatch}
          onSubmit={onSubmit}
          className="admin-season-presets"
          aria-labelledby={`${id}-presets`}
        >
          {common('preset')}
          <h2 id={`${id}-presets`}>{texts.presets.title}</h2>
          <p className="staff-quiet">{texts.presets.now}</p>
          <p className="staff-quiet">{texts.presets.help}</p>
          <div className="staff-buttons">
            {texts.presets.choices.map((choice) => (
              <button
                key={choice.value}
                type="submit"
                name="preset"
                value={choice.value}
                className="ui-button"
                aria-describedby={`${id}-preset-${choice.value}`}
              >
                {choice.label}
              </button>
            ))}
          </div>
          <ul className="admin-season-preset-list">
            {texts.presets.choices.map((choice) => (
              <li key={choice.value} id={`${id}-preset-${choice.value}`}>
                <strong>{choice.label}:</strong> {choice.about}
              </li>
            ))}
          </ul>
        </form>
      )}
      <form
        ref={formRef}
        id={formId}
        action={dispatch}
        onSubmit={onSubmit}
        className="staff-form admin-season-form"
        noValidate
      >
        {common('save')}
        {props.groups.map((group, n) =>
          group.legend === undefined ? (
            <div key={n} className="admin-season-group">
              <Fields fields={group.fields} {...shown} />
            </div>
          ) : (
            <fieldset key={n} className="admin-season-group">
              <legend>{group.legend}</legend>
              <Fields fields={group.fields} {...shown} />
            </fieldset>
          ),
        )}
        {state.kind === 'enter' && state.said !== undefined ? (
          <p className="ui-notice" role="status" data-filled="">
            {state.said}
          </p>
        ) : null}
        {state.kind === 'refused' ? (
          <p
            key={answers.count}
            id={problemId}
            className="ui-field-error"
            role="alert"
            data-problem="part"
            data-answer={answers.count}
          >
            {state.said}
          </p>
        ) : null}
        <p className="staff-buttons">
          <button
            type="submit"
            className="ui-button"
            data-kind="main"
            {...(state.kind === 'refused' ? { 'aria-describedby': problemId } : {})}
          >
            {texts.save}
          </button>
          <a className="ui-button" href={props.back}>
            {texts.cancel}
          </a>
        </p>
      </form>
    </div>
  );
}

/** The marks of a box that is wrong: its state, and the sentence that says why. */
function marks(name: string, wrong: readonly { field: string }[], id: string) {
  return wrong.some((w) => w.field === name)
    ? { 'aria-invalid': true as const, 'aria-describedby': `${id}-${name}-wrong` }
    : {};
}

function WrongLine({
  name,
  wrong,
  id,
}: {
  readonly name: string;
  readonly wrong: readonly { readonly field: string; readonly said: string }[];
  readonly id: string;
}) {
  const said = wrong.filter((w) => w.field === name).map((w) => w.said);
  if (said.length === 0) return null;
  return (
    <small id={`${id}-${name}-wrong`} className="ui-field-error">
      {said.join(' ')}
    </small>
  );
}

/** "Saved now: …" beside a box whose saved value differs from what was typed (T-418). */
function SavedNow({
  name,
  words,
  shown,
}: {
  readonly name: string;
  readonly words: SavedNowWords | undefined;
  readonly shown: string | undefined;
}) {
  if (words === undefined || shown === undefined) return null;
  return (
    <small className="ui-field-help" data-saved-now={name}>
      {words.label} {shown}
    </small>
  );
}

/** What is saved now in a box, as the form would show it, when it differs from `typed`. */
function savedNowOf(
  field: FormField,
  name: string,
  typed: TypedFields,
  saved: TypedFields,
  words: SavedNowWords | undefined,
): string | undefined {
  if (words === undefined || field.kind === 'note') return undefined;
  const was = saved[name] ?? '';
  if ((typed[name] ?? '') === was) return undefined;
  if (field.kind === 'tick' || field.kind === 'ticks') {
    return was === 'yes' ? (words.ticked ?? words.label) : (words.unticked ?? words.nothing);
  }
  if (field.kind === 'radios' || field.kind === 'select') {
    return field.options.find((option) => option.value === was)?.label ?? words.nothing;
  }
  return was === '' ? words.nothing : was;
}

function Fields({
  fields,
  values,
  wrong,
  id,
  saved,
  now,
}: {
  readonly fields: readonly FormField[];
  readonly values: TypedFields;
  readonly wrong: readonly { readonly field: string; readonly said: string }[];
  readonly id: string;
  readonly saved: TypedFields;
  readonly now: SavedNowWords | undefined;
}) {
  const savedNow = (field: FormField, name: string): ReactNode => (
    <SavedNow name={name} words={now} shown={savedNowOf(field, name, values, saved, now)} />
  );
  return (
    <>
      {fields.map((field) => {
        const key = field.kind === 'note' ? field.text : field.name;
        switch (field.kind) {
          case 'note':
            return (
              <p key={key} className="staff-quiet" data-note="">
                {field.text}
              </p>
            );
          case 'text':
          case 'date':
          case 'number':
            return (
              <label
                key={key}
                className="staff-field"
                data-size={field.kind === 'number' ? 'figure' : undefined}
              >
                <span>{field.label}</span>
                <input
                  type={field.kind === 'date' ? 'date' : 'text'}
                  name={field.name}
                  defaultValue={values[field.name] ?? ''}
                  {...(field.kind === 'text'
                    ? { maxLength: field.maxLength, autoComplete: 'off' }
                    : {})}
                  {...(field.kind === 'number'
                    ? { inputMode: field.parts === true ? 'decimal' : 'numeric' }
                    : {})}
                  {...marks(field.name, wrong, id)}
                />
                {field.help === undefined ? null : (
                  <small className="ui-field-help">{field.help}</small>
                )}
                {savedNow(field, field.name)}
                <WrongLine name={field.name} wrong={wrong} id={id} />
              </label>
            );
          case 'select':
            return (
              <label key={key} className="staff-field">
                <span>{field.label}</span>
                <select
                  name={field.name}
                  defaultValue={values[field.name] ?? ''}
                  {...marks(field.name, wrong, id)}
                >
                  {field.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {savedNow(field, field.name)}
                <WrongLine name={field.name} wrong={wrong} id={id} />
              </label>
            );
          case 'tick':
            return (
              <div key={key} className="admin-season-tick">
                <label className="staff-check">
                  <input
                    type="checkbox"
                    name={field.name}
                    value="yes"
                    defaultChecked={values[field.name] === 'yes'}
                    {...marks(field.name, wrong, id)}
                  />{' '}
                  {field.label}
                </label>
                {field.help === undefined ? null : (
                  <small className="ui-field-help">{field.help}</small>
                )}
                {savedNow(field, field.name)}
                <WrongLine name={field.name} wrong={wrong} id={id} />
              </div>
            );
          case 'radios':
          case 'ticks': {
            const invalid = wrong.some((w) => w.field === field.name);
            return (
              <fieldset
                key={key}
                className="settings-choice"
                {...(invalid ? { 'aria-describedby': `${id}-${field.name}-wrong` } : {})}
                data-wrong={invalid ? '' : undefined}
              >
                <legend>{field.label}</legend>
                {field.help === undefined ? null : <p className="ui-field-help">{field.help}</p>}
                {field.kind === 'radios'
                  ? field.options.map((option) => (
                      <p key={option.value}>
                        <label className="staff-check">
                          <input
                            type="radio"
                            name={field.name}
                            value={option.value}
                            defaultChecked={values[field.name] === option.value}
                            {...(invalid ? { 'aria-invalid': true } : {})}
                          />{' '}
                          {option.label}
                        </label>
                      </p>
                    ))
                  : field.options.map((option) => (
                      <p key={option.name}>
                        <label className="staff-check">
                          <input
                            type="checkbox"
                            name={option.name}
                            value="yes"
                            defaultChecked={values[option.name] === 'yes'}
                            {...(invalid ? { 'aria-invalid': true } : {})}
                          />{' '}
                          {option.label}
                        </label>
                        {savedNow(field, option.name)}
                      </p>
                    ))}
                {field.kind === 'radios' ? savedNow(field, field.name) : null}
                <WrongLine name={field.name} wrong={wrong} id={id} />
              </fieldset>
            );
          }
        }
      })}
    </>
  );
}
