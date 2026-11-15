// A game, small and large: the state pills, the game card and the scoreboard
// (docs/build/DESIGN.md, section 4, lines 6 and 10 to 12). The highlight is spent here on
// three things only: the Live pill and the winner's score on a card and on a scoreboard.
export const gameCss = String.raw`
.ui-live {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: var(--step-1);
  /* A pill is one step of the scale high (24), with its words centered in it. */
  min-block-size: var(--step-5);
  padding-block: 0;
  padding-inline: var(--step-2);
  border-radius: var(--radius-pill);
  background: var(--color-highlight);
  color: var(--color-on-highlight);
  font-size: var(--text-12);
  font-weight: 700;
  letter-spacing: 0.08em;
  line-height: 1.5;
  text-transform: uppercase;
  white-space: nowrap;
}
.ui-live-dot {
  inline-size: 0.5em;
  block-size: 0.5em;
  border-radius: 50%;
  background: currentColor;
  animation: ui-live-pulse 1.4s ease-in-out infinite;
}
@keyframes ui-live-pulse {
  50% {
    opacity: 0.25;
  }
}
@media (prefers-reduced-motion: reduce) {
  .ui-live-dot {
    animation: none;
  }
}
.ui-game-state {
  display: inline-flex;
  flex: none;
  align-items: center;
  min-block-size: var(--step-5);
  padding-block: 0;
  padding-inline: var(--step-2);
  border: 1px solid var(--color-line-strong);
  border-radius: var(--radius-pill);
  color: var(--color-text);
  font-size: var(--text-12);
  font-weight: 700;
  letter-spacing: 0.08em;
  line-height: 1.5;
  text-transform: uppercase;
  white-space: nowrap;
}

/* A team's own color, as a small chip beside its name. */
.ui-team-chip {
  flex: none;
  inline-size: var(--step-3);
  block-size: var(--step-3);
  border-radius: 50%;
  background: var(--team-color, var(--color-line-strong));
  box-shadow: 0 0 0 1px var(--color-line-strong);
}

.ui-game-card {
  position: relative;
  display: grid;
  /* The top line takes what it needs and the teams sit at the foot, so in a row of cards the
     team rows line up whether or not a card has a place to name. */
  grid-template-rows: auto 1fr;
  gap: var(--step-3);
  inline-size: 100%;
  padding-block: var(--step-4);
  padding-inline: var(--space);
  background: var(--color-panel);
  color: var(--color-text);
  border: var(--card-border-width) solid var(--color-line);
  border-radius: var(--radius);
  box-shadow: var(--card-shadow);
  transition: border-color 0.15s;
}
.ui-game-card:has(.ui-game-link):hover {
  border-color: var(--color-primary);
}
.ui-game-meta {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  /* The first line is as tall as a state pill whether or not the game has one. */
  grid-template-rows: minmax(var(--step-5), auto);
  align-items: center;
  align-content: start;
  gap: var(--step-1) var(--step-3);
  color: var(--color-muted);
  font-size: var(--text-12);
  line-height: 1.5;
}
.ui-game-about {
  min-inline-size: 0;
}
/* Where the game is played: always a line of its own, under when. */
.ui-game-place {
  grid-column: 1 / -1;
  min-inline-size: 0;
}
.ui-game-number {
  margin-inline-end: var(--step-2);
  color: var(--color-accent-text);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.ui-game-teams {
  display: grid;
  align-self: end;
  gap: var(--step-2);
  margin: 0;
  padding: 0;
  list-style: none;
}
.ui-game-team {
  display: flex;
  align-items: center;
  gap: var(--step-3);
  min-block-size: var(--step-6);
}
.ui-game-team-name {
  flex: 1 1 auto;
  min-inline-size: 0;
  font-size: var(--text-16);
  line-height: 1.25;
}
.ui-game-team[data-winner='true'] {
  font-weight: 700;
}
.ui-game-team-score {
  flex: none;
  min-inline-size: 2ch;
  font-size: var(--text-22);
  font-variant-numeric: lining-nums tabular-nums;
  line-height: 1;
  text-align: end;
}
.ui-game-team[data-winner='true'] .ui-game-team-score {
  color: var(--color-highlight);
}
/* The whole card is the link to the game. Its words stay for screen readers and are
   pushed out of sight; the card itself shows where you are going. */
.ui-game-link {
  position: absolute;
  inset: 0;
  overflow: hidden;
  border-radius: var(--radius);
  color: var(--color-text);
  text-decoration: none;
  text-indent: 200%;
  white-space: nowrap;
}

/* A quiet word where a state's pill would be: "Awaiting result". "Final" is as quiet: a
   decided game says so by its score, and its pill is never the loudest mark on its card. */
.ui-game-state[data-kind='quiet'],
.ui-game-card[data-status='final'] .ui-game-state,
.ui-scoreboard[data-pill='quiet'] .ui-game-state {
  border-color: var(--color-line);
  background: transparent;
  color: var(--color-muted);
  font-weight: 600;
}
/* A game that was put off, called off or forfeited wears a soft tint of the league's main
   color (no more of it than every text is fitted to), its words in the accent and its
   edge a line of the accent at a line's strength (DESIGN.md, section 4, line 17): on a
   game's card, on the big board of its page, and beside a round's name ("1 game
   postponed"). */
.ui-game-card:is([data-status='postponed'], [data-status='cancelled'], [data-status='forfeit'])
  .ui-game-state,
.ui-scoreboard:not([data-pill='quiet']) .ui-game-state,
.ui-group .ui-group-mark[data-kind='note'] {
  border-color: color-mix(in srgb, var(--color-accent) 25%, transparent);
  background: var(--color-tint);
  color: var(--color-accent-text);
}

/* A game as a scoreboard: an emblem and a name on each side, the score or "VS" large
   between them, a quiet line above (which game, when, its state) and below (where). The
   card is the measure of what is in it: where it is too narrow for two teams side by
   side, they stand one over the other. */
.ui-game-card[data-layout='board'] {
  grid-template-rows: auto 1fr auto;
  gap: 0;
  padding-block: var(--step-4);
  padding-inline: var(--step-5);
  /* Over the panel's own color: in a dark design a little of the main color at one corner
     (never more than the texts are fitted to); in a light one nothing, so cards and tables
     are one tint (packages/site, frame-look.ts). */
  background-image: linear-gradient(120deg, var(--card-wash), var(--color-panel) 70%);
  /* A fine line at the card's top in the league's color of decoration. */
  border-block-start: var(--line-heavy) solid var(--color-ornament-line);
  transition:
    border-color 0.15s,
    transform 0.15s;
}
/* The card's top line and its middle part are the measures its pieces size themselves by
   (both named "card", each as wide as the card's inside): where a piece is too narrow or
   has room, it is by one of these. The card itself is no measure, so that it can share
   the heights of its three parts with the cards beside it (the list's rule, below): a
   browser does not let a box that is a measure lend its rows to its neighbors. */
.ui-game-card[data-layout='board'] .ui-game-meta,
.ui-game-body {
  min-inline-size: 0;
  container: card / inline-size;
}
.ui-game-card[data-layout='board']:has(.ui-game-link):hover {
  border-color: color-mix(in srgb, var(--color-pop) 55%, transparent);
}
/* The card lifts a little under the pointer, for readers who have not asked for less
   movement. */
@media (prefers-reduced-motion: no-preference) {
  .ui-game-card[data-layout='board']:has(.ui-game-link):hover {
    transform: translateY(-2px);
  }
}
/* The quiet line above: which game and when, and its state. A date and a time never break
   inside themselves: when the line cannot hold both them and the state's pill, the pill
   takes a line of its own. */
.ui-game-card[data-layout='board'] .ui-game-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--step-1) var(--step-3);
  padding-block-end: var(--step-3);
  border-block-end: 1px solid var(--color-line);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.ui-game-card[data-layout='board'] .ui-game-about {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0 var(--step-2);
  min-block-size: var(--step-5);
}
.ui-game-card[data-layout='board'] .ui-game-number {
  margin-inline-end: 0;
}
.ui-game-card[data-layout='board'] :is(.ui-game-number, .ui-game-when) {
  white-space: nowrap;
}
/* In a card as narrow as a small phone's the pill always has a line of its own under the
   date, so it stands in one place on every card of a list, whatever the date's length. A
   wider card (a phone of 390, three across on a laptop) holds the date and the pill on
   one line. */
@container card (max-width: 16.99rem) {
  .ui-game-card[data-layout='board'] .ui-game-about {
    flex-basis: 100%;
  }
}
/* The two teams sit side by side with what stands between them, or, when they cannot,
   one over the other. The board works out the width they need side by side: each side
   has room for the longer of the two names (the card counts its letters, a name of
   several words taking two lines: --letters), at the width of a letter in the design's
   heading face (--heading-letter) and the size the names are set in (--board-name); the
   middle has room for "VS", or for the score's figures (--figures).

   The board is the measure (100cqi is its width). --board-short is more than nothing only
   when the board is narrower than that sum, and --board-room only when it is not: each is
   the difference times a large number, so a width held between nothing and one of them is
   either nothing or all of it. That is how the same board is drawn two ways with no
   script:
   - with room: emblem over name on each side, the score or "VS" large between them;
   - short of it: two rows, each team's emblem and name at the start and its own score at
     the end, so nobody has to work out whose number is whose, and nothing between them.
   The two sums are for the board's own children (the sides and what stands between them).
   What stands inside a side is laid out by the side's share of the board instead (below):
   a side is a measure of its own, so 100cqi inside it would be the side's width. */
.ui-game-board {
  --board-gap: var(--step-3);
  --board-figure: var(--text-28);
  --board-name: var(--text-18);
  --board-side: calc(var(--letters, 8) * var(--heading-letter, 0.6) * var(--board-name));
  --board-middle: var(--step-6);
  --board-needs: calc(2 * var(--board-side) + var(--board-middle) + 2 * var(--board-gap));
  --board-short: calc((var(--board-needs) - 100cqi) * 999);
  --board-room: calc((100cqi - var(--board-needs)) * 999);
  display: flex;
  flex-wrap: wrap;
  /* What stands between the sides is level with their middle; the sides themselves begin
     at the top (below), and in a board taller than its teams (a row of cards shares its
     tallest board's height) the teams stay at the top, not spread down it. */
  align-items: center;
  align-content: flex-start;
  justify-content: center;
  /* Between the two rows, and (the same step --board-gap names) between the sides. */
  gap: var(--step-2) var(--step-3);
  /* In a card with a whole row to itself the two teams are kept within reach of each
     other, in the middle of the card. */
  inline-size: 100%;
  max-inline-size: calc(10 * var(--step-8));
  margin-inline: auto;
  padding-block: var(--step-5);
  container: board / inline-size;
}
/* The middle holds a score's figures in a board that has a score, and in every board of a
   list where any has one (the list says so), so the boards of one list are drawn alike. */
.ui-game-board:is([data-scored='true'], [data-room='scored']) {
  --board-middle: calc(var(--figures, 4) * 0.65 * var(--board-figure) + var(--step-5));
}
/* A side takes the whole row when the board is short of room, and shares what the middle
   leaves when it is not. It is a measure of its own, named "side": what stands in it is
   laid out by how much of the board the side has (the rule after these). */
.ui-game-side {
  display: flex;
  flex: 1 1 var(--board-short);
  /* A side begins at the top of its board, so the shields of a row of cards stand on one
     line even where one card's name takes two lines and its neighbors' one. */
  align-self: flex-start;
  align-items: center;
  gap: var(--step-3);
  min-inline-size: 0;
  container: side / inline-size;
}
/* The team: its emblem and its name. With room, the name stands under the emblem, both in
   the middle of the side. */
.ui-game-side-team {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  align-items: center;
  gap: var(--step-2);
  min-inline-size: 0;
  text-align: center;
}
.ui-game-board .ui-emblem {
  flex: none;
  block-size: var(--step-7);
}
/* A team's own score, at the end of its row: drawn only when the board is two rows. */
.ui-game-side-score {
  display: none;
  flex: none;
  color: var(--color-pop);
  font-family: var(--font-score);
  font-size: var(--text-28);
  font-weight: var(--display-weight);
  font-variant-numeric: lining-nums tabular-nums;
  line-height: 1.4;
  white-space: nowrap;
}
/* What stands between the sides, the score or "VS": there only when the board has room.
   Short of it, it has no width and no height, and its line between the two rows is no
   line at all. */
.ui-game-middle {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
}
.ui-game-middle > * {
  flex: none;
  max-inline-size: clamp(0px, var(--board-room), 20rem);
  max-block-size: clamp(0px, var(--board-room), 6rem);
  overflow: hidden;
}
.ui-game-card[data-layout='board'] .ui-game-team-name {
  /* Only as wide as its words, and never wider than the room it is given. */
  flex: 0 1 auto;
  min-inline-size: 0;
  max-inline-size: 100%;
  font-family: var(--font-heading);
  font-size: var(--text-18);
  font-weight: var(--heading-weight);
  letter-spacing: var(--heading-tracking);
  line-height: 1.2;
  /* A long name wraps under itself between its words, and only there: a word is never
     split. A word too long even for a line of its own is cut short with "…". */
  overflow-wrap: normal;
  hyphens: manual;
  overflow-x: clip;
  text-overflow: ellipsis;
  text-wrap: balance;
}
/* The winner is said in words (kept for screen readers), by the weight of its name and
   its score, and by a bar under its score: never by color alone. */
.ui-game-side[data-winner='true'] .ui-game-team-name {
  font-weight: 700;
}
.ui-game-versus {
  margin: 0;
  color: var(--color-muted);
  font-family: var(--font-heading);
  font-size: var(--text-14);
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
/* A score is compared digit by digit with the one beside it: lining, even-width figures,
   in a face that has them (--font-score), and the largest thing in its card. */
.ui-game-score {
  display: flex;
  align-items: baseline;
  gap: var(--step-2);
  margin: 0;
  color: var(--color-pop);
  font-family: var(--font-score);
  font-size: var(--text-28);
  font-weight: var(--display-weight);
  font-variant-numeric: lining-nums tabular-nums;
  line-height: 1;
  white-space: nowrap;
}
.ui-game-score > span {
  padding-block-end: var(--step-1);
  border-block-end: var(--line-heavy) solid transparent;
}
.ui-game-score-colon {
  color: var(--color-muted);
}
/* The bar under the winner's score is in the league's color of decoration (its gold, where
   it has one), which need not be read. */
.ui-game-score > [data-winner='true'] {
  border-block-end-color: var(--color-ornament);
  font-weight: 600;
}
.ui-game-side[data-winner='true'] .ui-game-side-score {
  font-weight: 600;
  text-decoration: underline var(--line-heavy) var(--color-ornament);
  text-underline-offset: 0.2em;
}
/* Once a game is decided only the winner's score keeps the color the eye lands on, and
   the other is set lighter than it in every face. */
.ui-game-card:is([data-status='final'], [data-status='forfeit'])
  .ui-game-score
  > span:not([data-winner], .ui-game-score-colon),
.ui-game-card:is([data-status='final'], [data-status='forfeit'])
  .ui-game-side:not([data-winner])
  .ui-game-side-score {
  color: var(--color-text);
  font-weight: 400;
}
.ui-game-foot {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--step-2);
  padding-block-start: var(--step-3);
  border-block-start: 1px solid var(--color-line);
  color: var(--color-muted);
  font-size: var(--text-12);
  line-height: 1.5;
  text-align: center;
}
.ui-game-foot::before {
  content: '';
  flex: none;
  inline-size: var(--step-4);
  block-size: var(--step-4);
  background: currentColor;
  -webkit-mask: var(--ui-pin) center / contain no-repeat;
  mask: var(--ui-pin) center / contain no-repeat;
}
/* Where the card has the room, everything on the board is a step larger (the card is the
   measure here, by its name, not the board inside it). */
@container card (min-width: 26rem) {
  .ui-game-board {
    --board-gap: var(--step-5);
    --board-figure: var(--text-36);
    gap: var(--step-2) var(--step-5);
    padding-inline: var(--step-3);
  }
  .ui-game-board .ui-emblem {
    block-size: calc(var(--step-7) + var(--step-2));
  }
  .ui-game-score {
    font-size: var(--text-36);
  }
}
/* The board picked out from the others: the game being played now. */
.ui-game-card[data-featured='true'] {
  border-color: color-mix(in srgb, var(--color-pop) 45%, transparent);
  box-shadow: var(--overlay-shadow);
}
.ui-game-card[data-featured='true'] .ui-emblem {
  block-size: var(--step-8);
}
/* The board as two rows. A side that has the whole board to itself (side by side it has
   less than half; 75cqi here is three quarters of the board, the side's own measure) lays
   its team out in a line from the start of the row: a small emblem, then the name, which
   wraps under itself from the start, as the name in the other row does; and its own score
   is drawn at the end. */
@container side (min-width: 75cqi) {
  .ui-game-side-team {
    flex-direction: row;
    gap: var(--step-3);
    text-align: start;
  }
  .ui-game-card[data-layout='board'] .ui-game-side .ui-emblem {
    block-size: var(--step-6);
  }
  .ui-game-side-score {
    display: block;
  }
}
/* Its figures are a step larger wherever its card has the room for them and both names. */
@container card (min-width: 25rem) {
  .ui-game-card[data-featured='true'] .ui-game-board {
    --board-figure: var(--text-48);
  }
  .ui-game-card[data-featured='true'] .ui-game-score {
    font-size: var(--text-48);
  }
}
/* And its names, in a card wider still: the board's sum is told the size they are set in. */
@container card (min-width: 34rem) {
  .ui-game-card[data-featured='true'] .ui-game-board {
    --board-name: var(--text-22);
  }
  .ui-game-card[data-featured='true'] .ui-game-team-name {
    font-size: var(--text-22);
  }
}
/* A list of boards: one across on a phone; from a tablet up two across where the list
   has the page's width, and a board left over takes the whole row, so no card ever has
   a hole beside it. */
.ui-card-grid[data-layout='board'] {
  grid-template-columns: minmax(0, 1fr);
}
@media (min-width: 48rem) {
  .ui-card-grid[data-layout='board'][data-across='two'] {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--step-5);
  }
  .ui-card-grid[data-layout='board'][data-across='two'] > li:last-child:nth-child(odd) {
    grid-column: 1 / -1;
  }
}
/* A list in a column narrower than the page (a team's games beside its roster): two
   across from a tablet up. */
@media (min-width: 48rem) {
  .ui-card-grid[data-layout='board'][data-across='pair'] {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--step-5);
  }
  /* A board left over keeps the size of the others, so the oldest game of a list is never
     its biggest; only a board that is the whole list has the row. */
  .ui-card-grid[data-layout='board'][data-across='pair'] > li:only-child {
    grid-column: 1 / -1;
  }
}
/* On a laptop a board left over is not stretched across the page: an odd number of boards
   ends with three in a row, each a third of it (three boards are one row of three, five
   are two and three). Only a board that is the whole list has the row to itself. */
@media (min-width: 64rem) {
  .ui-card-grid[data-layout='board'][data-across='two'] {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }
  .ui-card-grid[data-layout='board'][data-across='two'] > li {
    grid-column: span 3;
  }
  .ui-card-grid[data-layout='board'][data-across='two'] > li:nth-last-child(3):nth-child(odd),
  .ui-card-grid[data-layout='board'][data-across='two'] > li:nth-last-child(3):nth-child(odd) ~ li {
    grid-column: span 2;
  }
  .ui-card-grid[data-layout='board'][data-across='two'] > li:only-child {
    grid-column: 1 / -1;
  }
}
/* The cards of one row share the heights of their three parts (the top line, the middle,
   the place): a row that holds a card whose pill took a second line gives every card of
   that row the same top line, so shields, names and scores stand on one line across the
   row; a row with no such card stays as short as it was. Each card lends its three rows
   to the list (a card is three rows of the list's grid), so the space between the rows
   of cards is the card's own margin, taken back after the last row. Where a browser does
   not know how, a card's top line takes what it needs and its middle the rest, as on a
   phone. */
@supports (grid-template-rows: subgrid) {
  @media (min-width: 48rem) {
    .ui-card-grid[data-layout='board']:is([data-across='two'], [data-across='pair']) {
      row-gap: 0;
      margin-block-end: calc(-1 * var(--step-5));
    }
    .ui-card-grid[data-layout='board']:is([data-across='two'], [data-across='pair']) > li {
      grid-row: span 3;
      grid-template-rows: subgrid;
      margin-block-end: var(--step-5);
    }
    .ui-card-grid[data-layout='board']:is([data-across='two'], [data-across='pair'])
      > li
      > .ui-game-card {
      grid-row: 1 / -1;
      grid-template-rows: subgrid;
    }
  }
}

/* The big board of a game's page. The teams and what stands between them are held to a
   width the eye takes in at once, however wide the panel is. */
.ui-scoreboard {
  padding-block: var(--step-5);
  padding-inline: var(--space);
  /* As a game's card: the panel, warmed at one corner in a dark design, with the fine line
     of the league's color of decoration at its top. */
  background-color: var(--color-panel);
  background-image: linear-gradient(120deg, var(--card-wash), var(--color-panel) 70%);
  color: var(--color-text);
  border: var(--card-border-width) solid var(--color-line);
  border-block-start: var(--line-heavy) solid var(--color-ornament-line);
  border-radius: var(--radius);
  box-shadow: var(--card-shadow);
  text-align: center;
}
/* On a phone the state of the game (its pill and clock, or when it will be played) has a
   quiet line of its own above the two teams, so nothing stands between their names and
   each has half the board; from a tablet up it stands between them. Each team's label,
   name and score sit on the same three lines as the other's, even when a long name wraps. */
.ui-scoreboard-teams {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  grid-template-rows: auto;
  gap: var(--step-2) var(--step-4);
  max-inline-size: 40rem;
  margin-inline: auto;
}
.ui-scoreboard-side {
  display: grid;
  grid-row: 2 / span 3;
  /* One column exactly as wide as the team's half: a long name wraps inside it and can
     never push into the other team's. */
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: subgrid;
  justify-items: center;
  gap: var(--step-2);
  min-inline-size: 0;
}
.ui-scoreboard-middle {
  display: flex;
  flex-wrap: wrap;
  grid-column: 1 / -1;
  grid-row: 1;
  align-items: center;
  justify-content: center;
  gap: var(--step-1) var(--step-3);
  margin-block-end: var(--step-2);
}
.ui-scoreboard-middle:empty {
  display: none;
}
@media (min-width: 40rem) {
  .ui-scoreboard-teams {
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    column-gap: var(--step-5);
  }
  .ui-scoreboard-side {
    grid-row: 1 / span 3;
  }
  .ui-scoreboard-side:last-child {
    grid-column: 3;
  }
  .ui-scoreboard-middle {
    display: grid;
    grid-column: 2;
    grid-row: 1 / span 3;
    align-self: center;
    justify-items: center;
    gap: var(--step-2);
    max-inline-size: 12rem;
    margin-block-end: 0;
    text-wrap: balance;
  }
}
/* On a laptop the board is a game's card made large and uses its width: each team's
   shield and name at an end, and between them the two scores with the state of the game
   in the middle, as "49 : 56" stands between the teams on a card. A team's own box is
   dissolved for this (its parts are placed on the board's own grid); nothing in the page
   changes, and a screen reader still hears each team with its score. */
@media (min-width: 64rem) {
  .ui-scoreboard-teams {
    grid-template-columns: minmax(0, 1fr) auto auto auto minmax(0, 1fr);
    grid-template-rows: auto auto;
    align-items: center;
    justify-items: center;
    column-gap: var(--step-6);
    max-inline-size: 60rem;
  }
  .ui-scoreboard-side {
    display: contents;
  }
  .ui-scoreboard-side > .ui-scoreboard-role {
    grid-row: 1;
    align-self: end;
  }
  .ui-scoreboard-side > .ui-scoreboard-name {
    grid-row: 2;
    align-self: start;
  }
  .ui-scoreboard-side:first-child > :is(.ui-scoreboard-role, .ui-scoreboard-name) {
    grid-column: 1;
  }
  .ui-scoreboard-side:last-child > :is(.ui-scoreboard-role, .ui-scoreboard-name) {
    grid-column: 5;
  }
  .ui-scoreboard-side > .ui-scoreboard-score {
    grid-row: 1 / span 2;
    align-self: center;
  }
  .ui-scoreboard-side:first-child > .ui-scoreboard-score {
    grid-column: 2;
  }
  .ui-scoreboard-side:last-child > .ui-scoreboard-score {
    grid-column: 4;
  }
  .ui-scoreboard-middle {
    grid-column: 3;
    grid-row: 1 / span 2;
  }
}
.ui-scoreboard-role {
  color: var(--color-muted);
  font-size: var(--text-12);
  font-weight: 600;
  letter-spacing: var(--label-tracking);
  text-transform: uppercase;
}
.ui-scoreboard-name {
  display: flex;
  /* The team's shield stands over its name, both in the middle of the team's half. */
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: var(--step-3);
  max-inline-size: 100%;
  font-family: var(--font-heading);
  /* One step smaller on a phone, where a team has half the board for its name. */
  font-size: var(--text-16);
  font-weight: 700;
  letter-spacing: var(--heading-tracking);
  line-height: 1.2;
  text-transform: var(--heading-case);
}
@media (min-width: 40rem) {
  .ui-scoreboard-name {
    font-size: var(--text-18);
  }
}
/* A long name wraps under itself beside its chip, whole words first; a word too long for
   its half is broken at a syllable, with a hyphen, where the browser knows the language. */
.ui-scoreboard-name > [dir] {
  min-inline-size: 0;
  overflow-wrap: break-word;
  hyphens: auto;
  text-wrap: balance;
}
/* The winner of a decided game is the name in bold, as on a game's card; the other is not. */
.ui-scoreboard[data-state='final'] .ui-scoreboard-side:not([data-winner='true']) .ui-scoreboard-name {
  font-weight: 400;
}
@media (min-width: 48rem) {
  .ui-scoreboard-name {
    font-size: var(--text-22);
  }
}
/* A score is set in a face whose figures are lining and even-width (--font-score): two
   scores side by side are compared digit by digit. It is the largest thing on the page and
   is in the color the eye lands on: both scores while the game is played, and once it is
   decided only the winner's, with a bar under it in the league's color of decoration.
   Its weights are the score face's own, plain numbers every score face has (not the
   heading face's display weight, which may be heavier than a winner's): a score still
   being played is 600, and once the game is decided the winner's is 700 and the other's
   400, so the winner is the heavier in every design. */
.ui-scoreboard-score {
  justify-self: center;
  padding-block-end: var(--step-1);
  border-block-end: var(--line-heavy) solid transparent;
  font-family: var(--font-score);
  font-size: var(--text-48);
  font-weight: 600;
  line-height: 1;
  font-variant-numeric: lining-nums tabular-nums;
  color: var(--color-pop);
}
.ui-scoreboard[data-state='final'] .ui-scoreboard-side:not([data-winner='true']) .ui-scoreboard-score {
  color: var(--color-text);
  font-weight: 400;
}
.ui-scoreboard-side[data-winner='true'] .ui-scoreboard-score {
  border-block-end-color: var(--color-ornament);
  font-weight: 700;
}
.ui-scoreboard .ui-emblem {
  block-size: var(--step-8);
}
@media (min-width: 48rem) {
  .ui-scoreboard {
    padding-block: var(--step-6);
  }
  .ui-scoreboard-score {
    font-size: var(--text-64);
  }
  .ui-scoreboard .ui-emblem {
    block-size: calc(var(--step-8) + var(--step-5));
  }
}
.ui-scoreboard-period {
  color: var(--color-muted);
  font-size: var(--text-14);
  font-variant-numeric: lining-nums tabular-nums;
  white-space: nowrap;
}
/* A game still to play: its day, and its time the larger of the two; side by side on a
   phone's one line, one over the other between the teams. */
.ui-scoreboard-when {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: center;
  gap: var(--step-1) var(--step-2);
  font-variant-numeric: lining-nums tabular-nums;
}
@media (min-width: 40rem) {
  .ui-scoreboard-when {
    display: grid;
    justify-items: center;
  }
}
.ui-scoreboard-day {
  color: var(--color-muted);
  font-size: var(--text-14);
}
.ui-scoreboard-time {
  font-size: var(--text-18);
  font-weight: 700;
  line-height: 1.2;
  white-space: nowrap;
}
@media (min-width: 48rem) {
  .ui-scoreboard-time {
    font-size: var(--text-22);
  }
}
/* Under the teams, quietly: where the game is played, and what else the page has to say. */
.ui-scoreboard-foot > * {
  margin-block: var(--step-1) 0;
  margin-inline: auto;
  max-inline-size: 40rem;
  color: var(--color-muted);
  font-size: var(--text-14);
  /* A line too long for a phone breaks in the middle, never leaving one word alone. */
  text-wrap: balance;
}
.ui-scoreboard-foot > :first-child {
  margin-block-start: var(--step-4);
}
.ui-scoreboard-foot > .ui-scoreboard-note {
  color: var(--color-text);
}

/* One play of a game: its team's color, then the play in words, which wrap under themselves. */
.ui-play {
  display: grid;
  grid-template-columns: var(--step-3) minmax(0, 1fr);
  align-items: baseline;
  gap: var(--step-2);
}
.ui-play-mark {
  display: flex;
}
.ui-table .ui-play .ui-team-chip {
  margin: 0;
}
.ui-plays tr[data-scored='true'] > .ui-num:last-child {
  font-weight: 700;
}
`;
