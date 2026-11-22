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
import { redirect } from 'next/navigation';
import { webPorts } from '../../server/container.ts';
import { commandContextOf } from '../../server/context.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { t } from '../../server/messages.ts';
import { requestTokenField } from '../../server/same-request.ts';
import { noticeHolderOf, savedNoticesHere } from '../../server/saved-notice.ts';
import { StaffField, StaffNotice } from '../staff/index.ts';
import { addPersonAction, putBackPersonAction, searchPeopleAction } from './actions.ts';
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
  // An address that holds an email (typed in by hand) is sent on to the clean one, which
  // says why under the box; so is a search the action turned away.
  if (ask.emailRefused) {
    if (noticeHolder !== undefined) {
      savedNoticesHere().leave(noticeHolder, {
        screen: 'people',
        thing: '',
        said: 'email-not-searched',
      });
    }
    redirect(listUrl);
  }
  const emailRefused = notice?.said === 'email-not-searched';
  const noEmailId = 'people-search-no-email';
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
        // The way back from one wrong tap, right where it is said (A-5).
        <StaffNotice kind="removed" data={{ 'data-removed': notice.thing }}>
          <p>
            {notice.name === undefined
              ? t('adminPeople.removed.unnamed')
              : t('adminPeople.removed', { name: notice.name })}
          </p>
          <form action={putBackPersonAction}>
            <input type="hidden" name="league" value={here.slug} />
            <input type="hidden" name="personId" value={notice.thing} />
            <input type="hidden" name={requestTokenField} value={crypto.randomUUID()} />
            <button type="submit" className="ui-button">
              {t('adminPeople.putBack.submit')}
            </button>
          </form>
        </StaffNotice>
      ) : null}
      {notice?.said.startsWith('notPutBack.') === true ? (
        <StaffNotice kind="refused">
          {t('adminPeople.putBack.notPutBack', {
            problem:
              notice.said === 'notPutBack.person-profile-taken'
                ? t('error.leagues.restore_person.person-profile-taken')
                : t('error.leagues.restore_person.person-not-found'),
          })}
        </StaffNotice>
      ) : null}

      <section className="staff-panel admin-team-part">
        {/* Posted, so an email address typed here never rides in an address: the action
            sends a name on to the list's address, and an email to its clean one. */}
        <form action={searchPeopleAction} role="search" className="staff-form">
          <input type="hidden" name="league" value={here.slug} />
          <StaffField label={t('adminPeople.search.label')}>
            <input
              name="q"
              type="search"
              maxLength={100}
              autoComplete="off"
              defaultValue={ask.search ?? ''}
              {...(emailRefused ? { 'aria-describedby': noEmailId } : {})}
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
        {emailRefused ? (
          <p id={noEmailId} className="ui-notice" role="status">
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
