import type { ReactNode } from 'react';

export type MessagePageProps = {
  readonly title: string;
  /** One or two plain sentences. */
  readonly children?: ReactNode;
  /** The one clear way on. */
  readonly action?: { readonly href: string; readonly label: string } | undefined;
  /**
   * Quieter ways on, under the clear one (a refusal's "Use another account"): drawn as
   * quiet buttons in one row that wraps, so the one clear way on stays the one filled.
   */
  readonly also?: readonly { readonly href: string; readonly label: string }[] | undefined;
  readonly className?: string | undefined;
};

/** A page that is only a message: not found, no access, not built yet. Centered, titled, with one way on. */
export function MessagePage({ title, children, action, also, className }: MessagePageProps) {
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
      {also !== undefined && also.length > 0 ? (
        <p className="ui-message-also">
          {also.map((link) => (
            <a key={link.href} className="ui-button" data-kind="quiet" href={link.href}>
              {link.label}
            </a>
          ))}
        </p>
      ) : null}
    </main>
  );
}
