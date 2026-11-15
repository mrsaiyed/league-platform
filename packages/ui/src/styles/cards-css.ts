// Cards that are not games: a team with its round emblem, a leader board with one big
// number, and a group that opens and closes, such as a round of the schedule
// (docs/build/DESIGN.md, section 3).
export const cardsCss = String.raw`
/* A team's emblem: a shield with its first letter, drawn in the team's own color. The
   color is laid inside the shield and drawn strongly along its lines, with a little of the
   page's text color in it, so a team's dark color still shows on a dark page and a pale
   one on a light page. The letter is in the page's text color: it reads whatever color the
   team chose. A team with no color of its own takes the league's accent. */
.ui-emblem {
  --emblem-color: var(--team-color, var(--color-accent));
  flex: none;
  inline-size: auto;
  block-size: var(--step-7);
  aspect-ratio: 6 / 7;
  overflow: visible;
  color: color-mix(in srgb, var(--emblem-color) 74%, var(--color-text));
}
.ui-emblem[data-size='small'] {
  block-size: var(--step-5);
}
.ui-emblem[data-size='large'] {
  block-size: calc(var(--step-8) + var(--step-5));
}
.ui-emblem-shield {
  fill: color-mix(in srgb, var(--emblem-color) 30%, transparent);
  stroke: currentColor;
  stroke-width: 1.4;
}
.ui-emblem-inner,
.ui-emblem-bar {
  fill: none;
  stroke: currentColor;
  stroke-width: 0.6;
  opacity: 0.8;
}
.ui-emblem-letter {
  color: var(--color-text);
  fill: currentColor;
  font-family: var(--font-heading);
  font-weight: var(--heading-weight);
  text-transform: uppercase;
}
/* In a row of a table the shield is small: only its outline and its letter are drawn. */
.ui-emblem[data-size='small'] .ui-emblem-inner,
.ui-emblem[data-size='small'] .ui-emblem-bar {
  display: none;
}
.ui-emblem[data-size='small'] .ui-emblem-shield {
  stroke-width: 2.4;
}
.ui-emblem[data-size='small'] .ui-emblem-letter {
  font-weight: 700;
}
/* The league's own mark, in the header: a shield filled with the strongest color of its
   bands (its main color, laid over a panel or deepened), edged in the color the eye lands
   on in the header, its letter in the color of a band's words. */
.ui-emblem[data-kind='league'] {
  color: var(--header-pop);
}
.ui-emblem[data-kind='league'] .ui-emblem-shield {
  fill: var(--color-band-glow);
}
.ui-emblem[data-kind='league'] .ui-emblem-letter {
  color: var(--color-on-band);
}

.ui-team-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--step-4);
  inline-size: 100%;
  padding-block: var(--step-4);
  padding-inline: var(--space);
  background: var(--color-panel);
  border: var(--card-border-width) solid var(--color-line);
  border-radius: var(--radius);
  box-shadow: var(--card-shadow);
  transition: border-color 0.15s;
}
.ui-team-card:hover {
  border-color: var(--color-primary);
}
.ui-team-card-text {
  display: grid;
  flex: 1 1 auto;
  /* One column exactly as wide as the room there is: a long word in a name wraps or is
     broken inside it, and never makes the card wider than the screen. */
  grid-template-columns: minmax(0, 1fr);
  gap: var(--step-1);
  min-inline-size: 0;
}
.ui-team-card-name {
  margin: 0;
  font-family: var(--font-heading);
  font-size: var(--text-18);
  font-weight: var(--heading-weight);
  letter-spacing: var(--heading-tracking);
  line-height: 1.2;
  text-transform: var(--heading-case);
  /* A word too long for the card is broken at a syllable, with a hyphen, where the
     browser knows the language. */
  hyphens: auto;
}
.ui-team-card-name a {
  color: var(--color-text);
  text-decoration: none;
}
/* The whole card is the link to the team. */
.ui-team-card-name a::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: var(--radius);
}
.ui-team-card-name a:focus-visible {
  outline: none;
}
.ui-team-card-name a:focus-visible::after {
  outline: 3px solid var(--color-primary-text);
  outline-offset: 2px;
}
.ui-facts {
  display: flex;
  flex-wrap: wrap;
  gap: var(--step-1) var(--step-4);
  margin: 0;
  color: var(--color-muted);
  font-size: var(--text-14);
}
.ui-facts > div {
  display: flex;
  align-items: baseline;
  gap: var(--step-2);
}
.ui-facts dt {
  font-size: var(--text-12);
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.ui-facts dd {
  margin: 0;
  color: var(--color-text);
  font-variant-numeric: lining-nums tabular-nums;
  font-weight: 600;
}
.ui-team-card-figure {
  flex: none;
  color: var(--color-pop);
  font-family: var(--font-score);
  font-size: var(--text-22);
  font-weight: var(--heading-weight);
  font-variant-numeric: lining-nums tabular-nums;
  line-height: 1;
}

/* A leader board: who leads, with the leader's number the biggest thing on the card. */
.ui-leader-card {
  display: grid;
  align-content: start;
  gap: var(--step-3);
  inline-size: 100%;
  padding-block: var(--step-4);
  padding-inline: var(--space);
  background: var(--color-panel);
  border: var(--card-border-width) solid var(--color-line);
  border-radius: var(--radius);
  box-shadow: var(--card-shadow);
}
.ui-leader-card h3 {
  margin: 0;
  color: var(--color-accent-text);
  font-family: var(--font-body);
  font-size: var(--text-12);
  font-weight: 700;
  letter-spacing: var(--label-tracking);
  text-transform: uppercase;
}
.ui-leader-list {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
}
.ui-leader {
  display: flex;
  align-items: center;
  gap: var(--step-3);
  padding-block: var(--step-2);
  border-block-start: 1px solid var(--color-line);
}
.ui-leader:first-child {
  padding-block-start: 0;
  border-block-start: 0;
}
.ui-leader-who {
  display: grid;
  flex: 1 1 auto;
  grid-template-columns: minmax(0, 1fr);
  min-inline-size: 0;
}
.ui-leader-name {
  font-weight: 600;
  line-height: 1.25;
}
.ui-leader-detail {
  color: var(--color-muted);
  font-size: var(--text-12);
}
.ui-leader-value {
  flex: none;
  font-family: var(--font-score);
  font-size: var(--text-18);
  font-weight: var(--heading-weight);
  font-variant-numeric: lining-nums tabular-nums;
  line-height: 1;
}
.ui-leader:first-child .ui-leader-value {
  color: var(--color-primary-text);
  font-size: var(--text-36);
}

/* A group that opens and closes without any script: a round of the schedule. */
.ui-group {
  border-block-start: 1px solid var(--color-line);
}
.ui-group:last-of-type {
  border-block-end: 1px solid var(--color-line);
}
.ui-group > summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--step-1) var(--step-3);
  min-block-size: var(--step-7);
  padding-block: var(--step-3);
  list-style: none;
  cursor: pointer;
}
.ui-group > summary::-webkit-details-marker {
  display: none;
}
/* The mark that says a group opens: a small corner that points on when shut, down when open. */
.ui-group > summary::before {
  content: '';
  flex: none;
  inline-size: var(--step-2);
  block-size: var(--step-2);
  margin-inline: var(--step-1);
  border-block-end: 2px solid var(--color-muted);
  border-inline-end: 2px solid var(--color-muted);
  transition: transform 0.15s;
  transform: rotate(-45deg);
}
[dir='rtl'] .ui-group > summary::before {
  transform: rotate(45deg);
}
.ui-group[open] > summary::before {
  transform: rotate(45deg);
}
[dir='rtl'] .ui-group[open] > summary::before {
  transform: rotate(-45deg);
}
.ui-group > summary h2,
.ui-group > summary h3 {
  margin: 0;
  font-size: var(--text-18);
}
.ui-group > summary:hover h2,
.ui-group > summary:hover h3 {
  color: var(--color-primary-text);
}
.ui-group-mark {
  display: inline-flex;
  align-items: center;
  min-block-size: var(--step-5);
  padding-block: 0;
  padding-inline: var(--step-2);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-pill);
  color: var(--color-muted);
  font-size: var(--text-12);
  font-weight: 700;
  letter-spacing: 0.08em;
  line-height: 1.5;
  text-transform: uppercase;
  white-space: nowrap;
}
/* The group to look at now: the round being played. */
.ui-group[data-phase='current'] .ui-group-mark {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: var(--color-on-primary);
}
/* What the mark does not say, beside it ("1 game postponed"): drawn like a game's own
   state pill, so it is read as news about the games inside, in any round. */
.ui-group .ui-group-mark[data-kind='note'] {
  border-color: var(--color-line-strong);
  background: transparent;
  color: var(--color-text);
}
.ui-group-summary {
  margin-inline-start: auto;
  color: var(--color-muted);
  font-size: var(--text-14);
}
.ui-group-body {
  padding-block: var(--step-1) var(--step-5);
}
`;
