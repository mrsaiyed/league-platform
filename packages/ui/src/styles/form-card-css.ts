// The form card (step 2.102, DESIGN.md section 4, lines 22 and 24): the look of signing in,
// signing up, the forgotten password and the account. A centered card about 420 wide on
// SR Leagues' own design, a kicker with our name over a serif title, fields labeled above
// themselves at full width, one main button filled with the main color, the ways on as
// quiet links beneath, and generous space. Every value is the design's (T-90); logical
// properties only (T-188). It sits on `.ui-message`, whose centered panel it reworks.
export const formCardCss = `
.ui-message.ui-form-card {
  justify-items: stretch;
  gap: var(--step-4);
  max-inline-size: 26.25rem;
  padding-block: var(--step-6) var(--step-7);
  padding-inline: var(--step-5);
  border-block-start: var(--step-1) solid var(--color-primary);
  text-align: start;
}
@media (min-width: 30rem) {
  .ui-message.ui-form-card {
    padding-inline: var(--step-6);
  }
}
.ui-form-card .ui-kicker {
  color: var(--color-muted);
}
.ui-form-card .ui-kicker::before {
  background: var(--color-primary);
}
.ui-form-card h1 {
  margin-block-end: var(--step-2);
  font-family: var(--font-heading);
  font-size: var(--text-28);
  line-height: 1.15;
}
@media (min-width: 30rem) {
  .ui-form-card h1 {
    font-size: var(--text-36);
  }
}
.ui-form-card h2 {
  display: grid;
  gap: var(--step-2);
  margin-block-start: var(--step-4);
  font-family: var(--font-heading);
  font-size: var(--text-18);
}
.ui-form-card h2::after {
  content: '';
  inline-size: var(--step-5);
  block-size: var(--line-heavy);
  background: var(--color-primary);
}
.ui-form-card p {
  font-size: var(--text-16);
  line-height: 1.5;
}
.ui-form-card [data-notice] {
  padding-block: var(--step-3);
  padding-inline: var(--step-4);
  border-inline-start: var(--step-1) solid var(--color-primary);
  border-radius: var(--radius-small);
  background: color-mix(in srgb, var(--color-primary) 8%, var(--color-panel));
  color: var(--color-text);
}

/* A sign-in screen's word that only asks to sign in (back to a game kept on this device):
   calm, in the main color, with an arrow mark, not drawn as refused. */
.ui-message .ui-refusal[data-ask] {
  border-color: color-mix(in srgb, var(--color-primary) 35%, transparent);
  background: color-mix(in srgb, var(--color-primary) 8%, var(--color-panel));
  color: var(--color-text);
}
.ui-message .ui-refusal[data-ask]::before {
  content: '\\2192';
  content: '\\2192' / '';
  background: var(--color-primary);
  color: var(--color-on-primary);
}
[dir='rtl'] .ui-message .ui-refusal[data-ask]::before {
  transform: scaleX(-1);
}

/* A form: its fields one under another, the button at the foot. */
.ui-form-card form {
  display: grid;
  gap: var(--step-4);
  margin: 0;
}
.ui-form-card form > * {
  margin: 0;
}
.ui-field {
  display: grid;
  gap: var(--step-2);
}
.ui-field label {
  display: grid;
  gap: var(--step-2);
  color: var(--color-text);
  font-size: var(--text-14);
  font-weight: 600;
}
.ui-root .ui-field input {
  inline-size: 100%;
  font-size: var(--text-16);
}
.ui-field-row {
  display: flex;
  align-items: stretch;
  gap: var(--step-2);
}
.ui-root .ui-field-row input {
  flex: 1 1 auto;
  min-inline-size: 0;
}
.ui-field-row .ui-button {
  flex: none;
}
.ui-form-card :is(button, .ui-button)[data-kind='main'],
.ui-form-card :is(button, .ui-button)[data-kind='second'] {
  inline-size: 100%;
  font-size: var(--text-16);
}
.ui-message.ui-form-card .ui-button {
  margin-block-start: 0;
}

/* A link inside a sentence ("Not your address? Change it") is a tap target too: 44 high. */
.ui-form-card p a:not(.ui-button) {
  display: inline-flex;
  align-items: center;
  min-block-size: var(--tap);
  color: var(--color-primary-text);
  font-weight: 600;
}

/* "or", between two ways in: a hairline on each side. */
.ui-form-card .ui-or {
  display: flex;
  align-items: center;
  gap: var(--step-3);
  font-size: var(--text-14);
}
.ui-form-card .ui-or::before,
.ui-form-card .ui-or::after {
  content: '';
  flex: 1;
  block-size: 1px;
  background: var(--color-line);
}

/* The ways on (forgot, create an account, back): quiet, centered, each its own line. */
.ui-form-card > p:has(> .ui-button[data-kind='quiet']:only-child) {
  display: flex;
  justify-content: center;
  margin-block: calc(-1 * var(--step-2));
}
.ui-form-card form + p:has(> .ui-button[data-kind='quiet']:only-child) {
  margin-block-start: var(--step-2);
}

/* A block set apart from what is above it by a hairline (the account's "Sign out
   everywhere", kept away from "Sign out"). */
.ui-form-card .ui-apart {
  display: grid;
  gap: var(--step-3);
  margin-block-start: var(--step-5);
  padding-block-start: var(--step-5);
  border-block-start: 1px solid var(--color-line);
}
.ui-form-card .ui-apart > * {
  margin: 0;
}
.ui-form-card .ui-apart > .ui-button[data-kind='quiet'] {
  justify-self: start;
  padding-inline: 0;
}

/* A list of rows parted by hairlines, with no bullets (the account's devices). */
.ui-form-card .ui-rows {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
}
.ui-form-card .ui-rows > li {
  padding-block: var(--step-3);
  border-block-end: 1px solid var(--color-line);
  color: var(--color-muted);
  font-size: var(--text-14);
  line-height: 1.6;
}
.ui-form-card .ui-rows > li:first-child {
  border-block-start: 1px solid var(--color-line);
}
.ui-form-card .ui-rows strong {
  color: var(--color-text);
  font-size: var(--text-16);
}

/* Inside the card, a list of cards (the account's leagues) is drawn as rows: the name as
   the way in, what the person is beneath it, and a second way ("Admin") at the far end. */
.ui-form-card .ui-card-grid {
  display: grid;
  grid-template-columns: none;
  gap: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}
.ui-form-card .ui-card-grid > li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  column-gap: var(--step-3);
  padding-block: var(--step-2);
  border-block-end: 1px solid var(--color-line);
  color: var(--color-muted);
  font-size: var(--text-14);
}
.ui-form-card .ui-card-grid > li:first-child {
  border-block-start: 1px solid var(--color-line);
}
.ui-form-card .ui-card-grid > li > .ui-button:first-child {
  justify-content: flex-start;
  padding-inline: 0;
  border-color: transparent;
  color: var(--color-primary-text);
  font-size: var(--text-16);
  text-align: start;
}
.ui-form-card .ui-card-grid > li > .ui-button:first-child:hover {
  background: transparent;
  text-decoration: underline;
}
.ui-form-card .ui-card-grid > li > :not(.ui-button) {
  grid-column: 1;
  padding-block-end: var(--step-2);
}
.ui-form-card .ui-card-grid > li > .ui-button:not(:first-child) {
  grid-column: 2;
  grid-row: 1 / span 2;
}
`;
