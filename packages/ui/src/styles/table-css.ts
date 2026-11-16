// Tables: standings, statistics, box scores, rosters (docs/build/DESIGN.md, section 4,
// lines 13 and 14). Each sits in its own panel and scrolls inside it on a phone, with the
// name column staying put and a sign at the far edge while there are more columns that
// way. Number columns are only as wide as they need, so the name column takes the spare
// width.
export const tableCss = String.raw`
/* The box a table sits in. The table scrolls inside it; the box itself stays still, so it
   can show at its far edge that the table goes on. */
.ui-table-frame {
  /* How far down the box the arrow sits: on the line of the table's name. */
  --ui-table-arrow: var(--step-4);
  position: relative;
  isolation: isolate;
  max-inline-size: 100%;
  border: var(--card-border-width) solid var(--color-line);
  border-radius: var(--radius);
  box-shadow: var(--card-shadow);
  timeline-scope: --ui-table-scroll;
}
/* A table whose name is kept for screen readers only (a heading above it says the same) has
   no line of its own for the arrow, which then sat on a column heading. It gets a short
   band above its headings, and the arrow sits there. */
.ui-table-frame:has(caption.ui-visually-hidden) {
  --ui-table-arrow: var(--step-1);
}
.ui-table-frame:has(caption.ui-visually-hidden) .ui-table-wrap {
  padding-block-start: var(--step-4);
}
.ui-table-wrap {
  /* Words kept only for screen readers are placed out of the flow; this keeps the ones in
     columns scrolled out of sight inside the box, so the page itself never scrolls sideways. */
  position: relative;
  max-inline-size: 100%;
  overflow-x: auto;
  scroll-timeline: --ui-table-scroll inline;
  /* The box is the measure of what is in it: the name column is held to a share of it.
     Being that measure, it takes no width from what it holds, so it is given its own: the
     whole of its place, whatever kind of box it is put in. */
  inline-size: 100%;
  container-type: inline-size;
  /* Whatever the keyboard reaches is scrolled clear of the name column, which stays put
     over the start of the box and would otherwise cover it. */
  scroll-padding-inline-start: 50%;
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
  border-radius: inherit;
}
/* The sign that a table goes on past the edge of its box: the last column in view fades
   out and a small arrow points on. Both follow the table's own sideways scroll, so they
   are there only while there is more to see that way, and a table that fits shows neither.
   A browser that cannot follow the scroll keeps the soft shadow above. */
@supports (timeline-scope: --ui-table-scroll) {
  .ui-table-frame::before,
  .ui-table-frame::after {
    content: '';
    position: absolute;
    z-index: 2;
    opacity: 0;
    pointer-events: none;
    animation: ui-table-more linear both;
    animation-timeline: --ui-table-scroll;
  }
  /* The fade, with a clear patch behind the arrow so no heading shows through it. It is
     narrow and reaches the panel's color only at the very edge: a column that is wholly in
     view under it keeps every digit readable, and only what runs off the edge is lost. */
  .ui-table-frame::before {
    inset-block: 0;
    inset-inline-end: 0;
    inline-size: var(--step-5);
    border-start-end-radius: inherit;
    border-end-end-radius: inherit;
    background:
      radial-gradient(
        circle at 50% calc(var(--ui-table-arrow) + var(--step-1)),
        var(--color-panel) var(--step-2),
        transparent var(--step-3)
      ),
      linear-gradient(to right, transparent, var(--color-panel));
  }
  [dir='rtl'] .ui-table-frame::before {
    background:
      radial-gradient(
        circle at 50% calc(var(--ui-table-arrow) + var(--step-1)),
        var(--color-panel) var(--step-2),
        transparent var(--step-3)
      ),
      linear-gradient(to left, transparent, var(--color-panel));
  }
  .ui-table-frame:has(caption.ui-visually-hidden)::after {
    inset-block-start: var(--step-1);
  }
  .ui-table-frame::after {
    inset-block-start: var(--step-4);
    inset-inline-end: var(--step-2);
    inline-size: var(--step-2);
    block-size: var(--step-2);
    border-block-end: var(--line-heavy) solid var(--color-text);
    border-inline-end: var(--line-heavy) solid var(--color-text);
    transform: rotate(-45deg);
  }
  [dir='rtl'] .ui-table-frame::after {
    transform: rotate(45deg);
  }
  /* The column that stays put has an edge while the table is scrolled under it: a hairline
     and a soft shadow on its far side. A number half under it is then plainly covered, not
     read as a different number. A table that is not scrolled shows no edge. */
  .ui-team-cell::after {
    content: '';
    position: absolute;
    inset-block: 0;
    inset-inline-start: 100%;
    inline-size: var(--step-2);
    border-inline-start: 1px solid var(--color-line-strong);
    background: linear-gradient(to right, var(--scroll-shadow), transparent);
    opacity: 0;
    pointer-events: none;
    animation: ui-table-stuck linear both;
    animation-timeline: --ui-table-scroll;
  }
  [dir='rtl'] .ui-team-cell::after {
    background: linear-gradient(to left, var(--scroll-shadow), transparent);
  }
}
/* A browser that cannot follow the scroll gives that column a hairline at all times. */
@supports not (timeline-scope: --ui-table-scroll) {
  .ui-team-cell {
    border-inline-end: 1px solid var(--color-line);
  }
}
@keyframes ui-table-more {
  0%,
  85% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}
@keyframes ui-table-stuck {
  0% {
    opacity: 0;
  }
  3%,
  100% {
    opacity: 1;
  }
}
.ui-table {
  inline-size: 100%;
  border-collapse: separate;
  border-spacing: 0;
  color: var(--color-text);
  font-size: var(--text-14);
  font-variant-numeric: lining-nums tabular-nums;
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
/* A table's name stays in view while its columns scroll under it. */
.ui-table caption:not(.ui-visually-hidden) {
  position: sticky;
  inset-inline-start: 0;
  inline-size: fit-content;
  background: var(--color-panel);
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
/* In a narrow box (a phone) a standings table's cells stand a step closer to each other,
   so a division's few columns on the home page show whole, with nothing to scroll to. */
@container (max-width: 26rem) {
  .ui-standings th,
  .ui-standings td {
    padding-inline: var(--step-2);
  }
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
/* The name a row is about, and the heading over it: they stay in view while the numbers
   scroll under them. */
.ui-team-cell {
  position: sticky;
  inset-inline-start: 0;
  background-color: var(--color-panel);
  white-space: nowrap;
}
/* The divisions of a league are separate tables on one page, and their numbers are read
   down the page as well as across: the team column has one width in all of them (room
   for a name of about ten letters and a footnote's mark), so GP sits under GP. A division
   with a longer name than that has a wider column, up to the limit below. */
.ui-standings .ui-team-cell {
  min-inline-size: 7.5rem;
}
/* The column that stays put never takes more than about 45% of its box, or on a phone a
   long name would leave no room to bring the numbers into view. A name longer than that
   wraps under itself, whole, beside its color chip; only a single word wider than the
   limit is broken. */
.ui-team-cell > [dir] {
  display: inline-block;
  /* As wide as its words up to the limit, and never squeezed below that: a name that fits
     stays on one line, and the table scrolls rather than folding its names. */
  inline-size: max-content;
  max-inline-size: calc(45vw - var(--step-6));
  max-inline-size: calc(45cqi - var(--step-6));
  overflow-wrap: break-word;
  vertical-align: middle;
  white-space: normal;
}
.ui-team-cell > .ui-team-chip {
  vertical-align: middle;
}
/* A team's color beside its name, wherever a table names a team; the two never part. */
.ui-table .ui-team-chip {
  display: inline-block;
  margin-inline-end: var(--step-2);
}
.ui-table td:has(> .ui-team-chip) {
  white-space: nowrap;
}
/* A team's emblem beside its name, where a table draws one in place of the chip. It is
   wider than the chip, so the name gives up that much of its share of the box. */
.ui-table .ui-emblem {
  margin-inline-end: var(--step-2);
  vertical-align: middle;
}
.ui-table td:has(> .ui-emblem) {
  white-space: nowrap;
}
.ui-standings[data-emblems='true'] .ui-team-cell > [dir] {
  max-inline-size: calc(45cqi - var(--step-6) - var(--step-3));
}
/* And the one width the team column has in every division's table grows by what the emblem
   is wider than the chip, so it still holds a name of about ten letters and a note's mark:
   the numbers of two divisions stay under each other. */
.ui-standings[data-emblems='true'] .ui-team-cell {
  min-inline-size: calc(7.5rem + var(--step-3));
}
/* A table with emblems stands among scoreboards, and has their fine line at its top. */
.ui-table-frame:has(.ui-standings[data-emblems='true']) {
  border-block-start: var(--line-heavy) solid var(--color-ornament-line);
}
/* With emblems a team's place is set in the score face, in the color the eye lands on. */
.ui-standings[data-emblems='true'] tbody td.ui-num:first-child {
  color: var(--color-pop);
  font-family: var(--font-score);
  font-size: var(--text-16);
}
/* A cell with no number holds a quiet dash, never nothing. */
.ui-no-value {
  color: var(--color-muted);
}
/* The column a table is sorted by is picked out quietly: its numbers are heavier, and its
   heading is in the text color with the arrow of its direction. */
.ui-stats td[data-sorted='true'] {
  font-weight: 700;
}
/* A table whose team column folds (the statistics page's players): in a box as narrow as a
   phone's the team is its shield alone, before the player's name, and the team's own
   column is gone, so the numbers come straight after the name. The team's name is still
   said to screen readers there. In a wider box the fold's two parts are not drawn. */
.ui-stats .ui-fold {
  display: none;
}
@container (max-width: 30rem) {
  .ui-stats[data-fold] .ui-fold {
    display: inline;
  }
  .ui-stats[data-fold] [data-folded] {
    display: none;
  }
  .ui-stats[data-fold] th,
  .ui-stats[data-fold] td {
    padding-inline: var(--step-2);
  }
  .ui-stats[data-fold] tr > :first-child {
    padding-inline-start: var(--step-4);
  }
  .ui-stats[data-fold] tr > :last-child {
    padding-inline-end: var(--step-4);
  }
  /* The name gives up what the shield takes, as a standings table's does. */
  .ui-stats[data-fold] .ui-team-cell > [dir] {
    max-inline-size: calc(45cqi - var(--step-6) - var(--step-3));
  }
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
/* In a team's cell the mark is part of the name's own flow, after its last word. The name
   keeps room for it at its end, and the mark hangs in that room: it takes none in the line
   itself, so under a long name whose last line is full it still stands beside the last
   word, never on a line of its own. (Of two marks it is the last that hangs.) */
.ui-team-cell > [dir]:has(> .ui-note-mark) {
  padding-inline-end: var(--step-5);
  /* The room is added to the name's limit, not taken from its words: a name with a mark
     wraps exactly where the same name without one does. */
  max-inline-size: calc(45vw - var(--step-6) + var(--step-5));
  max-inline-size: calc(45cqi - var(--step-6) + var(--step-5));
}
.ui-standings[data-emblems='true'] .ui-team-cell > [dir]:has(> .ui-note-mark) {
  max-inline-size: calc(45cqi - var(--step-6) - var(--step-3) + var(--step-5));
}
/* The pull-back is under the same condition as the room it hangs in: a browser that does
   not know ':has()' drops both, and the mark simply takes its own room in the line. */
.ui-team-cell > [dir]:has(> .ui-note-mark) > .ui-note-mark:last-child a {
  margin-inline-end: calc(-1 * var(--step-5));
}
/* Notes under a table stay put while it scrolls, and are never faded by the sign above. */
.ui-footnotes,
.ui-table-notice {
  position: sticky;
  z-index: 3;
  inset-inline-start: 0;
  margin: 0;
  background: var(--color-panel);
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
  gap: var(--step-1);
  padding-block: 0;
  padding-inline: 0;
  min-block-size: var(--tap);
  min-inline-size: var(--tap);
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
/* The ring of a heading's button is drawn inside it: the box the table scrolls in cuts off
   anything drawn outside its first row. */
.ui-table .ui-sort-button:focus-visible {
  outline-offset: -3px;
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
