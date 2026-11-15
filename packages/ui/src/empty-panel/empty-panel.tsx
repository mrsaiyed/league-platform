export type EmptyPanelProps = {
  /** One sentence saying what will appear here. */
  readonly text: string;
  /** A short title above the sentence, for a whole page that is empty. */
  readonly title?: string | undefined;
  /** What to do next, where there is something. */
  readonly action?: { readonly href: string; readonly label: string } | undefined;
};

/** Nothing to show yet: a calm panel that says what will appear here and what to do next. */
export function EmptyPanel({ text, title, action }: EmptyPanelProps) {
  return (
    <div className="ui-empty">
      {title ? <p className="ui-empty-title">{title}</p> : null}
      <p>{text}</p>
      {action ? (
        <a className="ui-button" href={action.href}>
          {action.label}
        </a>
      ) : null}
    </div>
  );
}
