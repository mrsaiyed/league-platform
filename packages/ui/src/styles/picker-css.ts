// The filter toolbar and its pickers (docs/build/DESIGN.md, section 4, line 15): season,
// round, team and "per game or totals" in one compact row. With scripts on, choosing a
// value applies it and the "Show" buttons are put away; with scripts off they stay, quiet.
// The chosen value is in the text color, a little heavier: the highlight is kept for a live
// game and a winner's score (C-15).
export const pickerCss = String.raw`
.ui-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--step-3) var(--step-4);
  margin-block: 0 var(--step-5);
}
.ui-toolbar:empty {
  display: none;
}
.ui-page-head .ui-toolbar {
  margin-block-end: 0;
}
.ui-picker {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--step-2);
  margin: 0;
}
.ui-picker label {
  color: var(--color-muted);
  font-size: var(--text-12);
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.ui-picker select,
.ui-picker button {
  min-block-size: var(--tap);
  padding-block: var(--step-2);
  padding-inline: var(--step-3);
  border: 1px solid var(--color-line-strong);
  border-radius: var(--radius-small);
  background: var(--color-panel);
  color: var(--color-text);
  font: inherit;
  font-size: var(--text-14);
}
.ui-picker select {
  /* A picker sets its own gap between label and field: the plain rule that a field after
     its label stands a step away (base-css.ts) would add to it, and on a phone, where the
     field fills its column, pushed it 8 past the page's edge. */
  margin: 0;
  max-inline-size: 100%;
  font-weight: 600;
  cursor: pointer;
}
.ui-picker option {
  background: var(--color-panel);
  color: var(--color-text);
  font-weight: 400;
}
.ui-picker option:checked {
  font-weight: 700;
}
.ui-picker button {
  background: transparent;
  color: var(--color-muted);
  font-weight: 600;
  cursor: pointer;
}
.ui-picker button:hover {
  color: var(--color-text);
}
/* On a phone each picker has a row of its own: its label in a column all the toolbar's
   pickers share, its field filling the rest, so two pickers line up whatever their words. */
@media (max-width: 39.99rem) {
  .ui-toolbar {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    gap: var(--step-2) var(--step-3);
  }
  .ui-toolbar .ui-picker {
    display: grid;
    grid-column: 1 / -1;
    grid-template-columns: subgrid;
    align-items: center;
  }
  .ui-toolbar .ui-picker select {
    inline-size: 100%;
  }
  .ui-toolbar .ui-picker button {
    grid-column: 2;
    justify-self: start;
  }
}
/* Where scripts can run, the "Show" button hangs under its picker instead of standing
   beside it: it takes no room, so nothing on the page moves when it comes or goes. It is
   put away only once the page's script has said it is running and applying choices
   itself (data-applies, set by the toolbar when its handler is attached). Until then it
   is the way to apply a choice: it waits a moment, so a page whose script starts quickly
   never shows it, and then appears, so a slow phone, or a script that failed to load,
   leaves a button that works. Whenever the keyboard is in its picker it is there, as the
   keyboard's next stop. A browser with scripts off, or one that cannot say, keeps the
   quiet button beside its picker.
   Put away, it is out of sight and takes no tap, but it is never hidden from the
   keyboard (no 'visibility: hidden', no 'display: none'): the keyboard must be able to
   land on it straight from the field, and a button hidden at the moment the field loses
   the keyboard cannot take it. */
@media (scripting: enabled) {
  .ui-toolbar .ui-picker {
    position: relative;
  }
  .ui-toolbar .ui-picker button {
    position: absolute;
    z-index: 5;
    inset-block-start: 100%;
    inset-inline-end: 0;
    margin-block-start: var(--step-1);
    background: var(--color-panel);
    color: var(--color-text);
    box-shadow: var(--overlay-shadow);
    opacity: 0;
    pointer-events: none;
    animation: ui-picker-wait 0s linear 1.5s forwards;
  }
  .ui-toolbar[data-applies='true'] .ui-picker button {
    opacity: 0;
    pointer-events: none;
    animation: none;
  }
  .ui-toolbar .ui-picker:has(:focus-visible) button {
    opacity: 1;
    pointer-events: auto;
    animation: none;
  }
}
@keyframes ui-picker-wait {
  to {
    opacity: 1;
    pointer-events: auto;
  }
}
/* A reader who asked for no movement gets no waiting either: the button is there at once
   until the script takes over. */
@media (scripting: enabled) and (prefers-reduced-motion: reduce) {
  .ui-toolbar:not([data-applies='true']) .ui-picker button {
    opacity: 1;
    pointer-events: auto;
  }
}
`;
