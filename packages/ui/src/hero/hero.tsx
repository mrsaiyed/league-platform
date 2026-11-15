import type { ReactNode } from 'react';
import { initialOf, shieldOutline } from '../emblem/emblem.tsx';

/**
 * A name in two lines for a hero's title: the second line is the one drawn in the color
 * the eye lands on. The last word goes on the second line; a name of four words or more is
 * cut at the gap nearest to three fifths of its length, so both lines carry weight. A name
 * of one word stays on one line.
 */
export function titleLines(name: string): readonly [string, string | undefined] {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return [words.join(' '), undefined];
  let cut = words.length - 1;
  if (words.length >= 4) {
    const whole = words.join(' ').length;
    let best = Number.POSITIVE_INFINITY;
    for (let at = 1; at < words.length; at++) {
      const off = Math.abs(words.slice(0, at).join(' ').length - whole * 0.6);
      if (off < best) {
        best = off;
        cut = at;
      }
    }
  }
  return [words.slice(0, cut).join(' '), words.slice(cut).join(' ')];
}

/** The longest line of a title, in letters: what decides how large it can be set. */
const longestLine = (lines: readonly (string | undefined)[]): number =>
  Math.max(...lines.map((line) => Array.from(line ?? '').length));

export type HeroAction = {
  readonly href: string;
  readonly label: string;
  /** `main` is the one filled button; `second` is outlined. */
  readonly kind: 'main' | 'second';
};

export type HeroProps = {
  /** The page's one title: a league's name. It is set in two lines (titleLines). */
  readonly title: string;
  /** A tiny label over the title: the season. */
  readonly kicker?: string | undefined;
  /** One sentence under the title. */
  readonly text?: string | undefined;
  readonly actions?: readonly HeroAction[];
  /**
   * A picture of the league's own, laid under the band's color. Left out, the band is
   * finished by itself: a gradient and a quiet pattern drawn from the league's colors.
   */
  readonly picture?: { readonly src: string } | undefined;
  /** A class for the band's inner column, so it lines up with the page under it. */
  readonly columnClass?: string | undefined;
  /** What stands beside the words on a laptop and under them on a phone: a live game. */
  readonly children?: ReactNode;
};

/**
 * The opening of a home page: a band the width of the screen, a very large title in two
 * lines with the second in the color the eye lands on, one sentence, a filled button and
 * an outlined one.
 */
export function Hero({
  title,
  kicker,
  text,
  actions = [],
  picture,
  columnClass,
  children,
}: HeroProps) {
  const [first, second] = titleLines(title);
  const letters = longestLine([first, second]);
  return (
    <header
      className="ui-hero"
      data-aside={children ? 'true' : undefined}
      data-title={letters > 22 ? 'longest' : letters > 13 ? 'long' : undefined}
    >
      {picture ? <img className="ui-hero-picture" src={picture.src} alt="" /> : null}
      <svg className="ui-hero-art" viewBox="0 0 48 56" aria-hidden="true" focusable="false">
        <path d={shieldOutline} transform="translate(-9.6 -11.2) scale(1.4)" />
        <path d={shieldOutline} transform="translate(-4.8 -5.6) scale(1.2)" />
        <path d={shieldOutline} />
        <path d={shieldOutline} transform="translate(4.8 5.6) scale(0.8)" />
        <text x="24" y="35" fontSize="20" textAnchor="middle">
          {initialOf(title)}
        </text>
      </svg>
      <div className={columnClass ? `ui-hero-inner ${columnClass}` : 'ui-hero-inner'}>
        <div className="ui-hero-words">
          {kicker ? <p className="ui-kicker">{kicker}</p> : null}
          <h1 className="ui-hero-title" dir="auto">
            <span>{first}</span>
            {second === undefined ? null : (
              <>
                {' '}
                <span className="ui-hero-title-pop">{second}</span>
              </>
            )}
          </h1>
          {text ? <p className="ui-hero-text">{text}</p> : null}
          {actions.length > 0 ? (
            <div className="ui-hero-actions">
              {actions.map((action) => (
                <a
                  key={action.href + action.label}
                  className="ui-button"
                  data-kind={action.kind === 'main' ? 'pop' : 'ghost'}
                  data-arrow={action.kind === 'main' ? 'true' : undefined}
                  href={action.href}
                >
                  {action.label}
                </a>
              ))}
            </div>
          ) : null}
        </div>
        {children ? <div className="ui-hero-aside">{children}</div> : null}
      </div>
    </header>
  );
}
