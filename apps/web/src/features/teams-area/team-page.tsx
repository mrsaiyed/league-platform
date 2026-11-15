// One team's page in Admin → Teams (step 2.51): its details, who sees its numbers, and
// its roster: people added with a jersey number and a role, put in order, and marked
// as having left (R-17: they stay in the team's history), and put back when that was a
// mistake (step 2.161). Every change is a plain form.
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
import { t, type TextKey } from '../../server/messages.ts';
import { entryAnchor, leavingAtOf, problemKey } from './answer.ts';
import { numbersWornTwice, rosterName } from './roster-name.ts';
import {
  addNewPersonAction,
  addToRosterAction,
  changeEntryAction,
  markLeftAction,
  moveEntryAction,
  putBackAction,
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
  // A refused leaving date is said beside the line it was typed in, with the date kept.
  const leaving = leavingAtOf(query);
  const besideEntry = open.some((line) => line.id === leaving?.entry) ? leaving : undefined;
  const leavingProblem = besideEntry === undefined ? undefined : problemKey(query);

  return (
    <main>
      <p>
        <a href={listUrl}>{t('adminTeams.allTeams')}</a>
      </p>
      <h1>
        <Swatch team={team} />
        {team.name}
      </h1>
      <Notice query={query} saidBeside={leavingProblem !== undefined} />

      <Section title={t('adminTeams.edit.title')}>
        <form action={saveTeamAction}>
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
          <p>
            <button type="submit">{t('adminTeams.edit.submit')}</button>
          </p>
        </form>
      </Section>

      <Section title={t('adminTeams.stats.title')}>
        <form action={saveTeamStatsAction}>
          <LeagueField league={here.slug} />
          <input type="hidden" name="team" value={team.id} />
          <input type="hidden" name="version" value={team.version} />
          <StatsVisibilityField
            label={t('adminTeams.field.statsVisibility')}
            value={team.statsVisibility}
          />
          <p>
            <button type="submit">{t('adminTeams.stats.submit')}</button>
          </p>
        </form>
      </Section>

      <Section title={t('adminTeams.roster.title')}>
        {!roster.ok ? (
          <p role="alert">{t('adminTeams.roster.readFailed')}</p>
        ) : open.length === 0 ? (
          <p>{t('adminTeams.roster.none')}</p>
        ) : (
          <ol>
            {open.map((line, place) => (
              <li key={line.id} id={entryAnchor(line.id)}>
                <strong>{nameOf(line)}</strong>
                {line.needsReview === true ? <> {t('adminTeams.roster.toReview')}</> : null}
                {line.jerseyNumber !== null && wornTwice.has(line.jerseyNumber) ? (
                  <> {t('adminTeams.roster.numberTwice', { number: line.jerseyNumber })}</>
                ) : null}
                <form action={changeEntryAction}>
                  <LeagueField league={here.slug} />
                  <input type="hidden" name="team" value={team.id} />
                  <input type="hidden" name="entry" value={line.id} />
                  <input type="hidden" name="version" value={line.version} />
                  <p>
                    <label>
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
                    <button type="submit">{t('adminTeams.roster.saveEntry')}</button>
                  </p>
                </form>
                <form action={markLeftAction}>
                  <LeagueField league={here.slug} />
                  <input type="hidden" name="team" value={team.id} />
                  <input type="hidden" name="entry" value={line.id} />
                  <input type="hidden" name="version" value={line.version} />
                  <LeavingDate
                    entryId={line.id}
                    typed={besideEntry?.entry === line.id ? besideEntry.leftOn : undefined}
                    problem={
                      besideEntry?.entry === line.id && leavingProblem !== undefined
                        ? t(leavingProblem)
                        : undefined
                    }
                  />
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
            <ul>
              {left.map((line) => (
                <li key={line.id} data-left-entry={line.id}>
                  {t('adminTeams.roster.leftLine', {
                    name: nameOf(line),
                    date: line.leftOn ?? '',
                  })}
                  <form action={putBackAction}>
                    <LeagueField league={here.slug} />
                    <input type="hidden" name="team" value={team.id} />
                    <input type="hidden" name="entry" value={line.id} />
                    <input type="hidden" name="version" value={line.version} />
                    <p>
                      <button type="submit" className="ui-button">
                        {t('adminTeams.roster.putBack')}
                      </button>
                    </p>
                  </form>
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
          <form action={addToRosterAction}>
            <LeagueField league={here.slug} />
            <input type="hidden" name="team" value={team.id} />
            <p>
              <label>
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
            <p>
              <button type="submit">{t('adminTeams.add.submit')}</button>
            </p>
          </form>
        )}
      </Section>

      <Section title={t('adminTeams.newPerson.title')}>
        <form action={addNewPersonAction}>
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
          <p>
            <button type="submit">{t('adminTeams.newPerson.submit')}</button>
          </p>
        </form>
      </Section>

      <Section title={t('adminTeams.people.title')}>
        <p>{t('adminTeams.people.body')}</p>
        {people.ok ? null : <p role="alert">{t('adminTeams.people.readFailed')}</p>}
        <ul>
          {everyone.map((person) => (
            <li key={person.id}>
              {nameOf(person)}
              <form action={removePersonAction}>
                <LeagueField league={here.slug} />
                <input type="hidden" name="team" value={team.id} />
                <input type="hidden" name="personId" value={person.id} />
                <ConfirmBox />
                <button type="submit" className="ui-button" data-kind="danger">
                  {t('adminTeams.people.remove')}
                </button>
              </form>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={t('adminTeams.remove.title')}>
        <p>{t('adminTeams.remove.body')}</p>
        {/* How many people the bin would take with the team, said before it is confirmed. */}
        <p data-remove-roster-count={open.length}>
          {!roster.ok
            ? t('adminTeams.remove.rosterUnknown')
            : open.length === 0
              ? t('adminTeams.remove.rosterNone')
              : t.plural('adminTeams.remove.roster', open.length)}
        </p>
        <form action={removeTeamAction}>
          <LeagueField league={here.slug} />
          <input type="hidden" name="team" value={team.id} />
          <ConfirmBox />
          <button type="submit" className="ui-button" data-kind="danger">
            {t('adminTeams.remove.submit')}
          </button>
        </form>
      </Section>
    </main>
  );
}

/**
 * The leaving date and "Mark as left": after a refusal the date typed is kept in the
 * field and the reason is said beside it (step 2.161).
 */
function LeavingDate({
  entryId,
  typed,
  problem,
}: {
  readonly entryId: string;
  readonly typed: string | undefined;
  readonly problem: string | undefined;
}) {
  const helpId = `left-on-help-${entryId}`;
  const errorId = `left-on-error-${entryId}`;
  return (
    <>
      <p>
        <label>
          {t('adminTeams.roster.leftOn')}
          <input
            name="leftOn"
            type="date"
            required
            defaultValue={typed ?? ''}
            aria-describedby={problem === undefined ? helpId : `${errorId} ${helpId}`}
            aria-invalid={problem === undefined ? undefined : true}
          />
        </label>
      </p>
      {problem === undefined ? null : (
        <p id={errorId} className="ui-field-error" role="alert" data-left-on-problem={entryId}>
          {problem}
        </p>
      )}
      <p id={helpId} className="ui-field-help">
        {t('adminTeams.roster.leftOnHelp')}
      </p>
      <p>
        <button type="submit" className="ui-button">
          {t('adminTeams.roster.markLeft')}
        </button>
      </p>
    </>
  );
}

/** A plain tick the action requires before something goes to the bin (works with no script). */
function ConfirmBox() {
  return (
    <p>
      <label>
        <input type="checkbox" name="confirm" required /> {t('adminTeams.confirm')}
      </label>
    </p>
  );
}

function RoleSelect({ value }: { readonly value: string }) {
  return (
    <label>
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
    <p>
      <label>
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
    <form action={moveEntryAction}>
      <LeagueField league={league} />
      <input type="hidden" name="team" value={teamId} />
      <input type="hidden" name="entry" value={entryId} />
      <input type="hidden" name="order" value={order} />
      <p>
        {place === 0 ? null : (
          <button type="submit" name="moveUp">
            {t('adminTeams.roster.moveUp')}
          </button>
        )}{' '}
        {place === last ? null : (
          <button type="submit" name="moveDown">
            {t('adminTeams.roster.moveDown')}
          </button>
        )}
      </p>
    </form>
  );
}
