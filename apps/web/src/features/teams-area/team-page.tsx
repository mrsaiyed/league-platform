// One team's page in Admin → Teams (step 2.51): its details, who sees its numbers, and
// its roster: people added with a jersey number and a role, put in order, and marked
// as having left (R-17: they stay in the team's history), and put back when that was a
// mistake (step 2.161). Every change is a plain form.
import {
  countTeamGames,
  leagueUrl,
  listPeople,
  listRoster,
  rosterRoles,
  type PersonRecord,
  type RosterLine,
} from '@srleagues/core';
import { PageHead } from '@srleagues/ui';
import { notFound } from 'next/navigation';
import { webPorts } from '../../server/container.ts';
import { commandContextOf } from '../../server/context.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { StaffField, StaffNotice, StaffTrail } from '../staff/index.ts';
import { leagueDayText } from '../../server/game-when.ts';
import { locale, t, type TextKey } from '../../server/messages.ts';
import {
  doneAtOf,
  entryAnchor,
  leavingAtOf,
  problemKey,
  removeRefusalOf,
  removeTeamAnchor,
} from './answer.ts';
import { gamesLine, refusalWords } from './remove-team-words.ts';
import { putBackOffer } from './put-back-offer.ts';
import { saidOnLine } from './said-on-line.ts';
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

/** Where "Add a player", the page's main action, leads: the form's own place on the page. */
const addPlayerAnchor = 'add-player';

const uuidShape = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** How many of the league list one page reads. */
const peopleShown = 200;

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
  const people = await listPeople(context, { limit: peopleShown }, ports.deps);
  const everyone: readonly PersonRecord[] = people.ok ? people.value : [];
  const leagueList = people.ok
    ? { ids: new Set(everyone.map((person) => person.id)), complete: everyone.length < peopleShown }
    : undefined;
  // A read that fails is shown as such, never as an empty roster or list.
  const readFailed = !roster.ok || !people.ok;
  const onRoster = new Set(open.map((line) => line.personId));
  const available = everyone.filter((person) => !onRoster.has(person.id));
  const listUrl = leagueUrl(here, 'admin-area', { area: 'teams' });
  // A refused leaving date is said beside the line it was typed in, with the date kept.
  const leaving = leavingAtOf(query);
  const besideEntry = open.some((line) => line.id === leaving?.entry) ? leaving : undefined;
  const leavingProblem = besideEntry === undefined ? undefined : problemKey(query);
  // What went well on one line is said on that line, naming the player (step 2.161).
  const onLine = saidOnLine(doneAtOf(query), lines, team.name);
  // What the team has of games, and why "Remove this team" was refused, said in its panel (A-17).
  const counted = await countTeamGames(context, { teamId: team.id }, ports.deps);
  const games = counted.ok ? counted.value : undefined;
  const removeCode = removeRefusalOf(query);
  const removeRefused =
    removeCode === undefined
      ? undefined
      : { code: removeCode, ...refusalWords(team.name, removeCode, games) };
  const saidHere = (entryId: string) =>
    onLine?.entry !== entryId ? null : (
      <StaffNotice kind="saved" data={{ 'data-said-on': entryId }}>
        {onLine.text}
      </StaffNotice>
    );

  return (
    <main className="admin-teams admin-team">
      {/* The way back, then the page's head: the team's shield and name, one line of what
          the page is for, and its main action at the top right (step 2.103). */}
      <StaffTrail steps={[{ href: listUrl, label: t('admin.area.teams') }]} here={team.name} />
      <PageHead title={team.name} sub={t('adminTeams.team.sub')} lead={<Swatch team={team} />}>
        <a className="ui-button" data-kind="main" data-icon="plus" href={`#${addPlayerAnchor}`}>
          {t('adminTeams.add.title')}
        </a>
      </PageHead>
      <Notice
        query={query}
        saidBeside={
          leavingProblem !== undefined || onLine !== undefined || removeRefused !== undefined
        }
      />

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
          {/* The page's one filled button is "Add a player", at its head and on the form
              it leads to; every other save here is outlined (step 2.103). */}
          <p className="staff-buttons">
            <button type="submit" className="ui-button">
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
            <button type="submit" className="ui-button">
              {t('adminTeams.stats.submit')}
            </button>
          </p>
        </form>
      </Section>

      <Section title={t('adminTeams.roster.title')}>
        {!roster.ok ? (
          <StaffNotice kind="refused">{t('adminTeams.roster.readFailed')}</StaffNotice>
        ) : open.length === 0 ? (
          <p className="staff-quiet">{t('adminTeams.roster.none')}</p>
        ) : (
          <ol className="admin-roster">
            {open.map((line, place) => (
              <li key={line.id} id={entryAnchor(line.id)}>
                {/* The player's line: their name, then what needs a look, in its own color. */}
                <p className="admin-roster-name">
                  <strong dir="auto">{nameOf(line)}</strong>
                  {line.needsReview === true ? (
                    <span data-flag="review"> {t('adminTeams.roster.toReview')}</span>
                  ) : null}
                  {line.jerseyNumber !== null && wornTwice.has(line.jerseyNumber) ? (
                    <span data-flag="clash">
                      {' '}
                      {t('adminTeams.roster.numberTwice', { number: line.jerseyNumber })}
                    </span>
                  ) : null}
                </p>
                {saidHere(line.id)}
                <form action={changeEntryAction} className="admin-roster-form">
                  <LeagueField league={here.slug} />
                  <input type="hidden" name="team" value={team.id} />
                  <input type="hidden" name="entry" value={line.id} />
                  <input type="hidden" name="version" value={line.version} />
                  <p className="admin-roster-fields">
                    <StaffField label={t('adminTeams.roster.number')} size="figure">
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
                    </StaffField>{' '}
                    <RoleSelect value={line.role} />{' '}
                    <button type="submit" className="ui-button">
                      {t('adminTeams.roster.saveEntry')}
                    </button>
                  </p>
                </form>
                <form action={markLeftAction} className="admin-roster-form">
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
            <ul className="admin-left">
              {left.map((line) => (
                <li key={line.id} id={entryAnchor(line.id)} data-left-entry={line.id}>
                  <span className="admin-left-line">
                    {/* The day in words, as the public pages write a day (step 2.103). */}
                    {t('adminTeams.roster.leftLine', {
                      name: nameOf(line),
                      date: leagueDayText(line.leftOn ?? '', locale),
                    })}
                  </span>
                  {saidHere(line.id)}
                  {/* Offered only where it can work (step 2.161); else said in words. */}
                  {putBackOffer(line.personId, onRoster, leagueList) === 'back' ? (
                    <p className="staff-quiet" data-put-back-not-offered="back">
                      {t('adminTeams.roster.backAlready')}
                    </p>
                  ) : putBackOffer(line.personId, onRoster, leagueList) === 'off-the-list' ? (
                    <p className="staff-quiet" data-put-back-not-offered="off-the-list">
                      {t('adminTeams.roster.offTheList')}
                    </p>
                  ) : (
                    <form action={putBackAction} className="admin-left-form">
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
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>

      <Section title={t('adminTeams.add.title')} id={addPlayerAnchor}>
        {readFailed ? (
          <StaffNotice kind="refused">{t('adminTeams.add.readFailed')}</StaffNotice>
        ) : available.length === 0 ? (
          <p className="staff-quiet">{t('adminTeams.add.noOne')}</p>
        ) : (
          <form action={addToRosterAction} className="staff-form">
            <LeagueField league={here.slug} />
            <input type="hidden" name="team" value={team.id} />
            <p>
              <StaffField label={t('adminTeams.add.person')}>
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
              </StaffField>
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
            <button type="submit" className="ui-button">
              {t('adminTeams.newPerson.submit')}
            </button>
          </p>
        </form>
      </Section>

      <Section title={t('adminTeams.people.title')}>
        <p className="staff-quiet">{t('adminTeams.people.body')}</p>
        {people.ok ? null : (
          <StaffNotice kind="refused">{t('adminTeams.people.readFailed')}</StaffNotice>
        )}
        <ul className="staff-rows admin-people">
          {everyone.map((person) => (
            <li key={person.id}>
              <span className="staff-row-name" dir="auto">
                {nameOf(person)}
              </span>
              <form action={removePersonAction} className="admin-person-form">
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

      <Section title={t('adminTeams.remove.title')} kind="danger" id={removeTeamAnchor}>
        <p className="staff-quiet">{t('adminTeams.remove.body')}</p>
        {/* What the team has of games (A-17), and how many people the bin would take with
            it, said before anything is confirmed. */}
        <p
          className="staff-quiet"
          data-remove-games={games === undefined ? 'unknown' : `${games.played}/${games.toPlay}`}
        >
          {gamesLine(team.name, games)}
        </p>
        <p className="staff-quiet" data-remove-roster-count={open.length}>
          {!roster.ok
            ? t('adminTeams.remove.rosterUnknown')
            : open.length === 0
              ? t('adminTeams.remove.rosterNone')
              : t.plural('adminTeams.remove.roster', open.length)}
        </p>
        {removeRefused === undefined ? null : (
          <StaffNotice kind="refused" data={{ 'data-remove-refused': removeRefused.code }}>
            <p>{removeRefused.text}</p>
            {removeRefused.wayOn === null ? null : (
              <p>
                <a
                  className="ui-button"
                  href={leagueUrl(here, 'admin-area', { area: removeRefused.wayOn })}
                >
                  {t(
                    removeRefused.wayOn === 'schedule'
                      ? 'adminTeams.remove.toSchedule'
                      : 'adminTeams.remove.toGames',
                  )}
                </a>
              </p>
            )}
          </StaffNotice>
        )}
        <form action={removeTeamAction} className="staff-form">
          <LeagueField league={here.slug} />
          <input type="hidden" name="team" value={team.id} />
          <ConfirmBox />
          <p className="staff-buttons">
            <button type="submit" className="ui-button" data-kind="danger">
              {t('adminTeams.remove.submit')}
            </button>
          </p>
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
        <StaffField label={t('adminTeams.roster.leftOn')}>
          <input
            name="leftOn"
            type="date"
            required
            defaultValue={typed ?? ''}
            aria-describedby={problem === undefined ? helpId : `${errorId} ${helpId}`}
            aria-invalid={problem === undefined ? undefined : true}
          />
        </StaffField>
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
      <label className="staff-check">
        <input type="checkbox" name="confirm" required /> {t('adminTeams.confirm')}
      </label>
    </p>
  );
}

function RoleSelect({ value }: { readonly value: string }) {
  return (
    <StaffField label={t('adminTeams.roster.role')}>
      <select name="role" defaultValue={value}>
        {rosterRoles.map((role) => (
          <option key={role} value={role}>
            {roleText(role)}
          </option>
        ))}
      </select>
    </StaffField>
  );
}

function NumberAndRole() {
  return (
    <p className="admin-roster-fields">
      <StaffField label={t('adminTeams.add.number')} size="figure">
        <input
          name="jerseyNumber"
          type="text"
          inputMode="numeric"
          size={3}
          maxLength={2}
          autoComplete="off"
        />
      </StaffField>{' '}
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
