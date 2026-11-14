'use client';

import { useRef, type ReactNode } from 'react';

export type FilterToolbarProps = {
  /** Names the group of pickers for screen readers: "Filters". */
  readonly label: string;
  /** The pickers: each is its own small form that works without any script. */
  readonly children: ReactNode;
};

/** How the value of a picker was last moved: by a key, or by a tap or click. */
export type PickerInput = 'keyboard' | 'pointer';

/**
 * Whether a picker's new value is applied at once. A tap or a click on a choice is the
 * person's decision, so it is. An arrow key is not: a closed picker changes its value at
 * every arrow, and a page read again at each step throws a keyboard or screen-reader
 * user to the top with nothing to confirm with (WCAG 3.2.2). A value moved by key waits
 * for Enter, or for the picker's "Show" button, which the keyboard reaches next. A choice
 * confirmed with Enter in an open list arrives while Enter is still down, and is applied.
 */
export function appliesAtOnce(last: PickerInput, enterIsDown: boolean): boolean {
  return last === 'pointer' || enterIsDown;
}

/**
 * The pickers of a page in one compact row. Each picker is a plain form with its own
 * "Show" button, so it works with scripts off. With scripts on, a choice made by tap or
 * click is applied at once and the button is put away (the stylesheet does that, so
 * nothing moves when the page's script starts); a value moved with the keyboard waits for
 * Enter or for the button, which comes back whenever the keyboard is in its picker.
 */
export function FilterToolbar({ label, children }: FilterToolbarProps) {
  const last = useRef<PickerInput>('pointer');
  const enterIsDown = useRef(false);
  /** Pickers whose value was moved by key and not applied yet. */
  const waiting = useRef(new WeakSet<HTMLSelectElement>());

  return (
    <div
      className="ui-toolbar"
      role="group"
      aria-label={label}
      onPointerDown={() => {
        last.current = 'pointer';
      }}
      onKeyDown={(event) => {
        const field = event.target;
        if (!(field instanceof HTMLSelectElement)) return;
        last.current = 'keyboard';
        if (event.key !== 'Enter') return;
        enterIsDown.current = true;
        if (waiting.current.has(field)) {
          event.preventDefault();
          waiting.current.delete(field);
          field.form?.requestSubmit();
        }
      }}
      onKeyUp={(event) => {
        if (event.key === 'Enter') enterIsDown.current = false;
      }}
      onChange={(event) => {
        const field = event.target;
        if (!(field instanceof HTMLSelectElement)) return;
        if (appliesAtOnce(last.current, enterIsDown.current)) field.form?.requestSubmit();
        else waiting.current.add(field);
      }}
    >
      {children}
    </div>
  );
}
