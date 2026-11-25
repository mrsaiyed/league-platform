'use client';
// "Find a person by name" on a team's page (step 2.90, T-448). With scripts on, the
// browser goes to the team's address with the name searched for in place, without a
// reload (a server action's redirect to another address loads the page afresh); with no
// script, the form posts to `action`, which sends the browser there. A name only: what
// holds an email address is never put in an address (T-76).
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

export function FindPersonForm({
  action,
  to,
  anchor,
  children,
}: {
  readonly action: (form: FormData) => Promise<void>;
  /** The team's own page, as the address helper built it. */
  readonly to: string;
  readonly anchor: string;
  readonly children: ReactNode;
}) {
  const router = useRouter();
  return (
    <form
      action={action}
      role="search"
      className="staff-form"
      onSubmit={(event) => {
        event.preventDefault();
        const typed = String(new FormData(event.currentTarget).get('q') ?? '')
          .trim()
          .slice(0, 100)
          .replace(/[‘’]/g, "'");
        const url = new URL(to, window.location.href);
        if (typed !== '' && !typed.includes('@')) url.searchParams.set('q', typed);
        router.push(`${url.pathname}${url.search}#${anchor}`);
      }}
    >
      {children}
    </form>
  );
}
