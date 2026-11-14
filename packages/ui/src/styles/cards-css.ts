// Cards that are not games: a team with its round emblem, a leader board with one big
// number, and a group that opens and closes, such as a round of the schedule
// (docs/build/DESIGN.md, section 3).
export const cardsCss = String.raw`
/* A team's round emblem: its first letter in a ring of its own color. */
.ui-emblem {
  display: grid;
  flex: none;
  place-items: center;
  inline-size: var(--step-7);
  block-size: var(--step-7);
  border: 2px solid var(--team-color, var(--color-line-strong));
  border-radius: 50%;
  background: color-mix(in srgb, var(--team-color, var(--color-primary)) 18%, transparent);
  color: var(--color-text);
  font-family: var(--font-heading);
  font-size: var(--text-18);
  font-weight: 700;
  line-height: 1;
  text-transform: uppercase;
}
.ui-emblem[data-size='large'] {
  inline-size: var(--step-8);
  block-size: var(--step-8);
  font-size: var(--text-28);
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
  gap: var(--step-1);
  min-inline-size: 0;
}
.ui-team-card-name {
  margin: 0;
  font-family: var(--font-heading);
  font-size: var(--text-18);
  font-weight: 700;
  letter-spacing: var(--heading-tracking);
  line-height: 1.2;
  text-transform: var(--heading-case);
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
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
.ui-team-card-figure {
  flex: none;
  color: var(--color-primary-text);
  font-family: var(--font-heading);
  font-size: var(--text-22);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
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
  font-family: var(--font-heading);
  font-size: var(--text-18);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
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
.ui-group > summary::before {
  content: '';
  flex: none;
  border-inline: 0.3125rem solid transparent;
  border-block-start: 0.375rem solid var(--color-muted);
  transition: transform 0.15s;
  transform: rotate(-90deg);
}
[dir='rtl'] .ui-group > summary::before {
  transform: rotate(90deg);
}
.ui-group[open] > summary::before,
[dir='rtl'] .ui-group[open] > summary::before {
  transform: none;
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
  padding-block: 0.125rem;
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
.ui-group-summary {
  margin-inline-start: auto;
  color: var(--color-muted);
  font-size: var(--text-14);
}
.ui-group-body {
  padding-block: var(--step-1) var(--step-5);
}
`;
