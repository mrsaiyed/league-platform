// The pieces a page is laid out with: its head, its sections with their short rule, the
// panel, the grid of cards, the strip of big numbers, the calm empty panel and the page
// that stands alone (docs/build/DESIGN.md, section 4, lines 2, 3, 5, 18 and 19).
export const layoutCss = String.raw`
/* A small uppercase label, in the accent: a season, a division, the name of a number. */
.ui-eyebrow {
  margin: 0;
  color: var(--color-accent-text);
  font-size: var(--text-12);
  font-weight: 700;
  letter-spacing: var(--label-tracking);
  line-height: 1.5;
  text-transform: uppercase;
}
.ui-badge {
  display: inline-block;
  padding-block: var(--step-1);
  padding-inline: var(--step-3);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-pill);
  color: var(--color-primary-text);
  font-size: var(--text-12);
  font-weight: 700;
  letter-spacing: var(--label-tracking);
  line-height: 1.5;
  text-transform: uppercase;
}

/* The head of a page: one title, a line under it, and what the page lets you do. */
.ui-page-head {
  display: grid;
  /* As wide as the page's column and no wider, whatever the title's longest word. */
  grid-template-columns: minmax(0, 1fr);
  gap: var(--step-2);
  margin-block-end: var(--step-5);
}
.ui-page-head h1 {
  margin: 0;
}
.ui-page-sub {
  margin: 0;
  color: var(--color-muted);
}
.ui-page-head-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--step-3) var(--step-4);
}
.ui-page-head-text {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--step-2);
  flex: 1 1 16rem;
  min-inline-size: 0;
}
.ui-page-head[data-size='hero'] {
  justify-items: var(--hero-align);
  gap: var(--step-3);
  padding-block: var(--step-5) var(--step-2);
  text-align: var(--hero-align);
}
.ui-crumbs {
  display: flex;
  flex-wrap: wrap;
  gap: var(--step-1) var(--step-4);
  margin-block: 0 var(--step-3);
  font-size: var(--text-14);
}
.ui-crumbs a {
  display: inline-flex;
  align-items: center;
  min-block-size: var(--tap);
  font-weight: 600;
  text-decoration: none;
}
.ui-crumbs a:hover {
  text-decoration: underline;
}

/* A section: its title with a short rule in the main color, and one way on beside it. */
.ui-section {
  margin-block-start: var(--space-section);
}
.ui-section-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--step-1) var(--step-4);
  min-block-size: var(--tap);
  margin-block-end: var(--step-4);
}
.ui-section-head h2,
.ui-section-head h3 {
  margin: 0;
}
.ui-section-head h2::after {
  content: '';
  display: block;
  inline-size: var(--step-7);
  block-size: 2px;
  margin-block-start: var(--step-2);
  background: var(--color-primary);
}
.ui-section-note {
  margin-block: 0 var(--step-4);
  color: var(--color-muted);
  font-size: var(--text-14);
}
/* A title with a kicker over it: set larger, with no rule of its own, and the way on
   level with the foot of the title. */
.ui-section-title {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--step-2);
  min-inline-size: 0;
}
.ui-section-head:has(.ui-section-title) {
  align-items: flex-end;
  margin-block-end: var(--step-5);
}
.ui-root .ui-section-title h2 {
  font-size: var(--text-22);
}
.ui-section-title h2::after {
  content: none;
}
@media (min-width: 48rem) {
  .ui-root .ui-section-title h2 {
    font-size: var(--text-28);
  }
}
.ui-more {
  display: inline-flex;
  align-items: center;
  gap: var(--step-2);
  min-block-size: var(--tap);
  color: var(--color-pop);
  font-size: var(--text-14);
  font-weight: 600;
  text-decoration: none;
}
.ui-more:hover {
  text-decoration: underline;
}
.ui-stack {
  display: grid;
  gap: var(--space);
}
.ui-stack > * {
  min-inline-size: 0;
}

/* A panel, and the grid cards are laid out in: one across on a phone, two or three on a
   laptop, never one long column of full-width boxes. */
.ui-panel {
  padding: var(--space);
  background: var(--color-panel);
  border: var(--card-border-width) solid var(--color-line);
  border-radius: var(--radius);
  box-shadow: var(--card-shadow);
}
.ui-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 17.5rem), 1fr));
  gap: var(--step-4);
  margin: 0;
  padding: 0;
  list-style: none;
}
.ui-card-grid > li {
  display: grid;
  min-inline-size: 0;
}

/* The strip of big numbers under a home page's hero: four across at every width, open
   to the page, between two fine lines in the color the eye lands on. The four stand in
   one row and are read against each other, so they are set in lining figures. */
.ui-stat-strip {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
  margin: 0;
  border-block: 1px solid color-mix(in srgb, var(--color-pop) 32%, transparent);
}
.ui-stat {
  display: flex;
  flex-direction: column-reverse;
  align-items: center;
  justify-content: flex-end;
  gap: var(--step-1);
  padding-block: var(--step-4);
  padding-inline: var(--step-1);
  border-inline-start: 1px solid var(--color-line);
  text-align: center;
}
.ui-stat:first-child {
  border-inline-start: 0;
}
.ui-stat dt {
  color: var(--color-muted);
  font-size: var(--text-12);
  font-weight: 600;
  letter-spacing: 0.08em;
  line-height: 1.35;
  text-transform: uppercase;
}
.ui-stat dd {
  margin: 0;
  color: var(--color-pop);
  font-family: var(--font-heading);
  font-size: var(--text-28);
  font-weight: var(--display-weight);
  font-variant-numeric: lining-nums;
  line-height: 1.1;
}
@media (min-width: 48rem) {
  .ui-stat {
    gap: var(--step-2);
    padding-block: var(--step-5);
  }
  .ui-stat dt {
    letter-spacing: 0.18em;
  }
  .ui-stat dd {
    font-size: var(--text-36);
  }
}

/* Nothing to show yet: a calm panel that says what will appear here. */
.ui-empty {
  display: grid;
  justify-items: center;
  gap: var(--step-2);
  padding-block: var(--step-6);
  padding-inline: var(--step-4);
  border: 1px dashed var(--color-line-strong);
  border-radius: var(--radius);
  color: var(--color-muted);
  text-align: center;
}
.ui-empty > * {
  margin: 0;
  max-inline-size: 32rem;
}
.ui-empty-title {
  color: var(--color-text);
  font-family: var(--font-heading);
  font-size: var(--text-18);
  font-weight: var(--heading-weight);
  letter-spacing: var(--heading-tracking);
  text-transform: var(--heading-case);
}
.ui-empty .ui-button {
  margin-block-start: var(--step-2);
}

/* A page that stands by itself: not found, no access, not built yet. Centered, titled,
   with one clear way on. */
.ui-standalone {
  display: grid;
  place-items: center;
  min-block-size: 100vh;
  padding: var(--step-4);
}
.ui-message {
  display: grid;
  justify-items: center;
  gap: var(--step-3);
  inline-size: 100%;
  max-inline-size: 30rem;
  margin-inline: auto;
  padding-block: var(--step-7);
  padding-inline: var(--step-5);
  background: var(--color-panel);
  border: var(--card-border-width) solid var(--color-line);
  border-radius: var(--radius);
  box-shadow: var(--card-shadow);
  text-align: center;
}
.ui-message > * {
  margin: 0;
}
.ui-message h1 {
  font-size: var(--text-28);
}
.ui-message p {
  color: var(--color-muted);
}
.ui-message .ui-button {
  margin-block-start: var(--step-3);
}
.ui-message-mark {
  inline-size: var(--step-7);
  block-size: 2px;
  background: var(--color-primary);
}
`;
