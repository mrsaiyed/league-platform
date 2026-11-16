// The pieces that give a page its opening and its color (docs/build/DESIGN.md, section 3,
// "the first standard", and section 4, line 27): the kicker over a title, the hero band,
// the two buttons that sit on a band, the arrow of a way on, and the band near the foot
// with one call to action. A band has its own colors, worked out from the league's design
// (packages/site, derived-colors.ts): its ground, the words on it, and the color the eye
// lands on there. Nothing here names a league or holds a color of its own.
export const heroCss = String.raw`
/* A kicker: a short rule and a tiny letter-spaced label, over a title. */
.ui-kicker {
  display: flex;
  align-items: center;
  gap: var(--step-3);
  margin: 0;
  color: var(--color-accent-text);
  font-size: var(--text-12);
  font-weight: 600;
  letter-spacing: 0.2em;
  line-height: 1.5;
  text-transform: uppercase;
}
/* The short rule is in the league's color of decoration (its gold, where it has one),
   which need not be read; on a band, in the color of the label itself. */
.ui-kicker::before {
  content: '';
  flex: none;
  inline-size: var(--step-5);
  block-size: 1px;
  background: var(--color-ornament);
}
.ui-hero .ui-kicker::before {
  background: currentColor;
}

/* The arrow of a way on: after "Full schedule", and in the one button that matters. It
   is drawn in the color of its words and turns around on a right-to-left page. */
.ui-more::after,
.ui-button[data-arrow='true']::after {
  content: '';
  flex: none;
  inline-size: var(--step-4);
  block-size: var(--step-4);
  background: currentColor;
  -webkit-mask: var(--ui-arrow) center / contain no-repeat;
  mask: var(--ui-arrow) center / contain no-repeat;
}
[dir='rtl'] .ui-more::after,
[dir='rtl'] .ui-button[data-arrow='true']::after {
  transform: scaleX(-1);
}
.ui-root {
  --ui-arrow: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4.5 12h15M13.5 6l6 6-6 6'/%3E%3C/svg%3E");
  --ui-pin: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 21.5s-6.5-6.4-6.5-11.6a6.5 6.5 0 0 1 13 0c0 5.2-6.5 11.6-6.5 11.6Z'/%3E%3Ccircle cx='12' cy='9.8' r='2.3'/%3E%3C/svg%3E");
}

/* The hero: a band the width of the screen. Its ground is a gradient of the band's colors
   under a soft glow and a quiet pattern of fine lines, so it is finished with no picture;
   a league's own picture, once it has one, lies under the same colors. */
.ui-hero {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  /* The band's own color under its gradient: what the words are on, with or without it. */
  background-color: var(--color-band);
  background-image: linear-gradient(100deg, var(--color-band) 0%, var(--color-band-deep) 78%);
  border-block-end: 1px solid color-mix(in srgb, var(--color-band-pop) 30%, transparent);
  color: var(--color-on-band);
}
.ui-hero::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  background:
    radial-gradient(ellipse 50% 90% at 82% 20%, var(--color-band-glow), transparent 70%),
    repeating-linear-gradient(
      118deg,
      color-mix(in srgb, var(--color-on-band) 4%, transparent) 0 1px,
      transparent 1px 24px
    );
  pointer-events: none;
}
[dir='rtl'] .ui-hero {
  background-image: linear-gradient(260deg, var(--color-band) 0%, var(--color-band-deep) 78%);
}
[dir='rtl'] .ui-hero::before {
  background:
    radial-gradient(ellipse 50% 90% at 18% 20%, var(--color-band-glow), transparent 70%),
    repeating-linear-gradient(
      62deg,
      color-mix(in srgb, var(--color-on-band) 4%, transparent) 0 1px,
      transparent 1px 24px
    );
}
.ui-hero-picture {
  position: absolute;
  inset: 0;
  z-index: -2;
  inline-size: 100%;
  block-size: 100%;
  object-fit: cover;
}
/* Over a picture the band's color lies thick where the words are and thins toward the far
   side, so the words read and the picture shows. */
.ui-hero:has(.ui-hero-picture)::before {
  background: linear-gradient(
    100deg,
    var(--color-band-deep) 0%,
    color-mix(in srgb, var(--color-band-deep) 82%, transparent) 45%,
    color-mix(in srgb, var(--color-band-deep) 35%, transparent) 100%
  );
}
[dir='rtl'] .ui-hero:has(.ui-hero-picture)::before {
  background: linear-gradient(
    260deg,
    var(--color-band-deep) 0%,
    color-mix(in srgb, var(--color-band-deep) 82%, transparent) 45%,
    color-mix(in srgb, var(--color-band-deep) 35%, transparent) 100%
  );
}
/* The pattern's mark: the shield, in fine lines, with the league's first letter. It sits
   at the far side of a laptop's band, where the words leave room for it. On a phone and a
   tablet the band is all words and buttons from edge to edge, so the mark is not drawn
   there: nothing of it may pass under text or a button. The fine lines of the pattern
   and the glow are the band's finish at those widths. */
.ui-hero-art {
  display: none;
  position: absolute;
  inset-block-start: 50%;
  inset-inline-end: 4%;
  z-index: -1;
  block-size: 120%;
  aspect-ratio: 6 / 7;
  overflow: visible;
  fill: none;
  stroke: var(--color-band-pop);
  transform: translateY(-50%);
  opacity: 0.55;
  pointer-events: none;
}
.ui-hero-art path {
  stroke-width: 1px;
  vector-effect: non-scaling-stroke;
}
.ui-hero-art path:nth-of-type(1) {
  opacity: 0.18;
}
.ui-hero-art path:nth-of-type(2) {
  opacity: 0.32;
}
.ui-hero-art path:nth-of-type(3) {
  opacity: 0.6;
}
.ui-hero-art path:nth-of-type(4) {
  opacity: 0.3;
}
.ui-hero-art text {
  fill: var(--color-band-pop);
  stroke: none;
  font-family: var(--font-heading);
  font-weight: var(--display-weight);
  text-transform: uppercase;
  opacity: 0.22;
}
.ui-hero:has(.ui-hero-picture) .ui-hero-art {
  display: none;
}
/* Behind something that stands at the far side (a live game) the mark steps back: fainter,
   and without its letter. */
.ui-hero[data-aside='true'] .ui-hero-art {
  opacity: 0.3;
}
.ui-hero[data-aside='true'] .ui-hero-art text {
  display: none;
}
.ui-hero-inner {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: center;
  gap: var(--step-6);
  padding-block: var(--step-7);
}
.ui-hero-words {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  justify-items: start;
  gap: var(--step-4);
  min-inline-size: 0;
}
.ui-hero .ui-kicker {
  color: var(--color-band-pop);
}
/* The title: very large, in two lines, the second in the color the eye lands on. It is
   one step smaller where a line is long, so a long name still stands in two or three
   lines. */
.ui-root .ui-hero-title {
  margin: 0;
  font-family: var(--font-heading);
  font-size: var(--text-36);
  font-weight: var(--display-weight);
  letter-spacing: var(--hero-tracking);
  line-height: 1.06;
  text-transform: var(--hero-case);
  overflow-wrap: break-word;
}
.ui-hero-title > span {
  display: block;
  text-wrap: balance;
}
.ui-hero-title-pop {
  color: var(--color-band-pop);
}
.ui-root .ui-hero[data-title] .ui-hero-title {
  font-size: var(--text-28);
}
@media (max-width: 22.49rem) {
  .ui-root .ui-hero-title {
    font-size: var(--text-28);
  }
  .ui-root .ui-hero[data-title] .ui-hero-title {
    font-size: var(--text-22);
  }
}
.ui-hero-text {
  max-inline-size: 30rem;
  margin: 0;
  color: var(--color-band-muted);
  line-height: 1.7;
}
.ui-hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--step-3);
  margin-block-start: var(--step-2);
}
.ui-hero-aside {
  min-inline-size: 0;
}
@media (min-width: 40rem) {
  .ui-hero-inner {
    padding-block: var(--step-8);
  }
  .ui-root .ui-hero-title {
    font-size: var(--text-64);
  }
  .ui-root .ui-hero[data-title='long'] .ui-hero-title {
    font-size: var(--text-48);
  }
  .ui-root .ui-hero[data-title='longest'] .ui-hero-title {
    font-size: var(--text-36);
  }
  .ui-hero-text {
    font-size: var(--text-18);
  }
}
@media (min-width: 64rem) {
  .ui-hero-art {
    display: block;
  }
  .ui-hero:has(.ui-hero-picture) .ui-hero-art {
    display: none;
  }
  .ui-hero-inner {
    min-block-size: 30rem;
    gap: var(--step-7);
  }
  .ui-hero[data-aside='true'] .ui-hero-inner {
    grid-template-columns: minmax(0, 1fr) minmax(0, 30rem);
  }
  .ui-root .ui-hero-title {
    font-size: var(--text-88);
  }
  .ui-root .ui-hero[data-aside='true'] .ui-hero-title,
  .ui-root .ui-hero[data-title='long'] .ui-hero-title {
    font-size: var(--text-64);
  }
  .ui-root .ui-hero[data-title='long'][data-aside='true'] .ui-hero-title,
  .ui-root .ui-hero[data-title='longest'] .ui-hero-title {
    font-size: var(--text-48);
  }
}

/* On a band the focus ring is in the band's own words' color, so it shows whatever the
   league's main color is. */
.ui-root .ui-hero :focus-visible,
.ui-root .ui-call-band :focus-visible {
  outline-color: var(--color-on-band);
}

/* The two buttons that sit on a band: the one that matters, filled with the color the eye
   lands on, and a second, outlined. */
.ui-root .ui-button[data-kind='pop'] {
  border-color: var(--color-band-pop);
  background: var(--color-band-pop);
  color: var(--color-on-band-pop);
}
.ui-root .ui-button[data-kind='pop']:hover {
  border-color: var(--color-band-pop-hover);
  background: var(--color-band-pop-hover);
}
.ui-root .ui-button[data-kind='ghost'] {
  /* The band's own edge: its words' color, as strongly as it takes to be seen there. */
  border-color: var(--band-edge);
  background: transparent;
  color: var(--color-on-band);
}
.ui-root .ui-button[data-kind='ghost']:hover {
  border-color: var(--color-on-band);
  background: color-mix(in srgb, var(--color-on-band) 8%, transparent);
}

/* The band near the foot of a page: a phrase, a sentence and one button. */
.ui-call-band {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--step-5) var(--step-6);
  margin-block-start: var(--space-section);
  padding-block: var(--step-6);
  padding-inline: var(--step-5);
  background-color: var(--color-band);
  background-image: linear-gradient(100deg, var(--color-band-glow), var(--color-band));
  border: 1px solid color-mix(in srgb, var(--color-band-pop) 28%, transparent);
  border-radius: var(--radius);
  color: var(--color-on-band);
}
[dir='rtl'] .ui-call-band {
  background-image: linear-gradient(260deg, var(--color-band-glow), var(--color-band));
}
.ui-call-band-words {
  flex: 1 1 18rem;
  min-inline-size: 0;
}
.ui-root .ui-call-band h2 {
  margin-block: 0 var(--step-2);
  font-size: var(--text-22);
}
.ui-call-band p {
  margin: 0;
  color: var(--color-band-muted);
}
@media (min-width: 48rem) {
  .ui-call-band {
    padding-inline: var(--step-7);
  }
  .ui-root .ui-call-band h2 {
    font-size: var(--text-28);
  }
}
`;
