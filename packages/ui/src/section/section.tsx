import type { ReactNode } from 'react';

export type SectionProps = {
  readonly title: string;
  /** One way on, beside the title: "See the full schedule". */
  readonly more?: { readonly href: string; readonly label: string } | undefined;
  /** A quiet line between the title and what the section holds. */
  readonly note?: string | undefined;
  readonly children: ReactNode;
};

/** A section of a page: its title with a short rule under it, then what it holds. */
export function Section({ title, more, note, children }: SectionProps) {
  return (
    <section className="ui-section">
      <div className="ui-section-head">
        <h2>{title}</h2>
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
