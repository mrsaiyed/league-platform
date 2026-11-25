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
  statsVisibilityChoices,
  type PersonRecord,
  type RosterLine,
} from '@srleagues/core';
import { PageHead } from '@srleagues/ui';
import { randomUUID } from 'node:crypto';
import { notFound } from 'next/navigation';
import { webPorts } from '../../server/container.ts';
import { commandContextOf } from '../../server/context.ts';
import { holdsHere, loadLeaguePage } from '../../server/load-league-page.ts';
import { binnedTeamPage } from '../bin-area/index.ts';
import { ArchivedSeasonNotice, StaffField, StaffNotice, StaffTrail } from '../staff/index.ts';
import { leagueDayText } from '../../server/game-when.ts';
import { locale, t, type TextKey } from '../../server/messages.ts';
import {
  doneAtOf,
  entryAnchor,
  leavingAtOf,
  problemKey,
  removeRefusalOf,
  removeTeamAnchor,
  addPlayerAnchor,
  fromListAnchor,
  teamDetailsAnchor,
  teamStatsAnchor,
} from './answer.ts';
import { removePanel, tapRefusal, type RemoveWayOn } from './remove-team-words.ts';
import { backToTeamParam, publishAnchor } from '../schedule-builder/index.ts';
import { offTheLeagueList, putBackOffer } from './put-back-offer.ts';
import { FindPersonForm } from './find-person-form.tsx';
import { pickOf } from './person-pick.ts';
import { saidOnLine } from './said-on-line.ts';
import { numbersWornTwice, rosterName } from './roster-name.ts';
import {
  addNewPersonAction,
  addFromListAction,
  changeEntryAction,
  findPersonAction,
  markLeftAction,
  moveEntryAction,
  putBackAction,
  removeTeamAction,
  saveTeamAction,
  markTeamLeftAction,
  saveTeamStatsAction,
  undoTeamLeftAction,
} from './actions.ts';
import { LeagueField, Notice, Section, Swatch } from './parts.tsx';
import { answerQueryOf } from './answer-notice.ts';

import { IntoView, ListForm, SaidLine, takeNotice } from '../list-forms/index.ts';
import { requestTokenField } from '../../server/same-request.ts';

/** Where "Add a player", the page's main action, leads: the form's own place on the page. */

const uuidShape = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** How many of the league list one page reads (step 2.90: then by search or the next page). */
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
  query: asked,
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
  const context = commandContextOf(view.context);
  const season = await ports.currentSeason(context);
  if (season === undefined) return notFound();
  const [teams, divisions] = await Promise.all([
    ports.teams(context, season.id),
    ports.divisions(context, season.id),
  ]);
  const team = teams.find((candidate) => candidate.id === teamId.toLowerCase());
  // A team in the bin: its way back, for staff who may see the bin (step 2.77).
  if (team === undefined) {
    return (await binnedTeamPage(here, context, teamId.toLowerCase())) ?? notFound();
  }

  // A team just added: "Saved" at the top, beside its name, once (step 2.155).
  // This team's notice only: another team's waits for its own page.
  const notice = takeNotice(context, 'teams', team.id);
  const justAdded = notice?.thing === team.id && notice.said === 'created';
  // The details saved, said beside them; a player added, said on their new line (step 2.155).
  const saved = notice?.thing === team.id ? notice.said : undefined;
  // A line added or its number and role saved: said on that line (step 2.155).
  const savedEntry = saved === 'added' || saved === 'entrySaved' ? notice?.about?.[0] : undefined;
  // Every other answer of this team's forms, from the same notice, never the address (T-435).
  const query = answerQueryOf(notice, team.id);
  const teamUrl = leagueUrl(here, 'admin-area', { area: 'teams', subpath: [team.id] });
  const roster = await listRoster(context, { teamId: team.id }, ports.deps);
  const lines: readonly RosterLine[] = roster.ok ? roster.value : [];
  const open = lines.filter((line) => line.leftOn === null);
  // S-44: a clash of numbers is marked on both players, for the admin to put right.
  const wornTwice = numbersWornTwice(open);
  const left = lines.filter((line) => line.leftOn !== null);
  const listUrl = leagueUrl(here, 'admin-area', { area: 'teams' });
  // An archived season (O-12): the team and its roster are read, and nothing is offered
  // that the server would refuse.
  if (season.archived) {
    return (
      <main className="admin-teams admin-team">
        <StaffTrail steps={[{ href: listUrl, label: t('admin.area.teams') }]} here={team.name} />
        <PageHead title={team.name} sub={t('adminTeams.team.sub')} lead={<Swatch team={team} />} />
        <ArchivedSeasonNotice season={season.name} />
        <Section title={t('adminTeams.roster.title')}>
          {!roster.ok ? (
            <StaffNotice kind="refused">{t('adminTeams.roster.readFailed')}</StaffNotice>
          ) : open.length === 0 ? (
            <p className="staff-quiet">{t('adminTeams.roster.none')}</p>
          ) : (
            <ol className="admin-roster">
              {open.map((line) => (
                <li key={line.id} id={entryAnchor(line.id)}>
                  <p className="admin-roster-name">
                    <strong dir="auto">{nameOf(line)}</strong>
                  </p>
                </li>
              ))}
            </ol>
          )}
        </Section>
      </main>
    );
  }
  // Names only: the page shows no private field, so none is read (T-76).
  // A page of 200 at most, or the people whose name holds what was searched for (step
  // 2.90): on the server, in this league only, so a league of any size can pick anyone.
  const pick = pickOf(asked);
  const people = await listPeople(
    context,
    {
      ...(pick.search === undefined ? {} : { search: pick.search }),
      limit: peopleShown,
      offset: (pick.page - 1) * peopleShown,
      privateFields: false,
    },
    ports.deps,
  );
  const everyone: readonly PersonRecord[] = people.ok ? people.value : [];
  // The whole list was read only when nothing was searched and the first page held it all.
  const leagueList = people.ok
    ? {
        ids: new Set(everyone.map((person) => person.id)),
        complete: pick.search === undefined && pick.page === 1 && everyone.length < peopleShown,
      }
    : undefined;
  const pickUrl = (page: number) =>
    `${leagueUrl(here, 'admin-area', {
      area: 'teams',
      subpath: [team.id],
      query: {
        ...(pick.search === undefined ? {} : { q: pick.search }),
        ...(page === 1 ? {} : { page: String(page) }),
      },
    })}#${fromListAnchor}`;
  const morePeople = everyone.length === peopleShown;
  // A role that may not read the league's list of people (a club admin) is told so, in
  // calm words; a read that fails is shown as such, never as an empty roster or list.
  const peopleNotAllowed = !people.ok && people.error.code === 'not-allowed';
  // No form that could only be refused (step 2.157): someone whose role may not add a
  // person to the league (a club admin) is not offered "Someone not in the list yet", and
  // when they can neither choose nor add anyone, the head's "Add a player" is not drawn.
  const mayAddPeople = await holdsHere('people.manage');
  const mayAddPlayer = mayAddPeople || !peopleNotAllowed;
  const readFailed = !roster.ok || (!people.ok && !peopleNotAllowed);
  const onRoster = new Set(open.map((line) => line.personId));
  const available = everyone.filter((person) => !onRoster.has(person.id));
  const personUrl = view.areas.includes('people')
    ? (personId: string) => leagueUrl(here, 'admin-area', { area: 'people', subpath: [personId] })
    : undefined;
  // A refused leaving date is said beside the line it was typed in, with the date kept.
  const leaving = leavingAtOf(query);
  const besideEntry = open.some((line) => line.id === leaving?.entry) ? leaving : undefined;
  const leavingProblem = besideEntry === undefined ? undefined : problemKey(query);
  // What went well on one line is said on that line, naming the player (step 2.161).
  const onLine = saidOnLine(
    savedEntry === undefined || (saved !== 'added' && saved !== 'entrySaved')
      ? doneAtOf(query)
      : { done: saved, at: { entry: savedEntry } },
    lines,
    team.name,
  );
  // What the team has of games, and why "Remove this team" was refused, said in its panel (A-17).
  const counted = await countTeamGames(context, { teamId: team.id }, ports.deps);
  const games = counted.ok ? counted.value : undefined;
  const panel = removePanel(team.name, games);
  // A tap's refusal from the address is said only where the panel does not already say
  // what is true now (a box not ticked, a team gone): never a refusal outliving its cause.
  const removeCode = removeRefusalOf(query);
  const tapRefused = removeCode === undefined ? undefined : tapRefusal(removeCode);
  const saidHere = (entryId: string) =>
    onLine?.entry !== entryId ? null : (
      <div data-said-on={entryId}>
        <SaidLine kind="saved">{onLine.text}</SaidLine>
      </div>
    );

  return (
    <main className="admin-teams admin-team">
      {/* The way back, then the page's head: the team's shield and name, one line of what
          the page is for, and its main action at the top right (step 2.103). */}
      <StaffTrail steps={[{ href: listUrl, label: t('admin.area.teams') }]} here={team.name} />
      <PageHead title={team.name} sub={t('adminTeams.team.sub')} lead={<Swatch team={team} />}>
        {mayAddPlayer ? (
          <a className="ui-button" data-kind="main" data-icon="plus" href={`#${addPlayerAnchor}`}>
            {t('adminTeams.add.title')}
          </a>
        ) : null}
      </PageHead>
      {justAdded ? (
        <SaidLine kind="saved">{t('adminTeams.create.saved', { name: team.name })}</SaidLine>
      ) : null}
      <Notice
        query={query}
        binHref={leagueUrl(here, 'admin-area', { area: 'settings', subpath: ['bin'] })}
        saidBeside={
          leavingProblem !== undefined || onLine !== undefined || removeCode !== undefined
        }
      />

      <Section title={t('adminTeams.edit.title')} id={teamDetailsAnchor}>
        {saved === 'details' ? (
          <SaidLine kind="saved">{t('adminTeams.saved.details', { name: team.name })}</SaidLine>
        ) : null}
        <ListForm
          action={saveTeamAction}
          permalink={`${teamUrl}#${teamDetailsAnchor}`}
          hidden={{
            league: here.slug,
            team: team.id,
            version: String(team.version),
            [requestTokenField]: randomUUID(),
          }}
          fields={[
            {
              kind: 'text',
              name: 'name',
              label: t('adminTeams.field.name'),
              value: team.name,
              required: true,
              maxLength: 120,
            },
            {
              kind: 'text',
              name: 'shortName',
              label: t('adminTeams.field.shortName'),
              value: team.slug,
              maxLength: 60,
              help: t('adminTeams.field.shortNameHint'),
            },
            {
              kind: 'color',
              name: 'color',
              label: t('adminTeams.field.color'),
              value: team.color,
              ownName: 'useOwnColors',
              ownLabel: t('adminTeams.field.useOwnColors'),
            },
            {
              kind: 'select',
              name: 'divisionId',
              label: t('adminTeams.field.division'),
              value: team.divisionId ?? '',
              required: false,
              options: [
                { value: '', label: t('adminTeams.noDivision') },
                ...divisions.map((division) => ({ value: division.id, label: division.name })),
              ],
            },
          ]}
          button={t('adminTeams.edit.submit')}
          label={t('adminTeams.edit.title')}
          name="team-details"
        />
      </Section>

      <Section title={t('adminTeams.stats.title')} id={teamStatsAnchor}>
        {saved === 'stats' ? (
          <SaidLine kind="saved">{t('adminTeams.saved.stats', { name: team.name })}</SaidLine>
        ) : null}
        <ListForm
          action={saveTeamStatsAction}
          permalink={`${teamUrl}#${teamStatsAnchor}`}
          hidden={{
            league: here.slug,
            team: team.id,
            version: String(team.version),
            [requestTokenField]: randomUUID(),
          }}
          fields={[
            {
              kind: 'select',
              name: 'statsVisibility',
              label: t('adminTeams.field.statsVisibility'),
              value: team.statsVisibility,
              options: statsVisibilityChoices.map((choice) => ({
                value: choice,
                label: t(`adminTeams.stats.${choice}` as TextKey),
              })),
            },
          ]}
          button={t('adminTeams.stats.submit')}
          label={t('adminTeams.stats.title')}
          name="team-stats"
        />
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
                  {/* The name leads to the person's record in People (step 2.50), where a
                      misspelt name is put right; only for someone People is open to. */}
                  <strong dir="auto">
                    {personUrl === undefined ? (
                      nameOf(line)
                    ) : (
                      <a href={personUrl(line.personId)}>{nameOf(line)}</a>
                    )}
                  </strong>
                  {line.needsReview === true ? (
                    <span data-flag="review"> {t('adminTeams.roster.toReview')}</span>
                  ) : null}
                  {offTheLeagueList(line.personId, leagueList) ? (
                    <span data-flag="off-the-list"> {t('adminTeams.roster.notOnTheList')}</span>
                  ) : null}
                  {line.jerseyNumber !== null && wornTwice.has(line.jerseyNumber) ? (
                    <span data-flag="clash">
                      {' '}
                      {t('adminTeams.roster.numberTwice', { number: line.jerseyNumber })}
                    </span>
                  ) : null}
                </p>
                {saidHere(line.id)}
                <ListForm
                  action={changeEntryAction}
                  permalink={`${teamUrl}#${entryAnchor(line.id)}`}
                  hidden={{
                    league: here.slug,
                    team: team.id,
                    entry: line.id,
                    version: String(line.version),
                    [requestTokenField]: randomUUID(),
                  }}
                  fields={[
                    {
                      kind: 'text',
                      name: 'jerseyNumber',
                      label: t('adminTeams.roster.number'),
                      value: line.jerseyNumber ?? '',
                      maxLength: 2,
                    },
                    roleField(line.role),
                  ]}
                  button={t('adminTeams.roster.saveEntry')}
                  label={t('adminTeams.roster.entryLabel', { name: nameOf(line) })}
                  name="roster-entry"
                  className="admin-roster-form"
                />
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

      {/* A new player first: it is what an admin with an empty league does first (step
          2.194's walk). Each form under its own heading, so a number typed in one is never
          meant for the other. The "Add a player" button at the top leads to the first. */}
      {mayAddPeople ? (
        <Section title={t('adminTeams.newPerson.title')} id={addPlayerAnchor}>
          <ListForm
            action={addNewPersonAction}
            permalink={`${teamUrl}#${addPlayerAnchor}`}
            hidden={{ league: here.slug, team: team.id, [requestTokenField]: randomUUID() }}
            fields={[
              {
                kind: 'text',
                name: 'firstName',
                label: t('adminTeams.newPerson.firstName'),
                value: '',
                required: true,
                maxLength: 100,
              },
              {
                kind: 'text',
                name: 'lastName',
                label: t('adminTeams.newPerson.lastName'),
                value: '',
                required: true,
                maxLength: 100,
              },
              {
                kind: 'text',
                name: 'jerseyNumber',
                label: t('adminTeams.add.number'),
                value: '',
                maxLength: 2,
              },
              {
                kind: 'select',
                name: 'role',
                label: t('adminTeams.roster.role'),
                value: 'player',
                options: rosterRoles.map((role) => ({ value: role, label: roleText(role) })),
              },
            ]}
            button={t('adminTeams.newPerson.submit')}
            kind="main"
            label={t('adminTeams.newPerson.title')}
            name="new-player"
          />
        </Section>
      ) : null}

      <Section
        title={t('adminTeams.add.fromLeague')}
        {...(mayAddPeople ? {} : { id: addPlayerAnchor })}
      >
        {/* Step 2.90: a person is found by name on the server, so a league of more than
            200 can pick anyone; the select holds what was found, 200 to a page. */}
        {readFailed || peopleNotAllowed ? null : (
          <div id={fromListAnchor} data-find-person="true">
            <FindPersonForm action={findPersonAction} to={teamUrl} anchor={fromListAnchor}>
              <LeagueField league={here.slug} />
              <input type="hidden" name="team" value={team.id} />
              <StaffField label={t('adminTeams.find.label')}>
                <input
                  className="ui-input"
                  type="search"
                  name="q"
                  maxLength={100}
                  defaultValue={pick.search ?? ''}
                />
              </StaffField>
              <button type="submit" className="ui-button">
                {t('adminTeams.find.submit')}
              </button>
            </FindPersonForm>
            {pick.search === undefined ? null : (
              <p className="staff-quiet" data-found-for="true">
                {t('adminTeams.find.foundFor', { search: pick.search })}{' '}
                <a href={`${teamUrl}#${fromListAnchor}`}>{t('adminTeams.find.clear')}</a>
              </p>
            )}
            {morePeople || pick.page > 1 ? (
              <p className="staff-quiet" data-person-pages="true">
                {t('adminTeams.find.page', { page: String(pick.page) })}{' '}
                {pick.page > 1 ? (
                  <a href={pickUrl(pick.page - 1)}>{t('adminTeams.find.previous')}</a>
                ) : null}{' '}
                {morePeople ? (
                  <a href={pickUrl(pick.page + 1)}>{t('adminTeams.find.next')}</a>
                ) : null}
              </p>
            ) : null}
          </div>
        )}
        {readFailed ? (
          <StaffNotice kind="refused">{t('adminTeams.add.readFailed')}</StaffNotice>
        ) : peopleNotAllowed ? (
          <p className="staff-quiet">{t('adminTeams.add.notAllowed')}</p>
        ) : everyone.length === 0 && (pick.search !== undefined || pick.page > 1) ? (
          <p className="staff-quiet">{t('adminTeams.find.nobody')}</p>
        ) : everyone.length === 0 ? (
          <p className="staff-quiet">{t('adminTeams.add.nobody')}</p>
        ) : available.length === 0 && (pick.search !== undefined || pick.page > 1) ? (
          <p className="staff-quiet">{t('adminTeams.find.allOnRoster')}</p>
        ) : available.length === 0 ? (
          <p className="staff-quiet">{t('adminTeams.add.noOne')}</p>
        ) : (
          <ListForm
            action={addFromListAction}
            permalink={`${teamUrl}#${addPlayerAnchor}`}
            hidden={{ league: here.slug, team: team.id, [requestTokenField]: randomUUID() }}
            fields={[
              {
                kind: 'select',
                name: 'personId',
                label: t('adminTeams.add.person'),
                value: '',
                options: [
                  { value: '', label: t('adminTeams.add.choose') },
                  ...available.map((person) => ({ value: person.id, label: nameOf(person) })),
                ],
              },
              {
                kind: 'text',
                name: 'jerseyNumber',
                label: t('adminTeams.add.number'),
                value: '',
                maxLength: 2,
              },
              roleField('player'),
            ]}
            button={t('adminTeams.add.submit')}
            label={t('adminTeams.add.fromLeague')}
            name="from-list"
          />
        )}
      </Section>

      <LeftLeaguePanel
        league={here.slug}
        teamId={team.id}
        version={team.version}
        left={team.left}
        laterGamesHref={
          view.areas.includes('games')
            ? `${leagueUrl(here, 'admin-area', { area: 'games' })}?later=${team.id}#later`
            : undefined
        }
      />

      <Section title={t('adminTeams.remove.title')} kind="danger" id={removeTeamAnchor}>
        <p className="staff-quiet">{t('adminTeams.remove.body')}</p>
        {panel.kind === 'held' ? (
          // A team with games cannot go to the bin (A-17): said up front, with what it has
          // and the way on, and no tick or button that could only be refused.
          <div className="ui-notice" data-remove-held={games?.played === 0 ? 'yet' : 'season'}>
            <p>{panel.why}</p>
            {panel.lines.map((line) => (
              <p key={line}>{line}</p>
            ))}
            {panel.ways.length === 0 ? null : (
              <p className="staff-buttons">
                {panel.ways.map((way) => (
                  <a
                    key={way.label}
                    className="ui-button"
                    href={wayOnHref(here, way, team.id)}
                    data-way-on={way.anchor ?? way.area}
                  >
                    {t(way.label)}
                  </a>
                ))}
              </p>
            )}
          </div>
        ) : (
          // What the team has of games, and how many people the bin would take with it,
          // said before anything is confirmed.
          panel.lines.map((line) => (
            <p key={line} className="staff-quiet" data-remove-games="">
              {line}
            </p>
          ))
        )}
        <p className="staff-quiet" data-remove-roster-count={open.length}>
          {!roster.ok
            ? t('adminTeams.remove.rosterUnknown')
            : open.length === 0
              ? t('adminTeams.remove.rosterNone')
              : t.plural('adminTeams.remove.roster', open.length)}
        </p>
        {tapRefused === undefined ? null : (
          <StaffNotice
            kind="refused"
            data={{ 'data-remove-refused': removeCode ?? '' }}
            intoView={tapRefused}
          >
            <p>{tapRefused}</p>
          </StaffNotice>
        )}
        {panel.kind === 'held' ? null : <RemoveForm league={here.slug} teamId={team.id} />}
      </Section>
    </main>
  );
}

/** Where a way on from "Remove this team" leads, with the team to come back to (Schedule). */
function wayOnHref(
  league: Parameters<typeof leagueUrl>[0],
  way: RemoveWayOn,
  teamId: string,
): string {
  const address = leagueUrl(league, 'admin-area', { area: way.area });
  if (way.area !== 'schedule') return address;
  return `${address}?${backToTeamParam}=${teamId}${way.anchor === 'publish' ? `#${publishAnchor}` : ''}`;
}

/**
 * "A team that has left the league" (S-87): what marking it does, said plainly, and one
 * button: mark it, or, once marked, take the mark off. Its games still to come are the
 * admin's to forfeit or cancel, each, from Games' "Later games" for this team.
 */
function LeftLeaguePanel({
  league,
  teamId,
  version,
  left,
  laterGamesHref,
}: {
  readonly league: string;
  readonly teamId: string;
  readonly version: number;
  readonly left: boolean;
  /** Admin → Games' "Later games" for this team; undefined when Games is not open to them. */
  readonly laterGamesHref: string | undefined;
}) {
  return (
    <Section
      title={t(left ? 'adminTeams.leftLeague.titleLeft' : 'adminTeams.leftLeague.title')}
      id={leftLeagueAnchor}
    >
      <div data-team-left-panel={left ? 'left' : 'playing'}>
        <p className={left ? undefined : 'staff-quiet'}>
          {t(left ? 'adminTeams.leftLeague.isLeft' : 'adminTeams.leftLeague.body')}
        </p>
        {left ? <p className="staff-quiet">{t('adminTeams.leftLeague.undoBody')}</p> : null}
        <form action={left ? undoTeamLeftAction : markTeamLeftAction} className="staff-form">
          <LeagueField league={league} />
          <input type="hidden" name="team" value={teamId} />
          <input type="hidden" name="version" value={version} />
          <p className="staff-buttons">
            <button
              type="submit"
              className="ui-button"
              data-team-left-button={left ? 'undo' : 'mark'}
            >
              {t(left ? 'adminTeams.leftLeague.undo' : 'adminTeams.leftLeague.mark')}
            </button>
            {laterGamesHref === undefined ? null : (
              <a className="ui-button" href={laterGamesHref} data-team-later-games={teamId}>
                {t('adminTeams.leftLeague.toLaterGames')}
              </a>
            )}
          </p>
        </form>
      </div>
    </Section>
  );
}

/** Where the browser lands on the team page: the panel of a team leaving the league. */
const leftLeagueAnchor = 'left-league';

/** The tick and "Move the team to the bin", for a team with no games (or none read). */
function RemoveForm({ league, teamId }: { readonly league: string; readonly teamId: string }) {
  return (
    <form action={removeTeamAction} className="staff-form">
      <LeagueField league={league} />
      <input type="hidden" name="team" value={teamId} />
      <ConfirmBox />
      <p className="staff-buttons">
        <button type="submit" className="ui-button" data-kind="danger">
          {t('adminTeams.remove.submit')}
        </button>
      </p>
    </form>
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
        <IntoView
          words={problem}
          marks={{
            id: errorId,
            className: 'ui-field-error',
            role: 'alert',
            'data-left-on-problem': entryId,
          }}
        >
          {problem}
        </IntoView>
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

/** A roster line's role, as a box of a form that keeps what was typed (step 2.155). */
function roleField(value: string) {
  return {
    kind: 'select' as const,
    name: 'role',
    label: t('adminTeams.roster.role'),
    value,
    options: rosterRoles.map((role) => ({ value: role, label: roleText(role) })),
  };
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
