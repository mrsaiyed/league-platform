export type CallBandProps = {
  /** A short phrase: what the reader is invited to. */
  readonly title: string;
  /** One sentence under it. */
  readonly text?: string | undefined;
  /** The one thing to do. */
  readonly action: { readonly href: string; readonly label: string };
};

/**
 * A filled band near the foot of a page with one call to action: a phrase, a sentence and
 * one button, in the band's own colors.
 */
export function CallBand({ title, text, action }: CallBandProps) {
  return (
    <section className="ui-call-band">
      <div className="ui-call-band-words">
        <h2>{title}</h2>
        {text ? <p>{text}</p> : null}
      </div>
      <a className="ui-button" data-kind="pop" data-arrow="true" href={action.href}>
        {action.label}
      </a>
    </section>
  );
}
