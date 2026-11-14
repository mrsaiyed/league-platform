// The filter toolbar and its pickers (docs/build/DESIGN.md, section 4, line 15): season,
// round, team and "per game or totals" in one compact row. With scripts on, choosing a
// value applies it and the "Show" buttons are put away; with scripts off they stay, quiet.
// The chosen value is in the text color, a little heavier: the highlight is kept for a live
// game and a winner's score (C-15).
export const pickerCss = String.raw`
.ui-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--step-3) var(--step-4);
  margin-block: 0 var(--step-5);
}
.ui-toolbar:empty {
  display: none;
}
.ui-page-head .ui-toolbar {
  margin-block-end: 0;
}
.ui-picker {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--step-2);
  margin: 0;
}
.ui-picker label {
  color: var(--color-muted);
  font-size: var(--text-12);
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.ui-picker select,
.ui-picker button {
  min-block-size: var(--tap);
  padding-block: var(--step-2);
  padding-inline: var(--step-3);
  border: 1px solid var(--color-line-strong);
  border-radius: var(--radius-small);
  background: var(--color-panel);
  color: var(--color-text);
  font: inherit;
  font-size: var(--text-14);
}
.ui-picker select {
  max-inline-size: 100%;
  font-weight: 600;
  cursor: pointer;
}
.ui-picker option {
  background: var(--color-panel);
  color: var(--color-text);
  font-weight: 400;
}
.ui-picker option:checked {
  font-weight: 700;
}
.ui-picker button {
  background: transparent;
  color: var(--color-muted);
  font-weight: 600;
  cursor: pointer;
}
.ui-picker button:hover {
  color: var(--color-text);
}
.ui-toolbar[data-applies='true'] .ui-picker button {
  display: none;
}
`;
