// The ground every screen stands on: the page's own colors and type, headings on the one
// type scale, links, the focus ring, and buttons and fields that never show a browser's own
// look (docs/build/DESIGN.md, section 4, lines 5, 7 and 25). The element rules sit inside
// `:where()`, so any piece's own class wins over them.
export const baseCss = String.raw`
body {
  margin: 0;
}
.ui-root,
.ui-root *,
.ui-root *::before,
.ui-root *::after {
  box-sizing: border-box;
}
.ui-root {
  background: var(--color-background);
  color: var(--color-text);
  font-family: var(--font-body);
  font-size: var(--text-16);
  line-height: 1.5;
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
  overflow-wrap: break-word;
}
.ui-root :where(h1, h2, h3, h4) {
  margin-block: 0 var(--step-3);
  font-family: var(--font-heading);
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: var(--heading-tracking);
  text-transform: var(--heading-case);
  text-wrap: balance;
}
.ui-root :where(h1) {
  font-size: var(--text-28);
}
.ui-root :where(h2) {
  font-size: var(--text-18);
}
.ui-root :where(h3) {
  font-size: var(--text-16);
}
.ui-root :where(h4) {
  font-size: var(--text-14);
}
@media (min-width: 48rem) {
  .ui-root :where(h1) {
    font-size: var(--text-36);
  }
  .ui-root :where(h2) {
    font-size: var(--text-22);
  }
  .ui-root :where(h3) {
    font-size: var(--text-18);
  }
}
.ui-root :where(p, ul, ol, dl, form, fieldset) {
  margin-block: 0 var(--step-3);
}
.ui-root :where(fieldset) {
  padding: var(--step-4);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-small);
}
.ui-root :where(legend) {
  padding-inline: var(--step-2);
  font-weight: 700;
}
.ui-root :where(small) {
  font-size: var(--text-14);
}
.ui-root :where(a) {
  color: var(--color-primary-text);
  text-decoration-thickness: 1px;
  text-underline-offset: 0.18em;
}
.ui-root :where(a:hover) {
  text-decoration-thickness: 2px;
}
.ui-root :focus-visible {
  outline: 3px solid var(--color-primary-text);
  outline-offset: 2px;
}
.ui-root :where(hr) {
  margin-block: var(--step-5);
  border: 0;
  border-block-start: 1px solid var(--color-line);
}
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

/* Fields: a label reads above or beside them; 44 high so a thumb finds them. */
.ui-root :where(button, input, select, textarea) {
  font: inherit;
  letter-spacing: inherit;
  color: inherit;
}
.ui-root :where(label) {
  font-weight: 600;
}
.ui-root :where(label + input, label + select, label + textarea) {
  margin-inline-start: var(--step-2);
}
.ui-root
  :where(
    input:not(
        [type='checkbox'],
        [type='radio'],
        [type='color'],
        [type='file'],
        [type='range'],
        [type='submit'],
        [type='button'],
        [type='reset'],
        [type='hidden']
      ),
    select,
    textarea
  ) {
  min-block-size: var(--tap);
  max-inline-size: 100%;
  padding-block: var(--step-2);
  padding-inline: var(--step-3);
  border: 1px solid var(--color-line-strong);
  border-radius: var(--radius-small);
  background: var(--color-panel);
  color: var(--color-text);
  font-weight: 400;
}
.ui-root :where(textarea) {
  min-block-size: calc(2 * var(--step-7));
}
.ui-root :where(input[type='checkbox'], input[type='radio']) {
  inline-size: var(--step-5);
  block-size: var(--step-5);
  margin: 0;
  vertical-align: middle;
  accent-color: var(--color-primary);
}
.ui-root :where(input[type='color']) {
  inline-size: var(--tap);
  block-size: var(--tap);
  padding: var(--step-1);
  border: 1px solid var(--color-line-strong);
  border-radius: var(--radius-small);
  background: var(--color-panel);
  vertical-align: middle;
}
.ui-root :where(input[type='file']) {
  max-inline-size: 100%;
}
.ui-root :where(::placeholder) {
  color: var(--color-muted);
  opacity: 1;
}

/* Buttons. Outlined unless told otherwise; the main one is filled with the main color, a
   destructive one is in the danger color, a quiet one is only its words. */
.ui-root :where(button, input[type='submit'], input[type='button'], input[type='reset'], .ui-button),
.ui-root :where(input[type='file'])::file-selector-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--step-2);
  min-block-size: var(--tap);
  padding-block: var(--step-2);
  padding-inline: var(--step-4);
  border: 1px solid var(--color-line-strong);
  border-radius: var(--radius-small);
  background: transparent;
  color: var(--color-text);
  font-size: var(--text-14);
  font-weight: 600;
  line-height: 1.2;
  text-decoration: none;
  cursor: pointer;
  transition:
    background-color 0.15s,
    border-color 0.15s;
}
.ui-root :where(input[type='file'])::file-selector-button {
  margin-inline-end: var(--step-3);
  font: inherit;
  font-size: var(--text-14);
  font-weight: 600;
}
.ui-root :where(button, input[type='submit'], input[type='button'], input[type='reset'], .ui-button):hover {
  background: var(--color-tint);
  border-color: var(--color-text);
}
.ui-root :where(button, input, select, textarea):disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.ui-root .ui-button[data-kind='main'] {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: var(--color-on-primary);
}
.ui-root .ui-button[data-kind='main']:hover {
  border-color: var(--color-text);
}
.ui-root .ui-button[data-kind='danger'] {
  border-color: var(--color-danger);
  color: var(--color-danger);
}
.ui-root .ui-button[data-kind='danger']:hover {
  background: var(--color-danger);
  color: var(--color-on-danger);
}
.ui-root .ui-button[data-kind='quiet'] {
  padding-inline: var(--step-2);
  border-color: transparent;
  color: var(--color-primary-text);
}
.ui-root .ui-button[data-kind='quiet']:hover {
  border-color: transparent;
  text-decoration: underline;
}

/* A notice: something the reader should know before going on. */
.ui-notice {
  margin-block: 0 var(--step-4);
  padding-block: var(--step-3);
  padding-inline: var(--step-4);
  border: 1px solid var(--color-line);
  border-inline-start: var(--step-1) solid var(--color-primary);
  border-radius: var(--radius-small);
  background: var(--color-panel);
  font-size: var(--text-14);
}
.ui-notice[data-kind='error'] {
  border-inline-start-color: var(--color-danger);
}
.ui-field-help {
  margin-block: var(--step-1) 0;
  color: var(--color-muted);
  font-size: var(--text-14);
  font-weight: 400;
}
.ui-field-error {
  margin-block: var(--step-1) 0;
  color: var(--color-danger);
  font-size: var(--text-14);
  font-weight: 600;
}

@media (prefers-reduced-motion: reduce) {
  .ui-root *,
  .ui-root *::before,
  .ui-root *::after {
    animation: none;
    transition: none;
    scroll-behavior: auto;
  }
}
`;
