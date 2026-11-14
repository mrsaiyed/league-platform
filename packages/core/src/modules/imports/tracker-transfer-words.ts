// The words of the Al-Hadi transfer (step 2.58): its plan and its report as plain lines
// for the person running it, as the seed script reports (T-187: the words live here,
// not in the script). Names come from the tracker's backup and are only printed, never
// saved anywhere (T-220).
import type { GameProblem, PlannedGame, TransferPlan } from './plan-tracker-transfer.ts';
import type { LineDifference } from './tracker-lines.ts';
import type { GameMatch, PlayerMatch } from './tracker-matching.ts';
import { localDateOf } from './tracker-matching.ts';
import type { TransferReport, TransferStop } from './run-tracker-transfer.ts';
import type { TrackerData, TrackerGame } from './tracker-transfer-data.ts';

/** The reason kept with a reopening the tracker made, when the transfer makes it here. */
export const transferReopenReason =
  'Reopened in the old tracker after it ended; brought over with the transfer.';

type Words = {
  readonly data: TrackerData;
  readonly timeZone: string;
  readonly withOpponents: boolean;
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function teamName(words: Words, teamId: string): string {
  return words.data.teams.find((team) => team.id === teamId)?.name ?? 'a team';
}

function playerName(words: Words, playerId: string | null): string {
  if (playerId === null) return 'Someone the tracker does not have';
  const player = words.data.players.find((p) => p.id.toLowerCase() === playerId.toLowerCase());
  if (player === undefined) return 'A player the tracker does not list';
  const number = player.jersey === '' ? '' : ` (#${player.jersey})`;
  return `${player.name === '' ? 'No name' : player.name}${number}`;
}

/** A game as a person knows it: its day, its teams and the league's number. */
export function gameLabel(words: Words, game: TrackerGame): string {
  const day =
    game.startsAt === null ? 'no date' : (localDateOf(game.startsAt, words.timeZone) ?? 'no date');
  const ref = game.sourceRef === null ? '' : ` (${game.sourceRef})`;
  return `${day} ${teamName(words, game.homeTeamId)} v ${teamName(words, game.awayTeamId)}${ref}`;
}

const statWords: Readonly<Record<LineDifference['what'], string>> = {
  missing: '',
  extra: '',
  team: 'team',
  number: 'number',
  played: 'played',
  seconds: 'seconds on court',
  points: 'points',
  fg1: 'free throws',
  fg2: 'two-point baskets',
  fg3: 'three-point baskets',
  fouls: 'fouls',
  turnovers: 'turnovers',
};

const valueWords = (value: string) =>
  value === '' ? 'none' : value === 'true' ? 'yes' : value === 'false' ? 'no' : value;

/** One line that differs, in plain words. */
export function differenceLine(words: Words, difference: LineDifference): string {
  const who = playerName(words, difference.playerId);
  switch (difference.what) {
    case 'missing':
      return `${who}: has a box score line in the tracker but none here.`;
    case 'extra':
      return `${who}: has a box score line here that the tracker does not have.`;
    case 'team':
      return `${who}: is on another team here.`;
    default:
      return `${who}: ${statWords[difference.what]} ${valueWords(difference.tracker)} in the tracker, ${valueWords(difference.here)} here.`;
  }
}

function problemLines(words: Words, problem: GameProblem): string[] {
  switch (problem.kind) {
    case 'unreadable-action':
      return [`Action ${problem.seq} in the backup cannot be read as a tracker action.`];
    case 'unreadable-state':
      return ['The game’s saved state in the backup cannot be read.'];
    case 'game-not-found':
      return ['The matching game is no longer here.'];
    case 'not-matched':
      return [
        `It was ended in the tracker, but ${matchWords(problem.reason)}. Add or fix the game in this season’s schedule here first.`,
      ];
    case 'not-playable':
      return [`The game here is ${problem.status}, so it cannot be scored.`];
    case 'result-entered':
      return [
        'The game here already has a result entered by hand or imported. Reopen it here first if the tracker’s record should replace it.',
      ];
    case 'scored-here':
      return ['The game here already has plays recorded that are not the tracker’s.'];
    case 'format-differs':
      return [
        `The tracker played it as ${problem.tracker.periods} periods of ${problem.tracker.periodSeconds / 60} minutes (overtime ${problem.tracker.overtimeSeconds / 60}); here it is ${problem.here.periods} of ${problem.here.periodSeconds / 60} (overtime ${problem.here.overtimeSeconds / 60}). Make the season’s game format match first.`,
      ];
    case 'refused':
      return [`Action ${problem.seq} would be refused here: ${problem.message}`];
    case 'tie-not-allowed':
      return ['It ended level, and this season allows no ties.'];
    case 'not-ended':
      return ['Played again here, it does not end.'];
    case 'score-differs':
      return [
        `Played again here it ends ${problem.here.home}–${problem.here.away}; the tracker has ${problem.tracker.home}–${problem.tracker.away}.`,
      ];
    case 'players-not-here':
      return [
        `Its actions name ${plural(problem.playerIds.length, 'player', 'players')} who ${problem.playerIds.length === 1 ? 'is' : 'are'} not on a roster here and will not be added:`,
        ...problem.playerIds.map((id) => `    ${playerName(words, id)}`),
        ...(words.withOpponents
          ? []
          : [
              '  Another team’s players are brought in only with --with-opponents, or put them on their team’s roster here by hand first.',
            ]),
      ];
    case 'lines-differ':
      return [
        'Played again here, these box score lines would differ:',
        ...problem.differences.map((d) => `    ${differenceLine(words, d)}`),
      ];
  }
}

function gameLine(words: Words, planned: PlannedGame): string[] {
  const label = gameLabel(words, planned.game);
  const found =
    planned.match.kind === 'matched'
      ? ` (found by ${planned.match.by === 'number' ? 'game number' : 'day and teams'})`
      : '';
  const outcome = planned.outcome;
  switch (outcome.kind) {
    case 'transfer': {
      const steps = outcome.replay.segments.reduce((sum, part) => sum + part.length, 0);
      const left = outcome.replay.leftOut;
      const notes = [
        left.beforeReset > 0 ? `${left.beforeReset} before the game was marked not started` : '',
        left.rules > 0
          ? `${plural(left.rules, 'format setting', 'format settings')} (the season’s format is used)`
          : '',
        left.colorsWhileEnded > 0
          ? `${plural(left.colorsWhileEnded, 'color swap', 'color swaps')} after it ended`
          : '',
      ].filter((note) => note !== '');
      return [
        `  Transfer: ${label}${found}: ${plural(steps, 'action', 'actions')}${outcome.resume ? ', carrying on from an earlier run' : ''}${outcome.replay.segments.length > 1 ? `, reopened ${outcome.replay.segments.length === 2 ? 'once' : `${outcome.replay.segments.length - 1} times`} as in the tracker` : ''}; every box score line will match.`,
        ...(notes.length > 0 ? [`    Left out: ${notes.join('; ')}.`] : []),
      ];
    }
    case 'already':
      return [`  Already here: ${label}${found}: its lines are compared again, nothing is sent.`];
    case 'skip': {
      const why =
        outcome.reason === 'not-played'
          ? 'nothing is recorded for it yet'
          : 'it has not been ended in the tracker';
      return [`  Not transferred: ${label}: ${why}.`];
    }
    case 'blocked':
      return [
        `  Problem: ${label}${found}:`,
        ...problemLines(words, outcome.problem).map((line) => `    ${line}`),
      ];
  }
}

function matchWords(reason: Extract<GameMatch, { kind: 'unmatched' }>['reason']): string {
  switch (reason) {
    case 'team-not-matched':
      return 'one of its teams is not in this season';
    case 'not-found':
      return 'no game here has its game number, or its day and teams';
    case 'several':
      return 'more than one game here is on that day between those teams';
    case 'home-away-swapped':
      return 'the game here has home and away the other way round';
    case 'number-other-teams':
      return 'the game here with its number is between other teams';
  }
}

function personWords(match: PlayerMatch): string {
  switch (match.kind) {
    case 'on-roster':
      return 'on the roster already';
    case 'add':
      return `to be added as ${match.firstName} ${match.lastName}${match.jerseyNumber === null ? ', no number' : `, number ${match.jerseyNumber}`}`;
    case 'problem':
      switch (match.reason) {
        case 'no-name':
          return 'cannot be added: the tracker has no name for them and no one on the roster here wears that number';
        case 'one-name':
          return 'cannot be added: a person needs a first and a last name; put them on the roster here by hand with the name the tracker shows';
        case 'several-on-roster':
          return 'more than one person on the roster here could be them';
        case 'same-person':
          return 'another of the team’s players in the tracker has the same name or person here';
      }
  }
}

/** The plan, line by line. */
export function describeTransferPlan(words: Words, plan: TransferPlan): string[] {
  if (plan.problem === 'no-tracked-team') {
    return ['The backup has no single team marked as the one the tracker keeps records for.'];
  }
  const lines: string[] = ['Teams:'];
  for (const team of words.data.teams) {
    const match = plan.teams.get(team.id);
    lines.push(
      match?.kind === 'matched'
        ? `  Found: ${team.name}`
        : match?.reason === 'shared'
          ? `  Not matched: ${team.name} (another of the tracker’s teams has the same name here)`
          : match?.reason === 'several-here'
            ? `  Not matched: ${team.name} (more than one team in this season has this name; rename one of them here)`
            : `  Not in this season: ${team.name}`,
    );
  }
  if (plan.problem === 'tracked-team-not-matched') {
    lines.push('The tracked team is not in this season, so nothing can be transferred.');
    return lines;
  }
  lines.push('Players:');
  for (const person of plan.people.values()) {
    const opponent = person.tracked ? '' : ` (${teamName(words, person.player.teamId)})`;
    const notAdded =
      person.match.kind === 'add' && !person.tracked && !words.withOpponents
        ? ' (only with --with-opponents)'
        : '';
    lines.push(
      `  ${playerName(words, person.player.id)}${opponent}: ${personWords(person.match)}${notAdded}`,
    );
  }
  lines.push('Games:');
  for (const planned of plan.games) lines.push(...gameLine(words, planned));
  const count = (kind: PlannedGame['outcome']['kind']) =>
    plan.games.filter((g) => g.outcome.kind === kind).length;
  lines.push(
    `${plural(count('transfer'), 'game', 'games')} to transfer, ${count('already')} already here, ${count('skip')} not transferred, ${plural(count('blocked'), 'game', 'games')} with a problem.`,
  );
  return lines;
}

function stopLines(words: Words, stop: TransferStop): string[] {
  switch (stop.kind) {
    case 'not-ready':
      return ['Nothing was changed: put right the problems above and run it again.'];
    case 'person-not-added':
      return [`${playerName(words, stop.playerId)} could not be added here (${stop.code}).`];
    case 'not-opened':
      return [`The game could not be opened to score here (${stop.code}).`];
    case 'reopen-refused':
      return [`The game could not be reopened here as the tracker reopened it (${stop.code}).`];
    case 'not-sent':
      return [`The game’s actions could not be sent (${stop.code}).`];
    case 'action-refused':
      return [`Action ${stop.seq} was refused here: ${stop.message}`];
    case 'lines-differ':
      return [
        'These box score lines differ from the tracker’s:',
        ...stop.differences.map((d) => `  ${differenceLine(words, d)}`),
      ];
  }
}

/** What the run did, line by line. */
export function describeTransferReport(words: Words, report: TransferReport): string[] {
  const label = (trackerGameId: string) => {
    const game = words.data.games.find((g) => g.id === trackerGameId);
    return game === undefined ? 'a game' : gameLabel(words, game);
  };
  const lines: string[] = [];
  if (report.added.length > 0) {
    lines.push(`Added ${plural(report.added.length, 'person', 'people')} to their teams’ rosters.`);
  }
  for (const done of report.transferred) {
    lines.push(
      `Transferred: ${label(done.trackerGameId)}: ${plural(done.sent, 'action', 'actions')} sent.`,
    );
  }
  for (const id of report.checked) lines.push(`Already here: ${label(id)}.`);
  if (report.stopped !== null) {
    const at = report.stopped.trackerGameId;
    if (at !== null) lines.push(`Stopped at ${label(at)}.`);
    else lines.push('Stopped.');
    lines.push(...stopLines(words, report.stopped.stop));
    return lines;
  }
  const games = report.transferred.length + report.checked.length;
  lines.push(
    report.transferred.length === 0 && report.added.length === 0
      ? `Nothing to change: every one of ${plural(games, 'game', 'games')} was already here, and every box score line matches.`
      : `Done: every box score line of ${plural(games, 'game', 'games')} matches the tracker’s.`,
  );
  return lines;
}
