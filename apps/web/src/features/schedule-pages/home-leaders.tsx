import { LeaderSpot, Section } from '@srleagues/ui';
import { t } from '../../server/messages.ts';
import type { HomeLeader } from '../stats-pages/index.ts';

/**
 * The home page's leaders ("Leading the way"), drawn from what the page worked out;
 * nothing here reads anything. `across` is a section of its own across the page, the
 * cards one, two or three in a row. `beside` stands under the standings, inside their
 * section: a small heading of its own, the way to every player's numbers, and each leader
 * as one short row; the players' names are then one heading level further down.
 */
export function HomeLeaders({
  leaders,
  placing,
  statsHref,
}: {
  readonly leaders: readonly HomeLeader[];
  readonly placing: 'across' | 'beside';
  /** The statistics page, where every player's numbers are. */
  readonly statsHref: string;
}) {
  if (leaders.length === 0) return null;
  const cards = leaders.map((leader, index) => (
    <li key={leader.id}>
      <LeaderSpot
        label={leader.label}
        value={leader.value}
        unit={leader.unit}
        name={leader.name}
        detail={leader.detail}
        team={leader.team}
        first={index === 0}
        headingLevel={placing === 'beside' ? 4 : 3}
      />
    </li>
  ));
  if (placing === 'beside') {
    return (
      <div className="home-leaders-beside">
        <div className="home-leaders-head">
          {/* A kicker and a title, as a section has: on a phone, where the leaders are a
              section of their own. On a laptop, where they are a part of the standings'
              column, the title is a small label (the shared kicker). The stylesheet draws
              one of the two and puts the other away, from sight and from screen readers. */}
          <div className="home-leaders-title">
            <p className="ui-kicker">{t('home.leaders.kicker')}</p>
            <h3>{t('home.leaders')}</h3>
          </div>
          <h3 className="ui-kicker home-leaders-label">{t('home.leaders')}</h3>
          <a className="ui-more" href={statsHref}>
            {t('home.leaders.all')}
          </a>
        </div>
        <ul className="ui-spot-row">{cards}</ul>
      </div>
    );
  }
  return (
    <Section
      title={t('home.leaders')}
      kicker={t('home.leaders.kicker')}
      more={{ href: statsHref, label: t('home.leaders.all') }}
    >
      <ul
        className="ui-spot-row"
        data-across={(['one', 'two', 'three'] as const)[Math.min(leaders.length, 3) - 1]}
      >
        {cards}
      </ul>
    </Section>
  );
}
