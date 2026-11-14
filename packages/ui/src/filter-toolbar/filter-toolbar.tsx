'use client';

import { useEffect, useState, type ReactNode } from 'react';

export type FilterToolbarProps = {
  /** Names the group of pickers for screen readers: "Filters". */
  readonly label: string;
  /** The pickers: each is its own small form that works without any script. */
  readonly children: ReactNode;
};

/**
 * The pickers of a page in one compact row. Once the page's script is running, choosing a
 * value applies it at once and the "Show" buttons are put away; until then, and where
 * scripts are off, each picker keeps its button.
 */
export function FilterToolbar({ label, children }: FilterToolbarProps) {
  const [applies, setApplies] = useState(false);
  useEffect(() => setApplies(true), []);
  return (
    <div
      className="ui-toolbar"
      role="group"
      aria-label={label}
      data-applies={applies ? 'true' : undefined}
      onChange={(event) => {
        const field = event.target;
        if (field instanceof HTMLSelectElement) field.form?.requestSubmit();
      }}
    >
      {children}
    </div>
  );
}
