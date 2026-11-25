// A form that saves goes quiet once it is sent (step 2.155): a second tap before the answer
// comes does nothing. With scripts off the browser may send it twice; the server knows the
// second as the same request (server/same-request.ts) and answers it as the first. Every
// admin form's one copy (the games area's own was folded into it, step 2.155 part 5).
import { useEffect, useRef, type FormEvent } from 'react';

export function useOneSubmit(
  pending: boolean,
  answer: unknown,
): (event: FormEvent<HTMLFormElement>) => void {
  const busy = useRef(false);
  useEffect(() => {
    if (!pending) busy.current = false;
  }, [pending, answer]);
  return (event) => {
    if (busy.current) event.preventDefault();
    else busy.current = true;
  };
}
