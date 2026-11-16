// One team's page in Admin → Teams (step 2.51): its details, who sees its numbers, and
// its roster: people added with a jersey number and a role, put in order, and marked
// as having left (R-17: they stay in the team's history). Every change is a plain form.
import {
  leagueUrl,
  listPeople,
  listRoster,
  rosterRoles,
  type PersonRecord,
  type RosterLine,
} from '@srleagues/core';
import { notFound } from 'next/navigation';
import { webPorts } from '../../server/container.ts';
import { commandContextOf } from '../../server/context.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { StaffTrail } from '../staff/index.ts';
import { t, type TextKey } from '../../server/messages.ts';
import { numbersWornTwice, rosterName } from './roster-name.ts';
import {
  addNewPersonAction,
  addToRosterAction,
  changeEntryAction,
  markLeftAction,
  moveEntryAction,
  removePersonAction,
  removeTeamAction,
  saveTeamAction,
  saveTeamStatsAction,
} from './actions.ts';
import {
  ColorFields,
  DivisionField,
  LeagueField,
  Notice,
  Section,
  StatsVisibilityField,
  Swatch,
  TextField,
} from './parts.tsx';

const uuidShape = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const roleText = (role: string): string =>
  (rosterRoles as readonly string[]).includes(role)
    ? t(`adminTeams.roster.role.${role}` as TextKey)
    : role;

/** A person's name, "#12" for one added at the scorer's table by number only (S-34). */
const nameOf = rosterName;

export async function TeamPage({
  league,
  teamId,
  query,
}: {
  /** The route's `[league]` value. */
  readonly league: string;
  /** The route's team value: the team's id. */
  readonly teamId: string;
  readonly query: Readonly<Record<string, string | string[] | undefined>>;
}) {
  const view = await loadLeaguePage(league, 'admin', 'teams');
  const here = view.context.league;
  if (!uuidShape.test(teamId)) return notFound();
  const ports = (await webPorts()).adminTeams;
  const season = await ports.currentSeason(here.id);
  if (season === undefined) return notFound();
  const [teams, divisions] = await Promise.all([
    ports.teams(here.id, season.id),
    ports.divisions(here.id, season.id),
  ]);
  const team = teams.find((candidate) => candidate.id === teamId.toLowerCase());
  if (team === undefined) return notFound();

  const context = commandContextOf(view.context);
  const roster = await listRoster(context, { teamId: team.id }, ports.deps);
  const lines: readonly RosterLine[] = roster.ok ? roster.value : [];
  const open = lines.filter((line) => line.leftOn === null);
  // S-44: a clash of numbers is marked on both players, for the admin to put right.
  const wornTwice = numbersWornTwice(open);
  const left = lines.filter((line) => line.leftOn !== null);
  const people = await listPeople(context, { limit: 200 }, ports.deps);
  const everyone: readonly PersonRecord[] = people.ok ? people.value : [];
  // A read that fails is shown as such, never as an empty roster or list.
  const readFailed = !roster.ok || !people.ok;
  const onRoster = new Set(open.map((line) => line.personId));
  const available = everyone.filter((person) => !onRoster.has(person.id));
  const listUrl = leagueUrl(here, 'admin-area', { area: 'teams' });

  return (
    <main className="admin-teams admin-team">
      <StaffTrail steps={[{ href: listUrl, label: t('admin.area.teams') }]} here={team.name} />
      <h1>
        <Swatch team={team} />
        {team.name}
      </h1>
      <Notice query={query} />

      <Section title={t('adminTeams.edit.title')}>
        <form action={saveTeamAction} className="staff-form">
          <LeagueField league={here.slug} />
          <input type="hidden" name="team" value={team.id} />
          <input type="hidden" name="version" value={team.version} />
          <TextField
            name="name"
            label={t('adminTeams.field.name')}
            defaultValue={team.name}
            required
            maxLength={120}
          />
          <TextField
            name="shortName"
            label={t('adminTeams.field.shortName')}
            defaultValue={team.slug}
            hint={t('adminTeams.field.shortNameHint')}
            maxLength={60}
          />
          <ColorFields color={team.color} />
          <DivisionField divisions={divisions} value={team.divisionId} />
          <p className="staff-buttons">
            <button type="submit" className="ui-button" data-kind="main">
              {t('adminTeams.edit.submit')}
            </button>
          </p>
        </form>
      </Section>

      <Section title={t('adminTeams.stats.title')}>
        <form action={saveTeamStatsAction} className="staff-form">
          <LeagueField league={here.slug} />
          <input type="hidden" name="team" value={team.id} />
          <input type="hidden" name="version" value={team.version} />
          <StatsVisibilityField
            label={t('adminTeams.field.statsVisibility')}
            value={team.statsVisibility}
          />
          <p className="staff-buttons">
            <button type="submit" className="ui-button" data-kind="main">
              {t('adminTeams.stats.submit')}
            </button>
          </p>
        </form>
      </Section>

      <Section title={t('adminTeams.roster.title')}>
        {!roster.ok ? (
          <p role="alert">{t('adminTeams.roster.readFailed')}</p>
        ) : open.length === 0 ? (
          <p>{t('adminTeams.roster.none')}</p>
        ) : (
          <ol className="admin-roster">
            {open.map((line, place) => (
              <li key={line.id}>
                <strong>{nameOf(line)}</strong>
                {line.needsReview === true ? <> {t('adminTeams.roster.toReview')}</> : null}
                {line.jerseyNumber !== null && wornTwice.has(line.jerseyNumber) ? (
                  <> {t('adminTeams.roster.numberTwice', { number: line.jerseyNumber })}</>
                ) : null}
                <form action={changeEntryAction} className="admin-roster-form">
                  <LeagueField league={here.slug} />
                  <input type="hidden" name="team" value={team.id} />
                  <input type="hidden" name="entry" value={line.id} />
                  <input type="hidden" name="version" value={line.version} />
                  <p className="admin-roster-fields">
                    <label className="staff-field" data-size="figure">
                      {t('adminTeams.roster.number')}
                      <input
                        name="jerseyNumber"
                        type="text"
                        inputMode="numeric"
                        size={3}
                        maxLength={2}
                        defaultValue={line.jerseyNumber ?? ''}
                        placeholder={t('adminTeams.roster.noNumber')}
                        autoComplete="off"
                      />
                    </label>{' '}
                    <RoleSelect value={line.role} />{' '}
                    <button type="submit" className="ui-button" data-kind="main">
                      {t('adminTeams.roster.saveEntry')}
                    </button>
                  </p>
                </form>
                <form action={markLeftAction} className="admin-roster-form">
                  <LeagueField league={here.slug} />
                  <input type="hidden" name="team" value={team.id} />
                  <input type="hidden" name="entry" value={line.id} />
                  <input type="hidden" name="version" value={line.version} />
                  <p>
                    <label>
                      {t('adminTeams.roster.leftOn')}
                      <input name="leftOn" type="date" required />
                    </label>{' '}
                    <button type="submit">{t('adminTeams.roster.markLeft')}</button>
                  </p>
                </form>
                <MoveForm
                  league={here.slug}
                  teamId={team.id}
                  entryId={line.id}
                  place={place}
                  last={open.length - 1}
                  order={open.map((l) => l.id).join(',')}
                />
              </li>
            ))}
          </ol>
        )}
        {left.length === 0 ? null : (
          <>
            <h3>{t('adminTeams.roster.leftTitle')}</h3>
            <ul className="admin-left">
              {left.map((line) => (
                <li key={line.id}>
                  {t('adminTeams.roster.leftLine', {
                    name: nameOf(line),
                    date: line.leftOn ?? '',
                  })}
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>

      <Section title={t('adminTeams.add.title')}>
        {readFailed ? (
          <p role="alert">{t('adminTeams.add.readFailed')}</p>
        ) : available.length === 0 ? (
          <p>{t('adminTeams.add.noOne')}</p>
        ) : (
          <form action={addToRosterAction} className="staff-form">
            <LeagueField league={here.slug} />
            <input type="hidden" name="team" value={team.id} />
            <p>
              <label className="staff-field">
                {t('adminTeams.add.person')}
                <select name="personId" required defaultValue="">
                  <option value="" disabled>
                    {t('adminTeams.add.choose')}
                  </option>
                  {available.map((person) => (
                    <option key={person.id} value={person.id}>
                      {nameOf(person)}
                    </option>
                  ))}
                </select>
              </label>
            </p>
            <NumberAndRole />
            <p className="staff-buttons">
              <button type="submit" className="ui-button" data-kind="main">
                {t('adminTeams.add.submit')}
              </button>
            </p>
          </form>
        )}
      </Section>

      <Section title={t('adminTeams.newPerson.title')}>
        <form action={addNewPersonAction} className="staff-form">
          <LeagueField league={here.slug} />
          <input type="hidden" name="team" value={team.id} />
          <TextField
            name="firstName"
            label={t('adminTeams.newPerson.firstName')}
            required
            maxLength={100}
          />
          <TextField
            name="lastName"
            label={t('adminTeams.newPerson.lastName')}
            required
            maxLength={100}
          />
          <NumberAndRole />
          <p className="staff-buttons">
            <button type="submit" className="ui-button" data-kind="main">
              {t('adminTeams.newPerson.submit')}
            </button>
          </p>
        </form>
      </Section>

      <Section title={t('adminTeams.people.title')}>
        <p>{t('adminTeams.people.body')}</p>
        {people.ok ? null : <p role="alert">{t('adminTeams.people.readFailed')}</p>}
        <ul className="staff-rows admin-people">
          {everyone.map((person) => (
            <li key={person.id}>
              {nameOf(person)}
              <form action={removePersonAction} className="admin-person-form">
                <LeagueField league={here.slug} />
                <input type="hidden" name="team" value={team.id} />
                <input type="hidden" name="personId" value={person.id} />
                <ConfirmBox />
                <button type="submit">{t('adminTeams.people.remove')}</button>
              </form>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={t('adminTeams.remove.title')}>
        <p>{t('adminTeams.remove.body')}</p>
        <form action={removeTeamAction}>
          <LeagueField league={here.slug} />
          <input type="hidden" name="team" value={team.id} />
          <ConfirmBox />
          <button type="submit">{t('adminTeams.remove.submit')}</button>
        </form>
      </Section>
    </main>
  );
}

/** A plain tick the action requires before something goes to the bin (works with no script). */
function ConfirmBox() {
  return (
    <p>
      <label className="staff-check">
        <input type="checkbox" name="confirm" required /> {t('adminTeams.confirm')}
      </label>
    </p>
  );
}

function RoleSelect({ value }: { readonly value: string }) {
  return (
    <label className="staff-field">
      {t('adminTeams.roster.role')}
      <select name="role" defaultValue={value}>
        {rosterRoles.map((role) => (
          <option key={role} value={role}>
            {roleText(role)}
          </option>
        ))}
      </select>
    </label>
  );
}

function NumberAndRole() {
  return (
    <p className="admin-roster-fields">
      <label className="staff-field" data-size="figure">
        {t('adminTeams.add.number')}
        <input
          name="jerseyNumber"
          type="text"
          inputMode="numeric"
          size={3}
          maxLength={2}
          autoComplete="off"
        />
      </label>{' '}
      <RoleSelect value="player" />
    </p>
  );
}

/** Up and down, each its own small form; the first has no up and the last no down. */
function MoveForm({
  league,
  teamId,
  entryId,
  place,
  last,
  order,
}: {
  readonly league: string;
  readonly teamId: string;
  readonly entryId: string;
  readonly place: number;
  readonly last: number;
  /** The open entries in the order the admin sees them, so a stale page is noticed. */
  readonly order: string;
}) {
  if (last === 0) return null;
  return (
    <form action={moveEntryAction} className="admin-move">
      <LeagueField league={league} />
      <input type="hidden" name="team" value={teamId} />
      <input type="hidden" name="entry" value={entryId} />
      <input type="hidden" name="order" value={order} />
      <p className="staff-buttons">
        {place === 0 ? null : (
          <button
            type="submit"
            name="moveUp"
            className="ui-button"
            data-kind="quiet"
            data-icon="up"
          >
            {t('adminTeams.roster.moveUp')}
          </button>
        )}{' '}
        {place === last ? null : (
          <button
            type="submit"
            name="moveDown"
            className="ui-button"
            data-kind="quiet"
            data-icon="down"
          >
            {t('adminTeams.roster.moveDown')}
          </button>
        )}
      </p>
    </form>
  );
}
