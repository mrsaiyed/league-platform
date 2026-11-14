// Tables: standings, statistics, box scores, rosters (docs/build/DESIGN.md, section 4,
// lines 13 and 14). Each sits in its own panel and scrolls inside it on a phone, with the
// name column staying put. Number columns are only as wide as they need, so the name
// column takes the spare width.
export const tableCss = String.raw`
.ui-table-wrap {
  /* Words kept only for screen readers are placed out of the flow; this keeps the ones in
     columns scrolled out of sight inside the box, so the page itself never scrolls sideways. */
  position: relative;
  max-inline-size: 100%;
  overflow-x: auto;
  /* When columns are scrolled out of sight, a soft shadow at that edge says so. The two
     panel-colored covers move with the table and hide the shadow at an edge with nothing
     beyond it. The same on both sides, so it is right in either reading direction. */
  background:
    linear-gradient(to right, var(--color-panel) 40%, transparent) left / var(--step-6) 100%
      no-repeat local,
    linear-gradient(to left, var(--color-panel) 40%, transparent) right / var(--step-6) 100%
      no-repeat local,
    linear-gradient(to right, var(--scroll-shadow), transparent) left / var(--step-3) 100%
      no-repeat scroll,
    linear-gradient(to left, var(--scroll-shadow), transparent) right / var(--step-3) 100%
      no-repeat scroll,
    var(--color-panel);
  border: var(--card-border-width) solid var(--color-line);
  border-radius: var(--radius);
  box-shadow: var(--card-shadow);
}
.ui-table {
  inline-size: 100%;
  border-collapse: separate;
  border-spacing: 0;
  color: var(--color-text);
  font-size: var(--text-14);
  font-variant-numeric: tabular-nums;
}
.ui-table caption {
  padding-block: var(--step-3) var(--step-1);
  padding-inline: var(--step-4);
  color: var(--color-accent-text);
  font-size: var(--text-12);
  font-weight: 700;
  letter-spacing: var(--label-tracking);
  text-align: start;
  text-transform: uppercase;
}
.ui-table th,
.ui-table td {
  padding-block: var(--step-3);
  padding-inline: var(--step-3);
  border-block-end: 1px solid var(--color-line);
  font-weight: 400;
  line-height: 1.5rem;
  text-align: start;
  vertical-align: middle;
}
.ui-table tr > :first-child {
  padding-inline-start: var(--step-4);
}
.ui-table tr > :last-child {
  padding-inline-end: var(--step-4);
}
.ui-table thead th {
  color: var(--color-muted);
  font-size: var(--text-12);
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  white-space: nowrap;
}
.ui-table tbody tr:last-child > * {
  border-block-end: 0;
}
.ui-table tbody tr:hover > * {
  background-image: linear-gradient(var(--color-tint), var(--color-tint));
}
.ui-table tfoot th,
.ui-table tfoot td {
  border-block-start: 1px solid var(--color-line-strong);
  border-block-end: 0;
  font-weight: 700;
}
.ui-table .ui-num {
  inline-size: 1%;
  text-align: end;
  white-space: nowrap;
}
/* A column of short words that should not take the spare width from the name column. */
.ui-table .ui-fit {
  inline-size: 1%;
  white-space: nowrap;
}
.ui-table tbody th {
  font-weight: 600;
}
.ui-table tbody th a {
  color: var(--color-text);
  font-weight: 600;
}
/* The name a row is about: it stays in view while the numbers scroll under it. */
.ui-team-cell {
  position: sticky;
  inset-inline-start: 0;
  background-color: var(--color-panel);
  white-space: nowrap;
}
.ui-team-cell .ui-team-chip {
  display: inline-block;
  margin-inline-end: var(--step-2);
}
/* A note's number sits beside the name without making its row taller than the others. */
.ui-note-mark {
  font-size: var(--text-12);
  line-height: 1;
  vertical-align: top;
}
.ui-note-mark a {
  display: inline-block;
  min-inline-size: 1.5rem;
  min-block-size: 1.5rem;
  text-align: center;
  line-height: 1.5rem;
  vertical-align: top;
  color: var(--color-muted);
  font-weight: 400;
  text-decoration: underline;
}
.ui-footnotes,
.ui-table-notice {
  position: sticky;
  inset-inline-start: 0;
  margin: 0;
  padding-block: var(--step-3);
  padding-inline: var(--step-4);
  border-block-start: 1px solid var(--color-line);
  color: var(--color-muted);
  font-size: var(--text-12);
  line-height: 1.5;
}
.ui-footnotes {
  padding-inline-start: var(--step-6);
}
.ui-footnotes li + li {
  margin-block-start: var(--step-1);
}
.ui-table th:has(.ui-sort-button) {
  padding-block: 0;
}
.ui-sort-button {
  display: inline-flex;
  align-items: center;
  /* A short heading starts where its column's words start, not in the middle of the button. */
  justify-content: flex-start;
  gap: 0.35em;
  padding-block: 0;
  padding-inline: 0;
  min-block-size: 2.75rem;
  min-inline-size: 2.75rem;
  border: 0;
  border-radius: var(--radius-small);
  background: none;
  color: inherit;
  font: inherit;
  text-transform: inherit;
  letter-spacing: inherit;
  cursor: pointer;
}
.ui-sort-button:hover {
  color: var(--color-text);
}
.ui-num .ui-sort-button {
  justify-content: flex-end;
}
th[aria-sort='ascending'] .ui-sort-button,
th[aria-sort='descending'] .ui-sort-button {
  color: var(--color-text);
}
th[aria-sort='ascending'] .ui-sort-button::after {
  content: '\25B2' / '';
  font-size: 0.7em;
}
th[aria-sort='descending'] .ui-sort-button::after {
  content: '\25BC' / '';
  font-size: 0.7em;
}
`;
