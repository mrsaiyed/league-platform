// Admin → Games → Scorekeepers (step 2.56; P4 §3 "Games: assign scorekeepers", P7 §5.1):
// each of the season's games still to be played, with who is assigned to score it, a way
// to assign one more and to take one off. For a league's admin before game day, on a phone.
// What an assignment does depends on the league's setting (who may score), said at the top;
// beside a person who scores every game anyway, that is said too.
//
// The games and the people who may be assigned come from the games module's own read
// (listScorekeepers), in the league of the session; the names from the games list's names.
// Every form is a plain post that works with scripts off; a refusal keeps the choice and
// says why beside it (record 067); "Saved" is said in the game's own block, where the
// browser lands. Each change is in the activity log, by the commands themselves.
import {
  leagueUrl,
  listScorekeepers,
  type GameScorekeepers,
  type PossibleScorekeeper,
} from '@srleagues/core';
import { EmptyPanel, PageHead } from '@srleagues/ui';
import { randomUUID } from 'node:crypto';
import { commandContextOf } from '../../server/context.ts';
import { webPorts } from '../../server/container.ts';
import { gameWhenText, type LeagueTimes } from '../../server/game-when.ts';
import type { GameNames } from '../../server/games-area-ports.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { locale, t } from '../../server/messages.ts';
import { requestTokenField } from '../../server/same-request.ts';
import type { SavedNotice } from '../../server/saved-notice.ts';
import { ListForm, SaidLine, takeNotice } from '../list-forms/index.ts';
import { StaffNotice } from '../staff/index.ts';
import { chooseSeason, firstValue, type SearchParams } from '../stats-pages/index.ts';
import { assignScorekeeperAction, unassignScorekeeperAction } from './actions.ts';
import { scorekeeperProblemKey } from './scorekeeper-answers.ts';
import {
  assignAnchor,
  assignedAnchor,
  gameAnchor,
  scorekeepersAddress,
  scorekeepersListAnchor,
} from './scorekeepers-address.ts';

/** `/{league}/admin/games/scorekeepers`: who scores the season's games still to be played. */
export async function ScorekeepersPage({
  league,
  search,
}: {
  readonly league: string;
  readonly search: SearchParams;
}) {
  const view = await loadLeaguePage(league, 'admin', 'games');
  const addressee = view.context.league;
  const ports = await webPorts();
  const context = commandContextOf(view.context);
  const holder = await ports.accessOf(context);
  const seasons = await ports.scheduleAdmin.seasonsOf(addressee.id, holder);
  const season = chooseSeason(seasons, firstValue(search['season']));
  const back = (
    <a className="ui-more" href={leagueUrl(addressee, 'admin-area', { area: 'games' })}>
      {t('adminScorekeepers.back')}
    </a>
  );
  if (season === undefined) {
    return (
      <main className="admin-scorekeepers">
        <PageHead title={t('adminScorekeepers.title')}>{back}</PageHead>
        <EmptyPanel text={t('adminScorekeepers.noSeason')} />
      </main>
    );
  }
  const seasonId = seasons.find((s) => s.slug === season.slug)?.id ?? '';
  const asked = firstValue(search['season']);
  const page = scorekeepersAddress(addressee, asked);
  const [listed, names, clock] = await Promise.all([
    listScorekeepers(context, { seasonId }, ports.games.scorekeepersDeps),
    ports.games.namesOf(addressee.id),
    ports.publicSchedule.clockOf(addressee.id),
  ]);
  const times: LeagueTimes = { locale, timeZone: clock.timeZone };
  const notice = takeNotice(context, 'scorekeepers');
  const hidden = (more: Readonly<Record<string, string>>) => ({
    league: addressee.slug,
    seasonSlug: asked ?? '',
    ...more,
    [requestTokenField]: randomUUID(),
  });
  return (
    <main className="admin-scorekeepers">
      <PageHead title={t('adminScorekeepers.title')} sub={t('adminScorekeepers.intro')}>
        {back}
      </PageHead>
      <p className="staff-quiet">{t('adminScorekeepers.season', { name: season.name })}</p>
      {listed.ok ? (
        <p className="staff-quiet">{t(`adminScorekeepers.rule.${listed.value.rule}`)}</p>
      ) : null}
      <section
        id={scorekeepersListAnchor}
        className="staff-panel"
        aria-labelledby="scorekeepers-title"
      >
        <h2 id="scorekeepers-title">{t('adminScorekeepers.list')}</h2>
        {!listed.ok ? (
          <StaffNotice kind="refused">
            <p>{t(scorekeeperProblemKey(listed.error.code))}</p>
          </StaffNotice>
        ) : listed.value.games.length === 0 ? (
          <p className="staff-quiet">{t('adminScorekeepers.noGames')}</p>
        ) : (
          listed.value.games.map((game) => (
            <GamePart
              key={game.gameId}
              game={game}
              people={listed.value.people}
              names={names}
              when={gameWhenText(game.startsAt, times)}
              notice={notice?.thing === game.gameId ? notice : undefined}
              page={page}
              hidden={hidden}
            />
          ))
        )}
      </section>
    </main>
  );
}

function GamePart({
  game,
  people,
  names,
  when,
  notice,
  page,
  hidden,
}: {
  readonly game: GameScorekeepers;
  readonly people: readonly PossibleScorekeeper[];
  readonly names: GameNames;
  readonly when: string;
  readonly notice: SavedNotice | undefined;
  readonly page: string;
  readonly hidden: (more: Readonly<Record<string, string>>) => Readonly<Record<string, string>>;
}) {
  // The name as stored; for a notice, as it was read when the change was saved.
  const nameOf = (accountId: string, stored = names.people[accountId]) => {
    const name = stored ?? '';
    return name === '' ? t('adminScorekeepers.nameless') : name;
  };
  const title = t('adminScorekeepers.game', {
    home: names.teams[game.homeTeamId] ?? '',
    away: names.teams[game.awayTeamId] ?? '',
  });
  const status =
    game.status === 'live'
      ? t('adminScorekeepers.live')
      : game.status === 'postponed'
        ? t('adminScorekeepers.postponed')
        : undefined;
  // Everyone who may be assigned, those already on the game too: a refusal drawn after the
  // page is read again keeps the person chosen in the box (record 067).
  const labelOf = (p: PossibleScorekeeper) =>
    game.assigned.includes(p.accountId)
      ? t('adminScorekeepers.alreadyOn', { name: nameOf(p.accountId) })
      : p.scoresEveryGame
        ? t('adminScorekeepers.everyGame', { name: nameOf(p.accountId) })
        : nameOf(p.accountId);
  const options = people
    .map((p) => ({ value: p.accountId, label: labelOf(p) }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const first = options.find((o) => !game.assigned.includes(o.value));
  return (
    <div id={gameAnchor(game.gameId)} className="admin-scorekeepers-game" data-game={title}>
      <h3 dir="auto">{title}</h3>
      <p className="staff-quiet">{status === undefined ? when : `${when} · ${status}`}</p>
      {notice === undefined ? null : (
        <SaidLine kind={notice.said === 'removed' ? 'removed' : 'saved'}>
          <p>
            {t(
              notice.said === 'removed'
                ? 'adminScorekeepers.said.removed'
                : 'adminScorekeepers.said.assigned',
              { name: nameOf(notice.about?.[0] ?? '', notice.name), game: title },
            )}
          </p>
        </SaidLine>
      )}
      {game.assigned.length === 0 ? (
        <p className="staff-quiet">{t('adminScorekeepers.noOne')}</p>
      ) : (
        <ul className="admin-scorekeepers-assigned">
          {game.assigned.map((accountId) => (
            <li
              key={accountId}
              id={assignedAnchor(game.gameId, accountId)}
              data-person={nameOf(accountId)}
            >
              <span dir="auto">{nameOf(accountId)}</span>
              <ListForm
                name="unassign-scorekeeper"
                label={t('adminScorekeepers.remove.label', {
                  name: nameOf(accountId),
                  game: title,
                })}
                action={unassignScorekeeperAction}
                // Its own place: with scripts off, React gives a refusal back to the form
                // whose action and permalink match, so each form has its own.
                permalink={`${page}#${assignedAnchor(game.gameId, accountId)}`}
                hidden={hidden({ game: game.gameId, account: accountId })}
                button={t('adminScorekeepers.remove.submit')}
                kind="quiet"
              />
            </li>
          ))}
        </ul>
      )}
      {first === undefined ? (
        <p className="staff-quiet">{t('adminScorekeepers.noOneElse')}</p>
      ) : (
        <div id={assignAnchor(game.gameId)}>
          <ListForm
            name="assign-scorekeeper"
            label={t('adminScorekeepers.assign.label', { game: title })}
            action={assignScorekeeperAction}
            permalink={`${page}#${assignAnchor(game.gameId)}`}
            hidden={hidden({ game: game.gameId })}
            fields={[
              {
                kind: 'select',
                name: 'person',
                label: t('adminScorekeepers.assign.person'),
                value: first.value,
                options,
              },
            ]}
            button={t('adminScorekeepers.assign.submit')}
          />
        </div>
      )}
    </div>
  );
}
