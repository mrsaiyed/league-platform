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
   no line of its own for the arrow, which must not sit on a column heading. Its arrow
   stands over the box's far corner instead (below), so the fade keeps no clear patch for
   one inside the box. */
.ui-table-frame:has(caption.ui-visually-hidden) {
  --ui-table-arrow: calc(-1 * var(--step-8));
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
    inline-size: var(--step-4);
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
  /* Over a table with no name in view the sign is the arrow of a way on, standing above
     the box's far corner in the gap under the section's title: no strip is kept for it
     inside the box, and it never sits on a column heading. */
  .ui-table-frame:has(caption.ui-visually-hidden)::after {
    inset-block-start: calc(-1 * (var(--step-4) + var(--step-1)));
    inset-inline-end: 0;
    inline-size: var(--step-4);
    block-size: var(--step-4);
    border: 0;
    background: var(--color-muted);
    -webkit-mask: var(--ui-arrow) center / contain no-repeat;
    mask: var(--ui-arrow) center / contain no-repeat;
    transform: none;
  }
  [dir='rtl'] .ui-table-frame:has(caption.ui-visually-hidden)::after {
    transform: scaleX(-1);
  }
  /* The column that stays put has an edge while the table is scrolled under it: a hairline
     and a soft shadow on its far side. A number half under it is then plainly covered, not
     read as a different number. A table that is not scrolled shows no edge. */
  .ui-team-cell::after {
    content: '';
    position: absolute;
    inset-block: 0;
    inset-inline-start: 100%;
    inline-size: var(--step-3);
    border-inline-start: 1px solid var(--color-line-strong);
    /* The panel's own color, thinning: a number scrolled against the column fades into it
       over a few pixels, and never stands hard against the name. */
    background: linear-gradient(to right, var(--color-panel), transparent);
    opacity: 0;
    pointer-events: none;
    animation: ui-table-stuck linear both;
    animation-timeline: --ui-table-scroll;
  }
  [dir='rtl'] .ui-team-cell::after {
    background: linear-gradient(to left, var(--color-panel), transparent);
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
/* The two box scores of one game are read one against the other. The column of the numbers
   players wear has one width in both, and both give their names the same room (the page
   counts the letters of the longest name of either: --name-room), up to the name column's
   limit: so the number columns of the two stand under each other on a phone, and one
   table never hides a column the other shows. A table that lists no players gives "Total"
   the width the other's two first columns have together. */
.ui-box-score tr > .ui-num:first-child {
  inline-size: var(--step-7);
}
.ui-box-score .ui-team-cell > [dir] {
  min-inline-size: min(calc(var(--name-room, 0) * 1ch), calc(45cqi - var(--step-6)));
}
.ui-box-score[data-players='hidden'] .ui-team-cell {
  inline-size: calc(
    var(--step-7) + 2 * var(--step-3) +
      min(calc(var(--name-room, 0) * 1ch), calc(45cqi - var(--step-6)))
  );
}
/* In a box as narrow as a phone's a box score's cells stand a step closer and the column of
   numbers worn is a step narrower, so one more statistic is in view in both tables. */
@container (max-width: 30rem) {
  .ui-box-score th,
  .ui-box-score td {
    padding-inline: var(--step-2);
  }
  .ui-box-score tr > :first-child {
    padding-inline-start: var(--step-4);
  }
  .ui-box-score tr > :last-child {
    padding-inline-end: var(--step-4);
  }
  .ui-box-score tr > .ui-num:first-child {
    inline-size: calc(var(--step-6) + var(--step-2));
  }
  .ui-box-score[data-players='hidden'] .ui-team-cell {
    inline-size: calc(
      var(--step-6) + var(--step-2) + 2 * var(--step-2) +
        min(calc(var(--name-room, 0) * 1ch), calc(45cqi - var(--step-6)))
    );
  }
}
/* A cell with no number holds a quiet dash, never nothing. */
.ui-no-value {
  color: var(--color-muted);
}
/* A box score's row of a player who did not play says so in one cell across its numbers,
   in the same quiet color as a cell with nothing to show (step 2.159). */
.ui-box-score td.ui-box-note {
  color: var(--color-muted);
}
/* The column a table is sorted by is picked out quietly: its numbers are heavier, and its
   heading is in the text color with the arrow of its direction. */
.ui-stats td[data-sorted='true'] {
  font-weight: 700;
}
/* A figure a row draws quieter (the games played of a player with too few to be ranked):
   the quiet text color, which still reads on a panel, and never heavier than plain, even
   in the column the table is sorted by. */
.ui-stats td[data-quiet='true'] {
  color: var(--color-muted);
  font-weight: 400;
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
  /* In a box that narrow the cells of any table of statistics stand a step closer, as a
     standings table's do, so one more column is in view. */
  .ui-stats th,
  .ui-stats td {
    padding-inline: var(--step-2);
  }
  .ui-stats tr > :first-child {
    padding-inline-start: var(--step-4);
  }
  .ui-stats tr > :last-child {
    padding-inline-end: var(--step-4);
  }
  /* The name gives up what the shield takes, as a standings table's does. */
  .ui-stats[data-fold] .ui-team-cell > [dir] {
    max-inline-size: calc(45cqi - var(--step-6) - var(--step-3));
  }
  /* Every number column has one width, and the name column takes at least two fifths of the
     box and whatever is left over after the whole columns that fit beside it: so at rest the
     columns in view are whole (the games played and the column the table opens sorted by
     among them) and the first one to scroll to starts at the box's edge. A browser that
     cannot work out the leftover (mod) sizes the columns by their contents, and the far
     edge's fade still marks the column cut there. */
  .ui-stats {
    --ui-name-least: 40cqi;
    /* A table whose number columns all fit beside the name's two fifths at no less than a
       standings number column's width (the table says how many: sortable-stats-table.tsx)
       shares the room out and fits whole, with nothing to scroll; only a table with more
       columns than fit gives each one the fixed width. --ui-too-many is 0 when they fit and a
       great length when they do not, and --ui-few the other way round. */
    --ui-num-least: calc(var(--step-6) + var(--step-3));
    --ui-num-wide: calc(var(--step-7) + var(--step-3));
    --ui-share: calc((100cqi - var(--ui-name-least)) / var(--ui-cols, 99));
    --ui-too-many: clamp(0px, (var(--ui-num-least) - var(--ui-share)) * 100000, 100000px);
    --ui-few: clamp(0px, (var(--ui-share) - var(--ui-num-least) + 0.01px) * 100000, 100000px);
    --ui-num-col: max(
      min(var(--ui-num-wide), var(--ui-share)),
      min(var(--ui-too-many), var(--ui-num-wide))
    );
  }
  .ui-stats th,
  .ui-stats td {
    box-sizing: border-box;
  }
  .ui-stats .ui-num {
    inline-size: var(--ui-num-col);
    min-inline-size: var(--ui-num-col);
  }
  /* In a table that goes on, the last column in view stands clear of the far edge's fade:
     its figures by the fade's whole width, its heading ("3PM", in the small face) by all but
     a sliver, taking from its other side the room the sorted heading's arrow needs. */
  .ui-stats td.ui-num {
    padding-inline-end: max(var(--step-2), min(var(--ui-too-many), var(--step-4)));
  }
  .ui-stats th.ui-num {
    padding-inline: min(var(--ui-few), var(--step-1))
      max(var(--step-2), min(var(--ui-too-many), var(--step-3)));
  }
  .ui-stats .ui-team-cell {
    /* A table whose columns all fit beside the name gives the name the rest, and fits. */
    --ui-name-col: max(
      calc(
        var(--ui-name-least) + mod(100cqi - var(--ui-name-least), var(--ui-num-col)) -
          var(--ui-few)
      ),
      calc(100cqi - var(--ui-cols, 99) * var(--ui-num-col))
    );
    inline-size: var(--ui-name-col);
    /* In a table that fits, the name gives up the little a heading needs beyond its share
       (the sorted one's arrow), so the table is never wider than its box. */
    min-inline-size: calc(var(--ui-name-col) - var(--ui-few));
  }
  .ui-table.ui-stats {
    inline-size: 100%;
  }
  /* The name's words: the column less its two paddings, the shield and its gap. */
  .ui-table.ui-stats .ui-team-cell > [dir] {
    max-inline-size: calc(
      var(--ui-name-col) - var(--step-4) - var(--step-2) - var(--step-5) - var(--step-1) -
        var(--step-2)
    );
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
  /* Room inside the button for the keyboard's ring, which is drawn inside it (below), taken
     back outside it: the heading stands where it stood, and the ring never lies on its
     letters. */
  padding-inline: var(--step-2);
  margin-inline: calc(-1 * var(--step-2));
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
/* A standings table on a phone-wide page: the place, the team and the columns marked to be
   in view (the record and what the table is ordered by) fill the box exactly, with nothing
   to scroll; a column left to the wide layout is not drawn, and any other is reached by
   scrolling inside the box, starting at its edge, so no column stands half in view at rest.
   Every number column has one width, and the team column takes what is left (the table
   says how many columns are in view and whether it has places: standings-table.tsx), so
   the columns of every division stand under each other. The page's width decides, not the
   box's, so a laptop's narrow home column keeps its layout. */
/* Worked out once, on the table, in the table's own face: a cell in a smaller face (the
   headings) inherits the length rather than working out a narrower one of its own. */
@property --ui-last-col {
  syntax: '<length>';
  inherits: true;
  initial-value: 0px;
}
/* A left-out column's second copy, after the in-view ones, is drawn only there. */
.ui-standings .ui-moved {
  display: none;
}
/* The least the team column holds: a name's longest single word of about eleven letters,
   in the table's own face, worked out once on the table like the last column. */
@property --ui-name-least {
  syntax: '<length>';
  inherits: true;
  initial-value: 0px;
}
@media (max-width: 30rem) {
  .ui-standings[data-narrow] {
    --ui-num-col: calc(var(--step-6) + var(--step-1));
    /* The last column in view (what the table is ordered by: a percentage such as "1.000",
       or the points) is wide enough for five figures in the table's own face, whatever that
       face is, and the fade's width after them, so it never grows past its share and stands
       half out of the box, and no figure of it is faded. */
    --ui-last-col: max(var(--ui-num-col), calc(5ch + 6 * var(--step-1)));
    --ui-place-col: var(--step-7);
    /* Beside the name's words: the column's two paddings, the shield and its gap. */
    --ui-name-beside: calc(2 * var(--step-2) + var(--step-5) + var(--step-1) + var(--step-2));
    --ui-name-least: calc(11ch + var(--ui-name-beside));
    /* What the box leaves the name beside the place and every column in view. */
    --ui-name-fit: calc(
      100cqi - var(--ui-seed-col, 0) * var(--ui-place-col) - (var(--ui-in-view, 1) - 1) *
        var(--ui-num-col) - var(--ui-last-col)
    );
    /* Too narrow for that least: the last column in view (the percentage, or the points)
       joins the columns scrolled to, starting at the box's edge, and the name has its room
       but for the fade's room kept at the end of the column before it. A name is never
       squeezed below its least: its words wrap between them, never inside one. Here
       --ui-too-many is 0 when the name fits beside them all and a great length when not. */
    --ui-too-many: clamp(
      0px,
      (var(--ui-name-least) - var(--ui-name-fit)) * 100000,
      100000px
    );
    --ui-name-col: max(
      var(--ui-name-least),
      calc(
        var(--ui-name-fit) + min(var(--ui-too-many), calc(var(--ui-last-col) - var(--step-3)))
      )
    );
    /* The name's own words: the column less what stands beside them. */
    --ui-name-words: calc(var(--ui-name-col) - var(--ui-name-beside));
  }
  .ui-standings[data-narrow] .ui-left-out {
    display: none;
  }
  .ui-standings[data-narrow] .ui-moved {
    display: table-cell;
  }
  .ui-standings[data-narrow] th,
  .ui-standings[data-narrow] td {
    box-sizing: border-box;
  }
  /* A number column holds three or four figures; its cells stand a step closer still. */
  .ui-standings[data-narrow] .ui-num,
  .ui-standings[data-narrow] tr > .ui-num:last-child {
    inline-size: var(--ui-num-col);
    min-inline-size: var(--ui-num-col);
    padding-inline: var(--step-1);
  }
  .ui-standings[data-narrow] .ui-num.ui-last-in-view {
    inline-size: var(--ui-last-col);
    min-inline-size: var(--ui-last-col);
    /* Its figures stand clear of the far edge's fade, which lies over it while the table
       goes on (to the columns reached by scrolling). */
    padding-inline: var(--step-1) var(--step-4);
  }
  /* Then the column before it is the last in view, and its figures keep clear of the fade. */
  .ui-standings[data-narrow] .ui-num.ui-next-to-last {
    inline-size: calc(var(--ui-num-col) + min(var(--ui-too-many), var(--step-3)));
    min-inline-size: calc(var(--ui-num-col) + min(var(--ui-too-many), var(--step-3)));
    padding-inline-end: max(var(--step-1), min(var(--ui-too-many), var(--step-4)));
  }
  .ui-standings[data-narrow] tr > .ui-num:first-child {
    inline-size: var(--ui-place-col);
    min-inline-size: var(--ui-place-col);
    padding-inline: var(--step-2) var(--step-1);
  }
  .ui-table.ui-standings[data-narrow] .ui-team-cell {
    padding-inline: var(--step-2);
  }
  .ui-table.ui-standings[data-narrow] .ui-team-cell,
  .ui-table.ui-standings[data-narrow][data-emblems='true'] .ui-team-cell {
    inline-size: var(--ui-name-col);
    min-inline-size: var(--ui-name-col);
  }
  .ui-table.ui-standings[data-narrow] .ui-team-cell > [dir],
  .ui-table.ui-standings[data-narrow][data-emblems='true'] .ui-team-cell > [dir] {
    max-inline-size: var(--ui-name-words);
  }
  /* There a note's mark takes its own room in the line, after the last word, and no room is
     kept for it beside the name: the name has the whole width, so a word is not broken. */
  .ui-table.ui-standings[data-narrow] .ui-team-cell > [dir]:has(> .ui-note-mark),
  .ui-table.ui-standings[data-narrow][data-emblems='true'] .ui-team-cell > [dir]:has(> .ui-note-mark) {
    max-inline-size: var(--ui-name-words);
    padding-inline-end: 0;
  }
  .ui-table.ui-standings[data-narrow] .ui-team-cell > [dir]:has(> .ui-note-mark) > .ui-note-mark:last-child a {
    margin-inline-end: 0;
  }
}
`;
