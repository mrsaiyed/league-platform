'use client';
// "Show" beside a password field (step 2.163; the using-it audit, L9): one tap shows what
// was typed, so a slip on a phone's keyboard can be seen before it is sent; the same
// button then reads "Hide". It is drawn only once the page's script runs, because with
// scripts off it could do nothing. It is a plain button that changes the field's type;
// its words say what the next tap does. Its name is only "Show" or "Hide": the field
// it works on is the one it stands beside (aria-controls), and the field keeps its own
// label, so nothing else on the page is called "Password".
import { useEffect, useState } from 'react';

export function ShowPassword({
  field,
  show,
  hide,
}: {
  /** The id of the password field. */
  readonly field: string;
  /** "Show" and "Hide", from the message files. */
  readonly show: string;
  readonly hide: string;
}) {
  const [ready, setReady] = useState(false);
  const [shown, setShown] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready) return null;
  const toggle = () => {
    const input = document.getElementById(field);
    if (!(input instanceof HTMLInputElement)) return;
    const next = !shown;
    input.type = next ? 'text' : 'password';
    setShown(next);
    input.focus();
  };
  return (
    <button
      type="button"
      className="ui-button"
      data-kind="quiet"
      data-show-password=""
      aria-controls={field}
      onClick={toggle}
    >
      {shown ? hide : show}
    </button>
  );
}
