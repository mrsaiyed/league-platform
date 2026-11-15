// A form that saves goes quiet once it is sent (step 2.155): a second tap before the answer
// comes does nothing. With scripts off the browser may send it twice; the server knows the
// second as the same request (server/same-request.ts) and answers it as the first.
import { useEffect, useRef, type FormEvent } from 'react';

/**
 * The form's onSubmit: lets the first send through and stops any other until it is
 * answered (`pending` ends, or a new `answer` comes).
 */
export function useOneSubmit(
  pending: boolean,
  answer: unknown,
): (event: FormEvent<HTMLFormElement>) => void {
  const busy = useRef(false);
  useEffect(() => {
    if (!pending) busy.current = false;
  }, [pending, answer]);
  return (event) => {
    // A form whose submit is stopped here sends nothing (React runs no action for it).
    if (busy.current) event.preventDefault();
    else busy.current = true;
  };
}
