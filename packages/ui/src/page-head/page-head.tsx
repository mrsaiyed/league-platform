import type { ReactNode } from 'react';
import { Facts, type Fact } from '../facts/facts.tsx';

export type PageHeadProps = {
  /** The page's one title. */
  readonly title: string;
  /** A small label above the title: the season, say. */
  readonly eyebrow?: string | undefined;
  /**
   * The same small label drawn as a kicker (a short rule, then the label), as over a
   * section's title on the home page: for a page whose title is a phrase ("The
   * standings.") with one sentence under it. Drawn in place of the eyebrow.
   */
  readonly kicker?: string | undefined;
  /** One quiet line under the title. */
  readonly sub?: string | undefined;
  /** A few short facts under the title, each a label and its value: a team's seed and record. */
  readonly facts?: readonly Fact[] | undefined;
  /** A home page opens larger, with the eyebrow as a badge. */
  readonly size?: 'page' | 'hero';
  /** Drawn before the title: a team's emblem, say. */
  readonly lead?: ReactNode;
  /** What the page lets you do, beside the title on a laptop and under it on a phone. */
  readonly children?: ReactNode;
};

/** The head of a page: one title, what it belongs to, and the page's own actions. */
export function PageHead({
  title,
  eyebrow,
  sub,
  kicker,
  facts,
  size = 'page',
  lead,
  children,
}: PageHeadProps) {
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
    <header className="ui-page-head" data-phrased={kicker ? 'true' : undefined}>
      <div className="ui-page-head-row">
        {lead}
        <div className="ui-page-head-text">
          {kicker ? (
            <p className="ui-kicker">{kicker}</p>
          ) : eyebrow ? (
            <p className="ui-eyebrow">{eyebrow}</p>
          ) : null}
          <h1 dir="auto">{title}</h1>
          {sub ? <p className="ui-page-sub">{sub}</p> : null}
          {facts && facts.length > 0 ? <Facts facts={facts} /> : null}
        </div>
        {children}
      </div>
    </header>
  );
}
