export type NoValueProps = {
  /**
   * Said to screen readers where the dash is drawn: "Nothing recorded", "No number". Left
   * out, the cell says nothing to them.
   */
  readonly word?: string | undefined;
};

/**
 * What a cell with nothing to show holds: a quiet dash, and a word for screen readers.
 * Never blank, so an empty row is not read as a table that failed to load (DESIGN.md,
 * section 4, line 13). Every table draws its empty cells with this one piece.
 */
export function NoValue({ word }: NoValueProps) {
  return (
    <>
      <span className="ui-no-value" aria-hidden="true">
        –
      </span>
      {word === undefined ? null : <span className="ui-visually-hidden">{word}</span>}
    </>
  );
}
