'use client';
// One form of the divisions and venues screens (step 2.49): its hidden values, its fields
// (each label above its box, help quiet beneath), at most one "Yes, …" tick that a removal
// needs before it runs, and its one button. It goes quiet once sent. A refusal is said in
// the response to the post itself (T-271, record 067): every box is drawn again with what
// was typed, the wrong one is marked and the sentence stands beside it (or beside the
// button when no box is wrong). With scripts off React's form state does the same in the
// page that answers the post, at the form's own place (`permalink`). Every word comes from
// the server, from the message files (T-187).
import { useActionState, useEffect, useId, useRef, type ReactNode } from 'react';
import { untouched, type FormState, type TypedFields } from './form-state.ts';
import { useOneSubmit } from './use-one-submit.ts';

export type ListField =
  | {
      readonly kind: 'text' | 'url';
      readonly name: string;
      readonly label: string;
      readonly value: string;
      readonly required?: boolean;
      readonly maxLength?: number;
      readonly help?: string;
    }
  | {
      /** A whole number (step 2.56: an adjustment's wins or points), typed with the keypad. */
      readonly kind: 'number';
      readonly name: string;
      readonly label: string;
      readonly value: string;
      readonly help?: string;
    }
  | {
      /** One of a short list (step 2.56: the team an adjustment is for). */
      readonly kind: 'select';
      readonly name: string;
      readonly label: string;
      readonly value: string;
      readonly options: readonly { readonly value: string; readonly label: string }[];
      readonly help?: string;
      /** False where one of the options is "none" (a team with no division); true when left out. */
      readonly required?: boolean;
    }
  | {
      /** A color, and the choice to use the league's own (checked when there is none). */
      readonly kind: 'color';
      readonly name: string;
      readonly label: string;
      /** #rrggbb, or null for the league's own colors. */
      readonly value: string | null;
      readonly ownName: string;
      readonly ownLabel: string;
    };

export type ListFormProps = {
  readonly action: (state: FormState, form: FormData) => Promise<FormState>;
  /** Where the browser lands with scripts off: the thing's place on the screen. */
  readonly permalink: string;
  readonly hidden: Readonly<Record<string, string>>;
  readonly fields?: readonly ListField[];
  /** The tick a removal needs ("Yes, remove East"). */
  readonly confirm?: string;
  readonly button: string;
  /** A button that takes something away is drawn as one; a small step (move up) is quiet. */
  readonly kind?: 'danger' | 'quiet' | 'main';
  /** What the form is about, for a screen reader: "Change East". */
  readonly label: string;
  /** How the test and the page find the form: `data-form="rename"`. */
  readonly name: string;
  /** The form's own look where it is not a stacked form (a roster line's, step 2.155). */
  readonly className?: string;
};

/** A colour the color box can show: the league's own colors show a calm grey to start from. */
const colorOrStart = (value: string | null | undefined) =>
  value !== null && value !== undefined && /^#[0-9a-f]{6}$/i.test(value) ? value : '#5a6270';

/**
 * What is saved now in a box, as the page shows it, when it differs from what was typed
 * (T-399); undefined when they are the same.
 */
function savedNowOf(field: ListField, typed: TypedFields, nothing: string): string | undefined {
  if (field.kind === 'color') {
    const savedOwn = field.value === null;
    const typedOwn = typed[field.ownName] !== undefined;
    const sameColor = (typed[field.name] ?? '').toLowerCase() === (field.value ?? '').toLowerCase();
    if (savedOwn === typedOwn && (savedOwn || sameColor)) return undefined;
    return field.value ?? field.ownLabel;
  }
  if ((typed[field.name] ?? '') === field.value) return undefined;
  if (field.kind === 'select') {
    return field.options.find((option) => option.value === field.value)?.label ?? nothing;
  }
  return field.value === '' ? nothing : field.value;
}

export function ListForm({
  action,
  permalink,
  hidden,
  fields = [],
  confirm,
  button,
  kind,
  label,
  name,
  className = 'staff-form',
}: ListFormProps) {
  const [state, dispatch, pending] = useActionState(action, untouched, permalink);
  const onSubmit = useOneSubmit(pending, state);
  const formRef = useRef<HTMLFormElement>(null);
  // After a refusal the first wrong box has the focus, so the keyboard and the screen
  // reader are where the sentence is (step 2.155, as the games area's boxes).
  useEffect(() => {
    if (state.kind !== 'refused') return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);
  const base = useId();
  const problemId = `${base}-problem`;
  const refused = state.kind === 'refused' ? state : undefined;
  const wrongField = fields.find((f) => refused?.wrong.includes(f.name) === true)?.name;
  const typed = (field: string) => refused?.typed[field];
  const problem =
    refused === undefined ? null : (
      <p id={problemId} className="ui-field-error" role="alert" data-problem={name}>
        {refused.said}
      </p>
    );
  // Someone else changed it meanwhile (T-399): what is saved now, beside each box that differs.
  const savedNow = (field: ListField): ReactNode => {
    const words = refused?.savedNow;
    if (refused === undefined || words === undefined) return null;
    const shown = savedNowOf(field, refused.typed, words.nothing);
    return shown === undefined ? null : (
      <small className="ui-field-help" data-saved-now={field.name}>
        {words.label} {shown}
      </small>
    );
  };
  const marked = (field: string) =>
    wrongField === field ? { 'aria-invalid': true, 'aria-describedby': problemId } : {};
  return (
    <form
      ref={formRef}
      action={dispatch}
      onSubmit={onSubmit}
      className={className}
      aria-label={label}
      data-form={name}
    >
      {Object.entries(hidden).map(([field, value]) => (
        <input key={field} type="hidden" name={field} value={value} />
      ))}
      {fields.map((field) => {
        if (field.kind === 'color') {
          const own =
            refused === undefined ? field.value === null : typed(field.ownName) !== undefined;
          const color = colorOrStart(typed(field.name) ?? field.value);
          return (
            <div key={field.name} className="admin-color-fields">
              <label className="staff-field">
                <span>{field.label}</span>
                <input
                  key={`${field.name}:${color}`}
                  name={field.name}
                  type="color"
                  defaultValue={color}
                  {...marked(field.name)}
                />
              </label>
              <label className="staff-check">
                <input
                  key={`${field.ownName}:${String(own)}`}
                  name={field.ownName}
                  type="checkbox"
                  defaultChecked={own}
                />{' '}
                {field.ownLabel}
              </label>
              {savedNow(field)}
              {wrongField === field.name ? problem : null}
            </div>
          );
        }
        const value = typed(field.name) ?? field.value;
        const help =
          field.help === undefined ? null : <small className="ui-field-help">{field.help}</small>;
        if (field.kind === 'select') {
          return (
            <div key={field.name} className="admin-field-group">
              <label className="staff-field">
                <span>{field.label}</span>
                <select
                  key={`${field.name}:${value}`}
                  name={field.name}
                  defaultValue={value}
                  required={field.required ?? true}
                  {...marked(field.name)}
                >
                  {field.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {help}
              </label>
              {savedNow(field)}
              {wrongField === field.name ? problem : null}
            </div>
          );
        }
        if (field.kind === 'number') {
          return (
            <div key={field.name} className="admin-field-group">
              <label className="staff-field">
                <span>{field.label}</span>
                <input
                  key={`${field.name}:${value}`}
                  name={field.name}
                  // Text, not a number box: a phone's number keypad has no minus sign, and
                  // a deduction needs one. The server checks the number either way.
                  type="text"
                  defaultValue={value}
                  autoComplete="off"
                  size={6}
                  {...marked(field.name)}
                />
                {help}
              </label>
              {savedNow(field)}
              {wrongField === field.name ? problem : null}
            </div>
          );
        }
        return (
          <div key={field.name} className="admin-field-group">
            <label className="staff-field">
              <span>{field.label}</span>
              <input
                key={`${field.name}:${value}`}
                name={field.name}
                type={field.kind === 'url' ? 'url' : 'text'}
                inputMode={field.kind === 'url' ? 'url' : undefined}
                defaultValue={value}
                required={field.required}
                maxLength={field.maxLength}
                autoComplete="off"
                {...marked(field.name)}
              />
              {field.help === undefined ? null : (
                <small className="ui-field-help">{field.help}</small>
              )}
            </label>
            {savedNow(field)}
            {wrongField === field.name ? problem : null}
          </div>
        );
      })}
      {confirm === undefined ? null : (
        <p>
          <label className="staff-check">
            <input
              key={`confirm:${String(typed('confirm') === 'yes')}`}
              type="checkbox"
              name="confirm"
              value="yes"
              defaultChecked={typed('confirm') === 'yes'}
              required
            />{' '}
            {confirm}
          </label>
        </p>
      )}
      <p className="staff-buttons">
        <button
          type="submit"
          className="ui-button"
          data-kind={kind}
          {...(refused !== undefined && wrongField === undefined
            ? { 'aria-describedby': problemId }
            : {})}
        >
          {button}
        </button>
      </p>
      {wrongField === undefined ? problem : null}
    </form>
  );
}
