import { LeaderSpot, Section } from '@srleagues/ui';
import { t } from '../../server/messages.ts';
import type { HomeLeader, HomeLeadersShown } from '../stats-pages/index.ts';

/**
 * The home page's leaders ("Leading the way"), drawn from what the page worked out;
 * nothing here reads anything. `across` is a section of its own across the page, the
 * cards one, two or three in a row. `beside` stands under the standings, inside their
 * section: a small heading of its own, the way to every player's numbers, and each leader
 * as one short row; the players' names are then one heading level further down.
 *
 * Players level share a place, and a shared first place is never drawn as one leader's
 * card: no card carries the main color, and a line says how many are level for first, as
 * the statistics page draws no card for them. A shared place the room could not hold
 * whole (`levelCut`) is not drawn at all: one line says how many are level there and
 * leads to the statistics page.
 */
export function HomeLeaders({
  leaders,
  levelCut,
  placing,
  statsHref,
}: {
  readonly leaders: readonly HomeLeader[];
  readonly levelCut?: HomeLeadersShown['levelCut'];
  readonly placing: 'across' | 'beside';
  /** The statistics page, where every player's numbers are. */
  readonly statsHref: string;
}) {
  if (leaders.length === 0 && levelCut === undefined) return null;
  const levelForFirst = leaders.filter((leader) => leader.rank === leaders[0]?.rank).length;
  const notes = (
    <>
      {levelForFirst > 1 ? (
        <p className="home-leaders-level">
          {t('home.leaders.levelFirst', { count: String(levelForFirst) })}
        </p>
      ) : null}
      {levelCut === undefined ? null : (
        <p className="home-leaders-level">
          {t('home.leaders.levelCut', {
            count: String(levelCut.count),
            place: String(levelCut.place),
          })}{' '}
          <a href={statsHref}>{t('home.leaders.all')}</a>
        </p>
      )}
    </>
  );
  const cards = leaders.map((leader, index) => (
    <li key={leader.id}>
      <LeaderSpot
        label={leader.label}
        value={leader.value}
        unit={leader.unit}
        name={leader.name}
        detail={leader.detail}
        team={leader.team}
        first={index === 0 && levelForFirst === 1}
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
        {notes}
        {cards.length > 0 ? <ul className="ui-spot-row">{cards}</ul> : null}
      </div>
    );
  }
  return (
    <Section
      title={t('home.leaders')}
      kicker={t('home.leaders.kicker')}
      more={{ href: statsHref, label: t('home.leaders.all') }}
    >
      {notes}
      {cards.length > 0 ? (
        <ul
          className="ui-spot-row"
          data-across={(['one', 'two', 'three'] as const)[Math.min(leaders.length, 3) - 1]}
        >
          {cards}
        </ul>
      ) : null}
    </Section>
  );
}
