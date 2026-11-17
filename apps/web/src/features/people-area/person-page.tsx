// One person's record in Admin → People (step 2.50; P4 §3, P6 §4): their details, fixed
// in one form, and their league record removed to the bin (A-5), apart at the foot. A
// misspelt name is put right here, and the right name is on every page of the league at
// once, a child's on a public roster included (the 2.106 audit, H11). Each roster line of
// a team's page leads here.
//
// The private details (contact email, date of birth, child or adult) are read only for a
// role that may see them (people.get_person selects them only then, R-16, T-76): for any
// other role they are not read, so they are neither drawn nor in the page's data.
import { leagueUrl, type AdminArea } from '@srleagues/core';
import { PageHead } from '@srleagues/ui';
import { notFound } from 'next/navigation';
import { webPorts } from '../../server/container.ts';
import { commandContextOf } from '../../server/context.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { t } from '../../server/messages.ts';
import { requestTokenField } from '../../server/same-request.ts';
import { noticeHolderOf, savedNoticesHere } from '../../server/saved-notice.ts';
import { SavedLine } from '../games-area/saved-line.tsx';
import { StaffTrail } from '../staff/index.ts';
import { removePersonAction, savePersonAction } from './actions.ts';
import { tickKeepsAChild } from './age-on-record.ts';
import { detailsAnchor, removeAnchor } from './anchors.ts';
import { personFormWords, todayForBirthDates } from './form-words.ts';
import { readPerson } from './people-view.ts';
import { PersonForm } from './person-form.tsx';
import { RemoveForm } from './remove-form.tsx';

const area: AdminArea = 'people';
const uuidShape = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PersonPage({
  league,
  personId,
}: {
  /** The route's `[league]` value. */
  readonly league: string;
  /** The route's person value: the person's id. */
  readonly personId: string;
}) {
  const view = await loadLeaguePage(league, 'admin', area);
  const here = view.context.league;
  if (!uuidShape.test(personId)) return notFound();
  const context = commandContextOf(view.context);
  const read = await readPerson(
    context,
    personId.toLowerCase(),
    (await webPorts()).adminPeople.deps,
  );
  // Not in this league, or in the bin: the admin's own "not found".
  if (!read.ok) return notFound();
  const person = read.person;
  const holder = noticeHolderOf(context);
  const notice = holder === undefined ? undefined : savedNoticesHere().take(holder, 'person');
  const said =
    notice?.thing !== person.id
      ? undefined
      : notice.said === 'added'
        ? t('adminPeople.added', { name: person.name })
        : notice.said === 'saved'
          ? t('adminPeople.saved', { name: person.name })
          : undefined;
  const listUrl = leagueUrl(here, 'admin-area', { area });
  const pageUrl = leagueUrl(here, 'admin-area', { area, subpath: [person.id] });

  return (
    <main className="admin-teams admin-team">
      <StaffTrail steps={[{ href: listUrl, label: t('admin.area.people') }]} here={person.name} />
      <PageHead title={person.name} sub={t('adminPeople.person.sub')} />

      <section id={detailsAnchor} className="staff-panel admin-team-part">
        <h2>{t('adminPeople.details.title')}</h2>
        {said === undefined ? null : <SavedLine text={said} />}
        <PersonForm
          action={savePersonAction}
          permalink={`${pageUrl}#${detailsAnchor}`}
          hidden={{
            league: here.slug,
            personId: person.id,
            version: String(person.version),
            [requestTokenField]: crypto.randomUUID(),
          }}
          values={{ firstName: person.firstName, lastName: person.lastName }}
          privateDetails={person.private}
          childNote={
            person.private !== undefined && tickKeepsAChild(person.private, todayForBirthDates())
              ? t('adminPeople.field.childByTick')
              : undefined
          }
          today={todayForBirthDates()}
          words={personFormWords(t('adminPeople.save.submit'))}
          main
        />
      </section>

      <section id={removeAnchor} className="staff-panel admin-team-part" data-kind="danger">
        <h2>{t('adminPeople.remove.title')}</h2>
        <p className="staff-quiet">{t('adminPeople.remove.body')}</p>
        <RemoveForm
          action={removePersonAction}
          permalink={`${pageUrl}#${removeAnchor}`}
          hidden={{
            league: here.slug,
            personId: person.id,
            [requestTokenField]: crypto.randomUUID(),
          }}
          confirm={t('adminPeople.remove.confirm')}
          submit={t('adminPeople.remove.submit')}
        />
      </section>
    </main>
  );
}
