// A game, small and large: the state pills, the game card and the scoreboard
// (docs/build/DESIGN.md, section 4, lines 6 and 10 to 12). The highlight is spent here on
// three things only: the Live pill and the winner's score on a card and on a scoreboard.
export const gameCss = String.raw`
.ui-live {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 0.4em;
  padding-block: 0.125rem;
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
  flex: none;
  padding-block: 0.125rem;
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
  align-content: start;
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
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--step-3);
  color: var(--color-muted);
  font-size: var(--text-12);
  line-height: 1.5;
}
.ui-game-about {
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
  font-variant-numeric: tabular-nums;
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

.ui-scoreboard {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: var(--step-4);
  padding-block: var(--step-5);
  padding-inline: var(--space);
  background: var(--color-panel);
  color: var(--color-text);
  border: var(--card-border-width) solid var(--color-line);
  border-radius: var(--radius);
  box-shadow: var(--card-shadow);
}
.ui-scoreboard-side {
  display: grid;
  justify-items: center;
  gap: var(--step-2);
  text-align: center;
}
.ui-scoreboard-role {
  color: var(--color-muted);
  font-size: var(--text-12);
  font-weight: 600;
  letter-spacing: var(--label-tracking);
  text-transform: uppercase;
}
.ui-scoreboard-name {
  font-family: var(--font-heading);
  font-size: var(--text-18);
  font-weight: 700;
  line-height: 1.2;
}
.ui-scoreboard-score {
  font-family: var(--font-heading);
  font-size: var(--text-36);
  font-weight: 700;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  color: var(--color-text);
}
.ui-scoreboard-side[data-winner='true'] .ui-scoreboard-score {
  color: var(--color-highlight);
}
.ui-scoreboard-middle {
  display: grid;
  justify-items: center;
  gap: var(--step-2);
}
.ui-scoreboard-period {
  color: var(--color-muted);
  font-size: var(--text-14);
  font-variant-numeric: tabular-nums;
}
`;
