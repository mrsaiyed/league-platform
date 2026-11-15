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

/* A quiet word where a state's pill would be: "Awaiting result". */
.ui-game-state[data-kind='quiet'] {
  border-color: var(--color-line);
  color: var(--color-muted);
  font-weight: 600;
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
  /* Over the panel's own color: a little of the main color at one corner, never more than
     the texts are fitted to (packages/site, hoverTintShare). */
  background-image: linear-gradient(
    120deg,
    color-mix(in srgb, var(--color-primary) 9%, var(--color-panel)),
    var(--color-panel) 70%
  );
  container-type: inline-size;
  transition:
    border-color 0.15s,
    transform 0.15s;
}
.ui-game-card[data-layout='board']:has(.ui-game-link):hover {
  border-color: color-mix(in srgb, var(--color-pop) 55%, transparent);
  transform: translateY(-2px);
}
.ui-game-card[data-layout='board'] .ui-game-meta {
  padding-block-end: var(--step-3);
  border-block-end: 1px solid var(--color-line);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.ui-game-board {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: var(--step-3);
  padding-block: var(--step-5);
}
.ui-game-side {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  justify-items: center;
  gap: var(--step-2);
  min-inline-size: 0;
  text-align: center;
}
.ui-game-card[data-layout='board'] .ui-game-team-name {
  max-inline-size: 100%;
  font-family: var(--font-heading);
  font-size: var(--text-18);
  font-weight: var(--heading-weight);
  letter-spacing: var(--heading-tracking);
  line-height: 1.2;
  /* A long name wraps under itself, whole words first; a word too long for its side is
     broken at a syllable, with a hyphen, where the browser knows the language. */
  overflow-wrap: break-word;
  hyphens: auto;
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
  border-block-end: 2px solid transparent;
}
.ui-game-score-colon {
  color: var(--color-muted);
}
.ui-game-score > [data-winner='true'] {
  border-block-end-color: currentColor;
  font-weight: 600;
}
/* Once a game is decided only the winner's score keeps the color the eye lands on, and
   the other is set lighter than it in every face. */
.ui-game-card:is([data-status='final'], [data-status='forfeit'])
  .ui-game-score
  > span:not([data-winner], .ui-game-score-colon) {
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
/* Where the card has the room, everything on the board is a step larger. */
@container (min-width: 26rem) {
  .ui-game-board {
    gap: var(--step-5);
    padding-inline: var(--step-3);
  }
  .ui-game-board .ui-emblem {
    block-size: calc(var(--step-7) + var(--step-2));
  }
  .ui-game-score {
    font-size: var(--text-36);
  }
}
/* Two teams that cannot sit side by side stand one over the other: every board in a card
   too narrow for any two names, and a board with a long name (the card says so) wherever
   half the card is too narrow for it. */
@container (max-width: 12.99rem) {
  .ui-game-board {
    grid-template-columns: minmax(0, 1fr);
    justify-items: center;
    gap: var(--step-4);
  }
}
@container (max-width: 21.99rem) {
  .ui-game-card[data-names='long'] .ui-game-board {
    grid-template-columns: minmax(0, 1fr);
    justify-items: center;
    gap: var(--step-4);
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
/* Its figures are a step larger wherever its card has the room for them and both names. */
@container (min-width: 25rem) {
  .ui-game-card[data-featured='true'] .ui-game-score {
    font-size: var(--text-48);
  }
}
@container (min-width: 34rem) {
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

/* The big board of a game's page. The teams and what stands between them are held to a
   width the eye takes in at once, however wide the panel is. */
.ui-scoreboard {
  padding-block: var(--step-5);
  padding-inline: var(--space);
  background: var(--color-panel);
  color: var(--color-text);
  border: var(--card-border-width) solid var(--color-line);
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
.ui-scoreboard-role {
  color: var(--color-muted);
  font-size: var(--text-12);
  font-weight: 600;
  letter-spacing: var(--label-tracking);
  text-transform: uppercase;
}
.ui-scoreboard-name {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--step-2);
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
/* A score is set in the reading face, whose figures are lining and even-width on every
   device: two scores side by side are compared digit by digit. */
.ui-scoreboard-score {
  font-family: var(--font-body);
  font-size: var(--text-36);
  font-weight: 700;
  line-height: 1;
  font-variant-numeric: lining-nums tabular-nums;
  color: var(--color-text);
}
.ui-scoreboard-side[data-winner='true'] .ui-scoreboard-score {
  color: var(--color-highlight);
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
