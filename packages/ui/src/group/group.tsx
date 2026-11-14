import type { ReactNode } from 'react';

export type GroupProps = {
  readonly title: string;
  /** A small pill beside the title: "This round". */
  readonly mark?: string | undefined;
  /** A quiet line at the end of the heading row: "3 games on Sat, Nov 14". */
  readonly summary?: string | undefined;
  readonly open: boolean;
  /** Which group to pick out: the current one is marked in the main color. */
  readonly phase?: string | undefined;
  readonly children: ReactNode;
};

/**
 * A group that opens and closes: a round of the schedule. A plain disclosure, so it works
 * without any script.
 */
export function Group({ title, mark, summary, open, phase, children }: GroupProps) {
  return (
    <details className="ui-group" open={open} data-phase={phase}>
      <summary>
        <h2 dir="auto">{title}</h2>
        {mark ? <span className="ui-group-mark">{mark}</span> : null}{' '}
        {summary ? <span className="ui-group-summary">{summary}</span> : null}
      </summary>
      <div className="ui-group-body">{children}</div>
    </details>
  );
}
