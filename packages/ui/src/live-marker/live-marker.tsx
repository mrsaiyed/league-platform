/** The Live marker (P7 §5.3). Text as well as a dot, so it never relies on color alone (T-186). */
export function LiveMarker({ label }: { readonly label: string }) {
  return (
    <span className="ui-live">
      <span className="ui-live-dot" aria-hidden="true" />
      {label}
    </span>
  );
}
