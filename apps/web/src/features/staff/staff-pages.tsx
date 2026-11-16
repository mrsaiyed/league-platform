// The admin's own plain pages (step 2.103): its home, an area that has no screen yet, and
// "not found" inside the admin. What the home asks a person to do is step 2.129's; here it
// is what exists today, drawn finished: a title that greets, one line, one main action,
// the areas with a screen as cards (the menu's own links, so a phone's first screen is
// somewhere to go, not a list above an empty page), and the areas still to come named
// quietly beneath, not as cards that lead to an empty page.
import { leagueUrl, type AdminArea as Area, type LeagueAddressee } from '@srleagues/core';
import { EmptyPanel, MessagePage, PageHead } from '@srleagues/ui';
import type { LeagueView } from '../../server/league-gate.ts';
import { leagueSites, siteOf } from '../../server/league-site.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { t, type TextKey } from '../../server/messages.ts';
import { isReadyArea } from './staff-area.ts';
import { StaffIcon } from './staff-icon.tsx';

/** One line on what an area is for, for the areas that have a screen today. */
const purposes: Partial<Readonly<Record<Area, TextKey>>> = {
  teams: 'admin.home.purpose.teams',
  schedule: 'admin.home.purpose.schedule',
  games: 'admin.home.purpose.games',
  settings: 'admin.home.purpose.settings',
};

/**
 * The home's one main action, at its top right: something this person does here, not the
 * way to the public site (the menu has that). The home reads nothing but which areas are
 * this person's, so it is the first of their jobs in this order: entering results for
 * whoever has Games (the Games list opens on the games that need one), else the schedule,
 * else the teams, else the settings. Whether a game is waiting right now is for step
 * 2.129, which gives the home its own reads.
 */
const mainActions: readonly (readonly [Area, TextKey])[] = [
  ['games', 'admin.home.action.games'],
  ['schedule', 'admin.home.action.schedule'],
  ['teams', 'admin.home.action.teams'],
  ['settings', 'admin.home.action.settings'],
];

/** The admin's home, for a page that has already checked the admin is open to this person. */
export async function StaffHome({ view }: { readonly view: LeagueView }) {
  const league = view.context.league;
  const site = await siteOf(league, await leagueSites());
  // The areas with a screen are the cards. The ones with no screen yet are not somewhere
  // to go: they are named quietly together under "Coming", and are no links here (the
  // menu still lists each one, marked "Not ready").
  const ready = view.areas.filter(isReadyArea);
  const coming = view.areas.filter((area) => !isReadyArea(area));
  const action = mainActions.find(([area]) => view.areas.includes(area));
  return (
    <main className="staff-home">
      <PageHead
        eyebrow={site.name}
        title={t('admin.home.title')}
        sub={t('admin.home.sub', { league: site.name })}
      >
        {action === undefined ? null : (
          <a
            className="ui-button"
            data-kind="main"
            href={leagueUrl(league, 'admin-area', { area: action[0] })}
          >
            {t(action[1])}
          </a>
        )}
      </PageHead>
      {ready.length === 0 ? null : (
        <section aria-labelledby="staff-home-areas">
          <h2 id="staff-home-areas" className="staff-label">
            {t('admin.home.areas')}
          </h2>
          <ul className="staff-tiles">
            {ready.map((area) => {
              const purpose = purposes[area];
              return (
                <li key={area}>
                  <a className="staff-tile" href={leagueUrl(league, 'admin-area', { area })}>
                    <span className="staff-tile-icon">
                      <StaffIcon name={area} />
                    </span>
                    <span className="staff-tile-words">
                      <span className="staff-tile-name">{t(`admin.area.${area}`)}</span>
                      {purpose === undefined ? null : (
                        <span className="staff-tile-line">{t(purpose)}</span>
                      )}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {/* What else the home shows (numbers, a checklist of what to do next) is step
          2.129's, and stands here, between the cards and what is coming. */}
      {coming.length === 0 ? null : (
        <section aria-labelledby="staff-home-coming" className="staff-coming">
          <h2 id="staff-home-coming" className="staff-label">
            {t('admin.home.coming')}
          </h2>
          <ul>
            {coming.map((area) => (
              <li key={area}>
                <StaffIcon name={area} />
                <span>{t(`admin.area.${area}`)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

/**
 * One area of the admin that has no screen yet: its title and a calm panel that says so,
 * with the way back to the admin's home. "You do not have access" without the area (U-6).
 */
export async function AdminArea({
  league,
  area,
}: {
  /** The route's `[league]` value. */
  readonly league: string;
  readonly area: Area;
}) {
  const view = await loadLeaguePage(league, 'admin', area);
  return (
    <main>
      <PageHead title={t(`admin.area.${area}`)} />
      <EmptyPanel
        title={t('admin.notReady.title')}
        text={t('admin.notReady.body')}
        action={{
          href: leagueUrl(view.context.league, 'admin'),
          label: t('admin.backToAdmin'),
        }}
      />
    </main>
  );
}

/**
 * "You do not have access" inside the admin, for someone the admin is open to who asked
 * for a part of it that is not theirs (a scheduler at Teams). It is drawn inside the
 * admin's frame, in the league's own workspace, as "not found" is (docs/build/DESIGN.md
 * section 4, lines 19 and 20): its one clear way on is the admin's home, and switching
 * accounts is a second, quieter link. Who gets this, and not the plain screen of
 * SR Leagues' own, is decided by the refusal page (app/forbidden.tsx).
 */
export function StaffRefused({
  league,
  email,
  switchHref,
}: {
  readonly league: LeagueAddressee;
  /** The address the person is signed in with. */
  readonly email: string;
  /** Signing in as someone else, and coming back to the address that was refused. */
  readonly switchHref: string;
}) {
  return (
    <MessagePage
      title={t('access.noAccess.title')}
      action={{ href: leagueUrl(league, 'admin'), label: t('admin.backToAdmin') }}
    >
      <p>{t('access.noAccess.body')}</p>
      <p>{t('access.noAccess.signedInAs', { email })}</p>
      <p>
        <a className="ui-button" data-kind="quiet" href={switchHref}>
          {t('access.noAccess.switch')}
        </a>
      </p>
    </MessagePage>
  );
}

/**
 * "Not found" inside the admin: a team, a game or an area that is not there. The admin's
 * frame is around it, and its one way on is the admin's home.
 */
export function StaffNotFound({ league }: { readonly league: LeagueAddressee }) {
  return (
    <MessagePage
      title={t('common.notFoundTitle')}
      action={{ href: leagueUrl(league, 'admin'), label: t('admin.backToAdmin') }}
    >
      <p>{t('common.notFound')}</p>
    </MessagePage>
  );
}
