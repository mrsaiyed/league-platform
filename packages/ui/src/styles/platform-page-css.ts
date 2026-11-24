// SR Leagues' own pages that are not forms (step 2.102, DESIGN.md section 4, lines 24 and
// 27): the front page and the notes to read (terms, privacy). The same design values as the
// form card (a blue rule on top, a kicker, serif titles, one blue that lands, generous
// space), held in a wider centered column for reading. Every value is the design's (T-90);
// logical properties only (T-188). It sits on `.ui-message`, whose centered panel it reworks.
export const platformPageCss = `
.ui-message.ui-page-card {
  justify-items: stretch;
  gap: var(--step-4);
  max-inline-size: 45rem;
  padding-block: var(--step-6) var(--step-7);
  padding-inline: var(--step-5);
  border-block-start: var(--step-1) solid var(--color-primary);
  text-align: start;
}
@media (min-width: 48rem) {
  .ui-message.ui-page-card {
    padding-block: var(--step-7) var(--step-8);
    padding-inline: var(--step-7);
  }
}
.ui-page-card .ui-kicker {
  color: var(--color-muted);
}
.ui-page-card .ui-kicker::before {
  background: var(--color-primary);
}
.ui-page-card h1 {
  font-family: var(--font-heading);
  font-size: var(--text-28);
  line-height: 1.15;
}
@media (min-width: 30rem) {
  .ui-page-card h1 {
    font-size: var(--text-36);
  }
}
.ui-page-card section {
  display: grid;
  gap: var(--step-3);
  margin-block-start: var(--step-4);
}
.ui-page-card section > * {
  margin: 0;
}
.ui-page-card h2 {
  display: grid;
  gap: var(--step-2);
  font-family: var(--font-heading);
  font-size: var(--text-22);
  line-height: 1.25;
}
.ui-page-card h2::after {
  content: '';
  inline-size: var(--step-5);
  block-size: var(--line-heavy);
  background: var(--color-primary);
}
.ui-message.ui-page-card p:not(.ui-kicker) {
  color: var(--color-text);
  font-size: var(--text-16);
  line-height: 1.6;
}
.ui-message.ui-page-card p[data-quiet] {
  color: var(--color-muted);
  font-size: var(--text-14);
}
.ui-page-card p a:not(.ui-button) {
  display: inline-flex;
  align-items: center;
  min-block-size: var(--tap);
  color: var(--color-primary-text);
  font-weight: 600;
}
.ui-message.ui-page-card .ui-button {
  margin-block-start: 0;
}
.ui-page-card .ui-ways {
  display: flex;
  flex-wrap: wrap;
  gap: var(--step-2) var(--step-5);
  margin-block-start: var(--step-5);
  padding-block-start: var(--step-4);
  border-block-start: 1px solid var(--color-line);
}
.ui-page-card .ui-ways > p {
  margin: 0;
}
.ui-page-card .ui-ways .ui-button[data-kind='quiet'] {
  padding-inline: 0;
}

/* The front page: a large serif title in two lines, the second in the one blue, a
   sentence, the way in, and what a league's site holds, four across on a laptop. */
.ui-message.ui-page-card.ui-front {
  max-inline-size: 60rem;
  gap: var(--step-5);
}
.ui-front h1 {
  display: grid;
  font-size: var(--text-36);
  line-height: 1.1;
}
.ui-front h1 > span + span {
  color: var(--color-primary-text);
}
@media (max-width: 22rem) {
  .ui-front h1 {
    font-size: var(--text-28);
  }
}
@media (min-width: 48rem) {
  .ui-front h1 {
    font-size: var(--text-48);
  }
}
.ui-message.ui-front > p:not([data-quiet], [role]) {
  max-inline-size: 36rem;
  color: var(--color-muted);
  font-size: var(--text-18);
}
.ui-front > .ui-button[data-kind='main'] {
  justify-self: start;
  min-inline-size: 12rem;
  font-size: var(--text-16);
}
.ui-front .ui-what {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--step-5) var(--step-5);
  margin: 0;
  margin-block-start: var(--step-5);
  padding: 0;
  padding-block-start: var(--step-6);
  border-block-start: 1px solid var(--color-line);
  list-style: none;
}
@media (min-width: 48rem) {
  .ui-front .ui-what {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
.ui-front .ui-what > li {
  display: grid;
  align-content: start;
  gap: var(--step-2);
  padding-inline-start: var(--step-3);
  border-inline-start: var(--line-heavy) solid var(--color-primary);
}
.ui-front .ui-what strong {
  font-family: var(--font-heading);
  font-size: var(--text-22);
  line-height: 1.2;
}
.ui-front .ui-what span {
  color: var(--color-muted);
  font-size: var(--text-14);
  line-height: 1.5;
}
`;
