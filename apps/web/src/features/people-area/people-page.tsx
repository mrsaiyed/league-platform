// Admin → People (step 2.50; P4 §3, P6 §4): everyone in the league in one list, on a team
// or not (the players of a team in the bin too), searched by name, fifty to a page; each
// person's name leads to their own record, where their details are fixed and their league
// record is removed. Someone new is added here by hand, with a name only, on no team.
// Drawn as the admin's list pages are (step 2.103): a title, one line of what it is for,
// the main action at the top right ("Add a person", which leads to the form), each person
// a row with one way in, and an empty list a calm panel with the action.
//
// The list shows names only. A person's contact email, birth date and whether they are a
// child are on their own page, and only for a role that may see them (R-16).
import { allows, leagueScope, leagueUrl, type AdminArea } from '@srleagues/core';
import { EmptyPanel, PageHead } from '@srleagues/ui';
import { webPorts } from '../../server/container.ts';
import { commandContextOf } from '../../server/context.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { t } from '../../server/messages.ts';
import { requestTokenField } from '../../server/same-request.ts';
import { noticeHolderOf, savedNoticesHere } from '../../server/saved-notice.ts';
import { StaffField, StaffNotice } from '../staff/index.ts';
import { addPersonAction } from './actions.ts';
import { addPersonAnchor } from './anchors.ts';
import { personFormWords } from './form-words.ts';
import { peopleAskOf, peoplePageSize, readPeopleList, type PeopleAsk } from './people-view.ts';
import { PersonForm } from './person-form.tsx';

const area: AdminArea = 'people';

export async function PeoplePage({
  league,
  query,
}: {
  /** The route's `[league]` value. */
  readonly league: string;
  readonly query: Readonly<Record<string, string | string[] | undefined>>;
}) {
  const view = await loadLeaguePage(league, 'admin', area);
  const here = view.context.league;
  const context = commandContextOf(view.context);
  const ports = await webPorts();
  const ask = peopleAskOf(query);
  const [list, holder] = await Promise.all([
    readPeopleList(context, ask, ports.adminPeople.deps),
    ports.accessOf(context),
  ]);
  // The private boxes of the add form only for a role that may set them: the same rule the
  // people commands use (league-wide people.read_sensitive, R-16).
  const mayEnterPrivate =
    holder !== undefined && allows(holder, 'people.read_sensitive', leagueScope);
  const noticeHolder = noticeHolderOf(context);
  const notice =
    noticeHolder === undefined ? undefined : savedNoticesHere().take(noticeHolder, 'people');
  const listUrl = leagueUrl(here, 'admin-area', { area });
  const pageUrl = (page: number) =>
    leagueUrl(here, 'admin-area', {
      area,
      query: {
        ...(ask.search === undefined ? {} : { q: ask.search }),
        ...(page === 1 ? {} : { page: String(page) }),
      },
    });

  return (
    <main className="admin-teams">
      <PageHead title={t('admin.area.people')} sub={t('adminPeople.sub')}>
        <a className="ui-button" data-kind="main" data-icon="plus" href={`#${addPersonAnchor}`}>
          {t('adminPeople.add.title')}
        </a>
      </PageHead>
      {notice?.said === 'removed' ? (
        <StaffNotice kind="removed">{t('adminPeople.removed')}</StaffNotice>
      ) : null}

      <section className="staff-panel admin-team-part">
        <form method="get" action={listUrl} role="search" className="staff-form">
          <StaffField label={t('adminPeople.search.label')}>
            <input
              name="q"
              type="search"
              maxLength={100}
              // An email address is not sent: the browser stops it before it would ride
              // in the address, with scripts off too; the server refuses one anyway.
              pattern="[^@]*"
              title={t('adminPeople.search.noEmail')}
              autoComplete="off"
              defaultValue={ask.search ?? ''}
            />
          </StaffField>
          <p className="staff-buttons">
            <button type="submit" className="ui-button">
              {t('adminPeople.search.submit')}
            </button>
            {ask.search === undefined && !ask.emailRefused ? null : (
              <a className="ui-button" data-kind="quiet" href={listUrl}>
                {t('adminPeople.search.clear')}
              </a>
            )}
          </p>
        </form>
        {ask.emailRefused ? (
          <p className="ui-notice" role="status">
            {t('adminPeople.search.noEmail')}
          </p>
        ) : null}
      </section>

      <List ask={ask} list={list} league={here} pageUrl={pageUrl} />

      <div id={addPersonAnchor} className="admin-add-team">
        <section className="staff-panel admin-team-part">
          <h2>{t('adminPeople.add.title')}</h2>
          <PersonForm
            action={addPersonAction}
            permalink={`${listUrl}#${addPersonAnchor}`}
            hidden={{ league: here.slug, [requestTokenField]: crypto.randomUUID() }}
            values={{ firstName: '', lastName: '' }}
            privateDetails={
              mayEnterPrivate ? { contactEmail: '', birthDate: '', child: '' } : undefined
            }
            today={(await ports.publicSchedule.clockOf(here.id)).today}
            words={personFormWords(t('adminPeople.add.submit'))}
            main
          />
        </section>
      </div>
    </main>
  );
}

function List({
  ask,
  list,
  league,
  pageUrl,
}: {
  readonly ask: PeopleAsk;
  readonly list: Awaited<ReturnType<typeof readPeopleList>>;
  readonly league: { readonly id: string; readonly slug: string };
  readonly pageUrl: (page: number) => string;
}) {
  // A read that fails is said as such, never drawn as an empty league.
  if (!list.ok) return <StaffNotice kind="refused">{t('adminPeople.readFailed')}</StaffNotice>;
  if (list.rows.length === 0) {
    return ask.search === undefined && ask.page === 1 ? (
      <EmptyPanel
        text={t('adminPeople.empty')}
        action={{ href: `#${addPersonAnchor}`, label: t('adminPeople.add.title') }}
      />
    ) : (
      <EmptyPanel text={t('adminPeople.noMatch')} />
    );
  }
  return (
    <>
      <ul className="staff-rows" aria-label={t('adminPeople.list.label')}>
        {list.rows.map((person) => (
          // The link is the person's name alone and covers the whole row (staff.css).
          <li key={person.id} className="staff-row" data-person={person.id}>
            <span className="staff-row-words">
              <a
                className="staff-row-link"
                href={leagueUrl(league, 'admin-area', { area, subpath: [person.id] })}
                dir="auto"
              >
                {person.name}
              </a>
            </span>
          </li>
        ))}
      </ul>
      {ask.page === 1 && !list.more ? null : (
        <p className="staff-buttons">
          {ask.page === 1 ? null : (
            <a className="ui-button" data-kind="quiet" href={pageUrl(ask.page - 1)}>
              {t('adminPeople.list.previous', { count: peoplePageSize })}
            </a>
          )}
          {list.more ? (
            <a className="ui-button staff-apart" data-kind="quiet" href={pageUrl(ask.page + 1)}>
              {t('adminPeople.list.next', { count: peoplePageSize })}
            </a>
          ) : null}
        </p>
      )}
    </>
  );
}
