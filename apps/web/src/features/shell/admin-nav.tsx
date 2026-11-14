import { leagueUrl } from '@srleagues/core';
import type { LeagueView } from '../../server/league-gate.ts';
import { t } from '../../server/messages.ts';
import { leagueHomeStayUrl } from '../team-pages/index.ts';

/** The admin's navigation: home, then only the areas this person can use (P4 §3–4). */
export function AdminNav({ view }: { readonly view: LeagueView }) {
  const league = view.context.league;
  return (
    <nav aria-label={t('admin.areasLabel')}>
      <ul>
        <li>
          <a href={leagueUrl(league, 'admin')}>{t('admin.area.home')}</a>
        </li>
        {view.areas.map((area) => (
          <li key={area}>
            <a href={leagueUrl(league, 'admin-area', { area })}>{t(`admin.area.${area}`)}</a>
          </li>
        ))}
        <li>
          <a href={leagueHomeStayUrl(league)}>{t('admin.viewSite')}</a>
        </li>
      </ul>
    </nav>
  );
}
