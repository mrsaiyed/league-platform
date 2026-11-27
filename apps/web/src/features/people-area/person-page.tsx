// One person's record in Admin → People (step 2.50; P4 §3, P6 §4): their details, fixed
// in one form, and their league record removed to the bin (A-5), apart at the foot. A
// misspelt name is put right here, and the right name is on every page of the league at
// once, a child's on a public roster included (the 2.106 audit, H11). Each roster line of
// a team's page leads here.
//
// The private details (contact email, date of birth, child or adult) are read only for a
// role that may see them (people.get_person selects them only then, R-16, T-76): for any
// other role they are not read, so they are neither drawn nor in the page's data.
import {
  leagueUrl,
  nameRequestReasons,
  nameRequests,
  publicViewer,
  showName,
  type AdminArea,
  type Audience,
  type NamePolicy,
} from '@srleagues/core';
import { PageHead } from '@srleagues/ui';
import { notFound } from 'next/navigation';
import { webPorts } from '../../server/container.ts';
import { commandContextOf } from '../../server/context.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { t } from '../../server/messages.ts';
import { requestTokenField } from '../../server/same-request.ts';
import { noticeHolderOf, savedNoticesHere } from '../../server/saved-notice.ts';
import { StaffTrail } from '../staff/index.ts';
import { removePersonAction, savePersonAction, setNameRequestAction } from './actions.ts';
import { treatedAsChild, treatmentOf, type Treatment } from './age-on-record.ts';
import { addPersonAnchor, detailsAnchor, removeAnchor, showAsAnchor } from './anchors.ts';
import { personFormWords } from './form-words.ts';
import { readPerson, type PersonView } from './people-view.ts';
import { PersonForm } from './person-form.tsx';
import { NameRequestForm } from './name-request-form.tsx';
import { showAsChoicesFor } from './name-request.ts';
import { RemoveForm } from './remove-form.tsx';
import { addToRosterAction } from '../teams-area/index.ts';
import { currentTeams, currentTeamsByPerson } from './teams-of-people.ts';

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
  const taken = holder === undefined ? undefined : savedNoticesHere().take(holder, 'person');
  // S-109: a save that recorded the adult league's first child says so as well.
  const firstChild = taken?.said.endsWith('.firstChild') === true && taken.thing === person.id;
  const notice =
    taken === undefined ? undefined : { ...taken, said: taken.said.replace(/\.firstChild$/, '') };
  const said =
    notice?.thing !== person.id
      ? undefined
      : notice.said === 'added'
        ? t('adminPeople.added', { name: person.name })
        : notice.said === 'saved'
          ? t('adminPeople.saved', { name: person.name })
          : notice.said === 'putBack'
            ? t('adminPeople.putBack', { name: person.name })
            : undefined;
  // The league's own today (the ports' one clock): who is a child is measured on it (R-28).
  const leagueToday = (await (await webPorts()).publicSchedule.clockOf(here.id)).today;
  const teams = (await currentTeamsByPerson(context)).get(person.id) ?? [];
  const addable = (await currentTeams(context)).filter(
    (team) => !teams.some((held) => held.id === team.id),
  );
  // Who plays in the league and how it shows names: what its public pages are drawn with.
  const shownBy = await (await webPorts()).publicStats.settingsOf(here.id);
  const listUrl = leagueUrl(here, 'admin-area', { area });
  const pageUrl = leagueUrl(here, 'admin-area', { area, subpath: [person.id] });

  return (
    <main className="admin-teams admin-team">
      <StaffTrail steps={[{ href: listUrl, label: t('admin.area.people') }]} here={person.name} />
      <PageHead title={person.name} sub={t('adminPeople.person.sub')} />

      <section id={detailsAnchor} className="staff-panel admin-team-part">
        <h2>{t('adminPeople.details.title')}</h2>
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
          childNote={treatmentLineOf(person, leagueToday, {
            id: here.id,
            audience: shownBy.audience,
            policy: shownBy.namePolicy,
          })}
          nameRequest={nameRequestLineOf(person)}
          saved={said}
          today={leagueToday}
          words={personFormWords(t('adminPeople.save.submit'))}
          main
        />
        {firstChild ? (
          <p role="status" data-says="first-child">
            {t('adminPeople.firstChild')}
          </p>
        ) : null}
        {notice?.said === 'added' && notice.thing === person.id ? (
          <p>
            <a className="ui-button" data-kind="quiet" href={`${listUrl}#${addPersonAnchor}`}>
              {t('adminPeople.addAnother')}
            </a>
          </p>
        ) : null}
      </section>

      <section id={showAsAnchor} className="staff-panel admin-team-part" data-show-as="true">
        <h2>{t('adminPeople.showAs.title')}</h2>
        <p className="staff-quiet">{t('adminPeople.showAs.body')}</p>
        <NameRequestForm
          action={setNameRequestAction}
          permalink={`${pageUrl}#${showAsAnchor}`}
          hidden={{
            league: here.slug,
            personId: person.id,
            version: String(person.version),
            [requestTokenField]: crypto.randomUUID(),
          }}
          current={requestOf(person.visibility)}
          saved={
            notice?.said === 'showAsSaved' && notice.thing === person.id
              ? t('adminPeople.showAs.saved', { name: person.name })
              : undefined
          }
          words={{
            showAs: t('adminPeople.showAs.label'),
            choices: showAsChoicesFor(requestOf(person.visibility), here.status).map((value) => ({
              value,
              label: t(`adminPeople.showAs.choice.${value}`),
            })),
            reason: t('adminPeople.showAs.reason.label'),
            chooseReason: t('adminPeople.showAs.reason.choose'),
            reasons: nameRequestReasons.map((value) => ({
              value,
              label: t(`adminPeople.showAs.reason.${value}`),
            })),
            submit: t('adminPeople.showAs.submit'),
          }}
        />
      </section>

      <section className="staff-panel admin-team-part" data-person-teams="true">
        <h2>{t('adminPeople.teams.title')}</h2>
        {teams.length === 0 ? (
          <p className="staff-quiet">{t('adminPeople.teams.none')}</p>
        ) : (
          <ul>
            {teams.map((team) => (
              // The team they are on, said plainly, then its two pages, each named for what
              // it is: so the picker below is never read as one of their teams.
              <li key={team.id}>
                <span dir="auto">{t('adminPeople.teams.on', { team: team.name })}</span>{' '}
                <a href={leagueUrl(here, 'admin-area', { area: 'teams', subpath: [team.id] })}>
                  {t('adminPeople.teams.admin')}
                </a>{' '}
                <a href={leagueUrl(here, 'team', { team: team.slug })}>
                  {t('adminPeople.teams.public')}
                </a>
              </li>
            ))}
          </ul>
        )}
        {addable.length === 0 ? null : (
          // Past the team page's picker (it holds the first names only), someone is put on a
          // team from here: the roster's own command, answered on the team's page.
          <form action={addToRosterAction} className="staff-form" data-add-to-team="true">
            <input type="hidden" name="league" value={here.slug} />
            <input type="hidden" name="personId" value={person.id} />
            <input type="hidden" name="role" value="player" />
            <label className="staff-field">
              <span>
                {t(
                  teams.length === 0
                    ? 'adminPeople.teams.addLabelFirst'
                    : 'adminPeople.teams.addLabel',
                )}
              </span>
              {/* It starts on no team, and the form is not sent until one is chosen. */}
              <select name="team" required defaultValue="">
                <option value="" disabled>
                  {t('adminPeople.teams.choose')}
                </option>
                {addable.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="staff-buttons">
              <button type="submit" className="ui-button">
                {t('adminPeople.teams.add')}
              </button>
            </p>
          </form>
        )}
      </section>

      <section id={removeAnchor} className="staff-panel admin-team-part" data-kind="danger">
        <h2>{t('adminPeople.remove.title')}</h2>
        <p className="staff-quiet">{t('adminPeople.remove.body')}</p>
        {teams.length > 0 ? (
          // While they are on a roster the command refuses: say so, and where to go, in
          // place of a tick and a button that could only be refused.
          <div data-on-roster="true">
            <p>{t('adminPeople.remove.onRoster')}</p>
            <ul>
              {teams.map((team) => (
                <li key={team.id}>
                  <a href={leagueUrl(here, 'admin-area', { area: 'teams', subpath: [team.id] })}>
                    {team.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : (
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
        )}
      </section>
    </main>
  );
}

const treatedText: Readonly<Record<Treatment, () => string>> = {
  'child-by-both': () => t('adminPeople.treated.childByBoth'),
  'child-by-date': () => t('adminPeople.field.childByDate'),
  'child-by-choice': () => t('adminPeople.treated.childByChoice'),
  'child-by-choice-over-date': () => t('adminPeople.field.childByTick'),
  'child-not-recorded': () => t('adminPeople.treated.childNotRecorded'),
  'adult-by-both': () => t('adminPeople.treated.adultByBoth'),
  'adult-by-date': () => t('adminPeople.treated.adultByDate'),
  'adult-by-choice': () => t('adminPeople.treated.adultByChoice'),
  'adult-not-recorded': () => t('adminPeople.treated.adultNotRecorded'),
};

/** What they or their guardian asked for, as the name rule reads it; anything else is none. */
const requestOf = (visibility: string) =>
  nameRequests.find((request) => request === visibility) ?? 'none';

/**
 * The one line under the child-or-adult choice, in every state (R-28, R-15): how they are
 * treated and because of what, then the name the public pages show, from the product's
 * one name rule (showName) as a visitor sees a roster. Only for a role that sees the
 * private details: how a person is treated is worked out from them.
 */
function treatmentLineOf(
  person: PersonView,
  leagueToday: string,
  league: { readonly id: string; readonly audience: Audience; readonly policy: NamePolicy },
): string | undefined {
  const details = person.private;
  if (details === undefined) return undefined;
  const treatment = treatmentOf(details, leagueToday, league.audience);
  const shown = showName(
    {
      firstName: person.firstName,
      lastName: person.lastName,
      isMinor: treatedAsChild(treatment),
      nameRequest: requestOf(person.visibility),
    },
    {
      audience: league.audience,
      policy: league.policy,
      viewer: publicViewer(league.id),
      statsOf: null,
    },
  );
  const showsText = shown.shown
    ? // The sentence ends with its own full stop: a name shortened to an initial ("Marcus O.")
      // does not bring a second one.
      t('adminPeople.publicShows', { name: shown.text.replace(/\.$/, '') })
    : shown.why === 'removed'
      ? t('adminPeople.publicShows.removed')
      : shown.why === 'hidden'
        ? t('adminPeople.publicShows.hidden')
        : t('adminPeople.publicShows.noName');
  return `${treatedText[treatment]()} ${showsText}`;
}

/** Their own request to be shown with less, read only, beside the name (R-23). */
function nameRequestLineOf(person: PersonView): string | undefined {
  const request = requestOf(person.visibility);
  if (request === 'initials') return t('adminPeople.request.initials');
  if (request === 'removed') return t('adminPeople.request.removed');
  return undefined;
}
