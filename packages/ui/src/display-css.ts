// The shared display pieces' stylesheet as text, so the package is used only through its
// index (T-22). A page puts it in one style block, as it does the design variables.
// Written as a string, not a file, so no loader is needed in the browser build.
export const displayCss = String.raw`/* The look of the shared display pieces. Every color, font, corner and space comes from the
   design's variables (T-90); nothing here names a league. Logical properties only (start,
   end, inline, block), so right-to-left pages mirror themselves (T-188). Movement stops for
   readers who ask for less of it. */
.ui-visually-hidden {
  position: absolute;
  inline-size: 1px;
  block-size: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.ui-live {
  display: inline-flex;
  align-items: center;
  gap: 0.35em;
  padding-block: 0.1em;
  padding-inline: 0.6em;
  border-radius: var(--radius);
  background: var(--color-accent);
  color: var(--color-background);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
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

.ui-game-card {
  display: grid;
  gap: calc(var(--space) * 0.5);
  padding: var(--space);
  background: var(--color-panel);
  color: var(--color-text);
  border: var(--card-border-width) solid var(--color-accent);
  border-radius: var(--radius);
  box-shadow: var(--card-shadow);
}
.ui-game-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: calc(var(--space) * 0.5);
  font-size: 0.875rem;
}
.ui-game-state {
  font-weight: 700;
  text-transform: uppercase;
  font-size: 0.75rem;
  letter-spacing: 0.06em;
}
.ui-game-teams {
  display: grid;
  gap: calc(var(--space) * 0.25);
  margin: 0;
  padding: 0;
  list-style: none;
}
.ui-game-team {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space);
  padding-inline-start: calc(var(--space) * 0.5);
  border-inline-start: 4px solid var(--team-color, var(--color-accent));
}
.ui-game-team[data-winner='true'] {
  font-weight: 700;
  border-inline-start-color: var(--color-primary);
}
.ui-game-team-score {
  margin-inline-start: auto;
  font-variant-numeric: tabular-nums;
  font-size: 1.25rem;
}
.ui-game-versus {
  font-size: 0.75rem;
  text-align: center;
  opacity: 0.8;
}
.ui-game-link {
  color: var(--color-primary);
}

.ui-scoreboard {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: var(--space);
  padding: var(--space);
  background: var(--color-panel);
  color: var(--color-text);
  border: var(--card-border-width) solid var(--color-accent);
  border-radius: var(--radius);
  box-shadow: var(--card-shadow);
}
.ui-scoreboard-side {
  display: grid;
  justify-items: center;
  gap: calc(var(--space) * 0.25);
  text-align: center;
}
.ui-scoreboard-role {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.ui-scoreboard-name {
  font-family: var(--font-heading);
  font-size: 1.25rem;
}
.ui-scoreboard-score {
  font-family: var(--font-heading);
  font-size: 3rem;
  font-weight: 700;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  color: var(--color-primary);
}
.ui-scoreboard-middle {
  display: grid;
  justify-items: center;
  gap: calc(var(--space) * 0.25);
}
.ui-scoreboard-period {
  font-variant-numeric: tabular-nums;
}

.ui-table-wrap {
  overflow-x: auto;
  max-inline-size: 100%;
}
.ui-table {
  inline-size: 100%;
  border-collapse: collapse;
  background: var(--color-panel);
  color: var(--color-text);
}
.ui-table caption {
  padding-block: calc(var(--space) * 0.5);
  text-align: start;
  font-family: var(--font-heading);
  font-weight: 700;
}
.ui-table th,
.ui-table td {
  padding-block: calc(var(--space) * 0.5);
  padding-inline: calc(var(--space) * 0.75);
  text-align: start;
  border-block-end: 1px solid var(--color-accent);
}
.ui-table thead th {
  border-block-end: 2px solid var(--color-primary);
  font-size: 0.8125rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.ui-table tfoot th,
.ui-table tfoot td {
  font-weight: 700;
  border-block-start: 2px solid var(--color-primary);
}
.ui-table .ui-num {
  text-align: end;
  font-variant-numeric: tabular-nums;
}
.ui-team-cell {
  font-weight: 600;
  border-inline-start: 4px solid var(--team-color, transparent);
}
.ui-note-mark a {
  color: var(--color-primary);
}
.ui-footnotes,
.ui-table-notice {
  font-size: 0.875rem;
}
.ui-sort-button {
  display: inline-flex;
  align-items: center;
  gap: 0.35em;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-transform: inherit;
  letter-spacing: inherit;
  cursor: pointer;
}
.ui-sort-button:focus-visible,
.ui-picker select:focus-visible,
.ui-picker button:focus-visible {
  outline: 3px solid var(--color-primary);
  outline-offset: 2px;
}
th[aria-sort='ascending'] .ui-sort-button::after {
  content: '\25B2';
  font-size: 0.7em;
}
th[aria-sort='descending'] .ui-sort-button::after {
  content: '\25BC';
  font-size: 0.7em;
}

.ui-picker {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: calc(var(--space) * 0.5);
}
.ui-picker select,
.ui-picker button {
  padding-block: calc(var(--space) * 0.35);
  padding-inline: calc(var(--space) * 0.75);
  border: 1px solid var(--color-accent);
  border-radius: var(--radius);
  background: var(--color-panel);
  color: var(--color-text);
  font: inherit;
  min-block-size: 2.75rem;
}
.ui-picker button {
  background: var(--color-primary);
  color: var(--color-background);
  cursor: pointer;
}
`;
