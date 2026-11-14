import type { ReactNode } from 'react';

export type MessagePageProps = {
  readonly title: string;
  /** One or two plain sentences. */
  readonly children?: ReactNode;
  /** The one clear way on. */
  readonly action?: { readonly href: string; readonly label: string } | undefined;
  readonly className?: string | undefined;
};

/** A page that is only a message: not found, no access, not built yet. Centered, titled, with one way on. */
export function MessagePage({ title, children, action, className }: MessagePageProps) {
  return (
    <main className={className === undefined ? 'ui-message' : `ui-message ${className}`}>
      <span className="ui-message-mark" aria-hidden="true" />
      <h1>{title}</h1>
      {children}
      {action ? (
        <a className="ui-button" data-kind="main" href={action.href}>
          {action.label}
        </a>
      ) : null}
    </main>
  );
}
