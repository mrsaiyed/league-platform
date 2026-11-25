// League settings → Admins (step 2.97, P4 §4 and §6): invite someone by email and role;
// the people with access, by name ("No name yet" for someone who has given none, A-14),
// with "Remove access", which asks first; the invitations not yet accepted, with "Send
// again" and "Cancel invitation"; and the latest changes to who has access (A-6).
//
// Only someone who may manage access for the whole league sees it: League settings is
// refused to anyone else before anything is read (loadLeaguePage), and the access module's
// own list refuses again (access.list_access); the names are read only after that. Every
// form posts to a command whose context comes from the session (admins-actions.ts).
import {
  activityPageLimit,
  invitationLifetimeDays,
  leagueUrl,
  listAccess,
  searchActivity,
  type Role,
} from '@srleagues/core';
import { PageHead } from '@srleagues/ui';
import { forbidden } from 'next/navigation';
import { commandContextOf } from '../../server/context.ts';
import { webPorts } from '../../server/container.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { locale, t, type TextKey } from '../../server/messages.ts';
import { requestTokenField } from '../../server/same-request.ts';
import { noticeHolderOf, savedNoticesHere, type SavedNotice } from '../../server/saved-notice.ts';
import { SaidLine } from '../list-forms/said-line.tsx';
import { StaffPill, StaffTrail } from '../staff/index.ts';
import { adminsView, offeredRoles, type PersonLine } from './access-view.ts';
import { cancelAction, inviteAction, removeAction, resendAction } from './admins-actions.ts';
import { adminsAnchors } from './admins-anchors.ts';
import { InviteForm } from './invite-form.tsx';
import { RowActionForm } from './row-action-form.tsx';

const roleName = (role: Role | 'owner') => t(`role.${role}` as TextKey);
/** A role's name, and that it is for one program when it is (P4 §4). */
const roleIn = (role: Role, program: boolean) =>
  program ? t('adminAccess.forOneProgram', { role: roleName(role) }) : roleName(role);

export async function AdminsPage({ league }: { readonly league: string }) {
  const view = await loadLeaguePage(league, 'admin', 'settings');
  const here = view.context.league;
  const context = commandContextOf(view.context);
  const ports = await webPorts();
  const { deps } = ports.adminAccess;
  const listed = await listAccess(context, {}, deps);
  // A role limited to one program reaches League settings but not the league's whole list.
  if (!listed.ok) return forbidden();
  const [names, activity, clock] = await Promise.all([
    ports.adminAccess.namesOf(here.id),
    // The newest page of the log's access entries (A-6: kind 'access', so a busy league's
    // other entries never push them out). Read where
    // the activity log page reads it (the bin's transaction: access and the log), so the
    // made-up world shows its own log here too, not the access stand-in's empty one.
    searchActivity(
      context,
      { limit: activityPageLimit, kind: 'access' },
      ports.adminPeople.putBack,
    ),
    ports.publicSchedule.clockOf(here.id),
  ]);
  const shown = adminsView({
    list: listed.value,
    names,
    activity: activity.ok ? activity.value.entries : [],
    you: context.accountId,
  });
  const holder = noticeHolderOf(context);
  const notice = holder === undefined ? undefined : savedNoticesHere().take(holder, 'admins');
  const page = leagueUrl(here, 'admin-area', { area: 'settings', subpath: ['admins'] });
  const day = new Intl.DateTimeFormat(locale, {
    timeZone: clock.timeZone,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const when = new Intl.DateTimeFormat(locale, {
    timeZone: clock.timeZone,
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
  const hidden = (more: Record<string, string> = {}) => ({
    league: here.slug,
    [requestTokenField]: crypto.randomUUID(),
    ...more,
  });
  const saidAt = (thing: string) =>
    notice !== undefined && notice.thing === thing ? <Saved notice={notice} /> : null;
  return (
    <main className="admin-access">
      <StaffTrail
        steps={[
          {
            href: leagueUrl(here, 'admin-area', { area: 'settings' }),
            label: t('admin.area.settings'),
          },
        ]}
        here={t('adminAccess.title')}
      />
      <PageHead title={t('adminAccess.title')} sub={t('adminAccess.intro')} />

      <section id={adminsAnchors.invite} className="staff-panel" aria-labelledby="invite-title">
        <h2 id="invite-title">{t('adminAccess.invite.title')}</h2>
        <p className="staff-quiet">
          {t('adminAccess.invite.body', { days: invitationLifetimeDays })}
        </p>
        <InviteForm
          action={inviteAction}
          permalink={`${page}#${adminsAnchors.invite}`}
          hidden={hidden()}
          roles={offeredRoles.map((role) => ({ value: role, label: roleName(role) }))}
          texts={{
            email: t('adminAccess.invite.email'),
            role: t('adminAccess.invite.role'),
            chooseRole: t('adminAccess.invite.chooseRole'),
            submit: t('adminAccess.invite.submit'),
          }}
        />
        <details>
          <summary>{t('adminAccess.invite.roles')}</summary>
          <ul className="admin-access-roles">
            {offeredRoles.map((role) => (
              <li key={role}>{t(`adminAccess.roleAbout.${role}` as TextKey)}</li>
            ))}
          </ul>
        </details>
      </section>

      <section
        id={adminsAnchors.invitations}
        className="admin-access-part"
        aria-labelledby="invitations-title"
      >
        <h2 id="invitations-title">{t('adminAccess.invitations.title')}</h2>
        {saidAt('invitations')}
        {shown.invitations.length === 0 ? (
          <p className="ui-empty">{t('adminAccess.invitations.none')}</p>
        ) : (
          <ul className="staff-rows">
            {shown.invitations.map((invitation) => (
              <li
                key={invitation.invitationId}
                id={adminsAnchors.invitation(invitation.invitationId)}
                className="admin-access-line"
                data-invitation={invitation.email}
              >
                <div className="admin-access-who">
                  <span className="staff-row-words">
                    <span className="staff-row-name admin-access-address" dir="ltr">
                      {invitation.email}
                    </span>
                    <span className="staff-row-facts">
                      {roleIn(invitation.role, invitation.program)}
                      {' · '}
                      {invitation.expired
                        ? t('adminAccess.invitation.ranOut')
                        : t('adminAccess.invitation.until', {
                            date: day.format(new Date(invitation.expiresAt)),
                          })}
                    </span>
                  </span>
                  <StaffPill kind={invitation.expired ? 'stop' : 'wait'}>
                    {invitation.expired
                      ? t('adminAccess.invitation.expired')
                      : t('adminAccess.invitation.waiting')}
                  </StaffPill>
                </div>
                {saidAt(invitation.invitationId)}
                <div className="admin-access-buttons">
                  <RowActionForm
                    name="resend"
                    action={resendAction}
                    permalink={`${page}#${adminsAnchors.invitation(invitation.invitationId)}`}
                    hidden={hidden({ invitation: invitation.invitationId })}
                    button={t('adminAccess.resend')}
                  />
                  <RowActionForm
                    name="cancel"
                    kind="quiet"
                    action={cancelAction}
                    permalink={`${page}#${adminsAnchors.invitations}`}
                    hidden={hidden({ invitation: invitation.invitationId })}
                    button={t('adminAccess.cancel')}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        id={adminsAnchors.people}
        className="admin-access-part"
        aria-labelledby="people-title"
      >
        <h2 id="people-title">{t('adminAccess.people.title')}</h2>
        {saidAt('people')}
        <ul className="staff-rows">
          {shown.people.map((person) => (
            <Person key={person.accountId} person={person} page={page} hidden={hidden} />
          ))}
        </ul>
      </section>

      <section className="admin-access-part" aria-labelledby="activity-title">
        <h2 id="activity-title">{t('adminAccess.activity.title')}</h2>
        <p>
          <a
            href={leagueUrl(here, 'admin-area', { area: 'settings', subpath: ['activity'] })}
            data-activity-log-link=""
          >
            {t('adminAccess.activity.all')}
          </a>
        </p>
        {shown.activity.length === 0 ? (
          <p className="ui-empty">{t('adminAccess.activity.none')}</p>
        ) : (
          <ul className="staff-rows" data-access-activity="">
            {shown.activity.map((entry) => (
              <li key={entry.id} className="staff-row">
                <span className="staff-row-words">
                  <span className="staff-row-name" dir="auto">
                    {entry.who === undefined
                      ? t('adminAccess.activity.someone')
                      : (entry.who ?? t('adminAccess.noName'))}
                  </span>
                  <span className="staff-row-facts">
                    {t(entry.summary as TextKey, {
                      role: entry.role === undefined ? '' : roleName(entry.role),
                    })}
                    {' · '}
                    <time dateTime={entry.at}>{when.format(new Date(entry.at))}</time>
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function Saved({ notice }: { readonly notice: SavedNotice }) {
  return <SaidLine kind="saved">{t(`adminAccess.saved.${notice.said}` as TextKey)}</SaidLine>;
}

function Person({
  person,
  page,
  hidden,
}: {
  readonly person: PersonLine;
  readonly page: string;
  readonly hidden: (more?: Record<string, string>) => Record<string, string>;
}) {
  const name = person.name ?? t('adminAccess.noName');
  return (
    <li className="admin-access-line" data-person={person.name ?? ''}>
      <div className="admin-access-who">
        <span className="staff-row-words">
          <span className="staff-row-name" dir="auto">
            {name}
            {person.isYou ? (
              <>
                {' '}
                <StaffPill>{t('adminAccess.you')}</StaffPill>
              </>
            ) : null}
          </span>
          <span className="staff-row-facts">
            {person.isOwner
              ? roleName('owner')
              : person.grants.map((grant) => roleIn(grant.role, grant.program)).join('; ')}
          </span>
        </span>
      </div>
      {person.isOwner ? <p className="staff-quiet">{t('adminAccess.owner')}</p> : null}
      {person.grants.map((grant) => (
        <details key={grant.grantId} className="admin-access-remove" data-grant={grant.role}>
          <summary>
            {person.grants.length > 1
              ? `${t('adminAccess.remove.open')}: ${roleIn(grant.role, grant.program)}`
              : t('adminAccess.remove.open')}
          </summary>
          <p>
            {person.isYou
              ? t('adminAccess.remove.questionSelf', { role: roleIn(grant.role, grant.program) })
              : t('adminAccess.remove.question', { name, role: roleIn(grant.role, grant.program) })}
          </p>
          <RowActionForm
            name="remove"
            kind="danger"
            action={removeAction}
            permalink={`${page}#${adminsAnchors.people}`}
            hidden={hidden({ grant: grant.grantId })}
            confirm={t('adminAccess.remove.confirm')}
            button={t('adminAccess.remove.submit')}
          />
        </details>
      ))}
    </li>
  );
}
