import type { ReactNode } from 'react';

export type SectionProps = {
  readonly title: string;
  /**
   * A tiny label over the title, after a short rule: "On the schedule". With one, the
   * title is set larger and carries no rule of its own.
   */
  readonly kicker?: string | undefined;
  /** One way on, beside the title: "See the full schedule". */
  readonly more?: { readonly href: string; readonly label: string } | undefined;
  /** A quiet line between the title and what the section holds. */
  readonly note?: string | undefined;
  readonly children: ReactNode;
};

/** A section of a page: its title, with a kicker over it or a short rule under it, then what it holds. */
export function Section({ title, kicker, more, note, children }: SectionProps) {
  return (
    <section className="ui-section">
      <div className="ui-section-head">
        {kicker ? (
          <div className="ui-section-title">
            <p className="ui-kicker">{kicker}</p>
            <h2>{title}</h2>
          </div>
        ) : (
          <h2>{title}</h2>
        )}
        {more ? (
          <a className="ui-more" href={more.href}>
            {more.label}
          </a>
        ) : null}
      </div>
      {note ? <p className="ui-section-note">{note}</p> : null}
      {children}
    </section>
  );
}
