import type { ReactNode } from 'react';

export type PageHeadProps = {
  /** The page's one title. */
  readonly title: string;
  /** A small label above the title: the season, say. */
  readonly eyebrow?: string | undefined;
  /** One quiet line under the title. */
  readonly sub?: string | undefined;
  /** A home page opens larger, with the eyebrow as a badge. */
  readonly size?: 'page' | 'hero';
  /** Drawn before the title: a team's emblem, say. */
  readonly lead?: ReactNode;
  /** What the page lets you do, beside the title on a laptop and under it on a phone. */
  readonly children?: ReactNode;
};

/** The head of a page: one title, what it belongs to, and the page's own actions. */
export function PageHead({ title, eyebrow, sub, size = 'page', lead, children }: PageHeadProps) {
  if (size === 'hero') {
    return (
      <header className="ui-page-head" data-size="hero">
        {eyebrow ? <p className="ui-badge">{eyebrow}</p> : null}
        <h1 dir="auto">{title}</h1>
        {sub ? <p className="ui-page-sub">{sub}</p> : null}
        {children}
      </header>
    );
  }
  return (
    <header className="ui-page-head">
      <div className="ui-page-head-row">
        {lead}
        <div className="ui-page-head-text">
          {eyebrow ? <p className="ui-eyebrow">{eyebrow}</p> : null}
          <h1 dir="auto">{title}</h1>
          {sub ? <p className="ui-page-sub">{sub}</p> : null}
        </div>
        {children}
      </div>
    </header>
  );
}
