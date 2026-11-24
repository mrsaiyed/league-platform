// The Players panel of the scoring screen (step 2.118, part 2; P7 §2 and §5.2; S-6,
// S-34, S-37, S-44, S-45; DESIGN.md section 7). Both teams side by side, stacked where
// there is no room; a line to add one player or a bench by number ("3 5 10 12 14"); a
// fix of a number or a name; take off. It decides nothing: what each player may have
// done to them comes from `playersPanel` (roster-changes.ts), a typed clash from
// `typedClashes` (players-form.ts), and every change goes to the controller, whose
// answer is worded here from the message files.
//
// The marks a browser test drives it by: `data-players-panel`, `data-players-team`,
// `data-players-line`, `data-players-name`, `data-players-add`, `data-player-row`,
// `data-player-fix`, `data-player-number`, `data-player-name-box`, `data-player-save`,
// `data-player-takeoff`, `data-player-reason`, `data-players-said`, `data-players-close`,
// `data-players-refused`, `data-players-read-only`, `data-players-open`.
import type { Translate } from '@srleagues/site';
import { isTablePlayerCommand } from '@srleagues/contracts';
import { playerLabel } from './engine-words.ts';
import type { DevicePlayer, DeviceRosters } from './opened-game-storage.ts';
import {
  clashedIds,
  fixNameBox,
  fixNumberBox,
  lineBox,
  nameBox,
  typedClashes,
  type PlayerDrafts,
} from './players-form.ts';
import {
  teamOn,
  type PanelPlayer,
  type PanelTeam,
  type PlayerSide,
  type PlayersPanel,
  type RefusedGroup,
} from './roster-changes.ts';

/** What the panel last said for a team, worded from the message files by the screen. */
export type PanelSaid = { readonly kind: 'error' | 'done'; readonly text: string };

export type PlayersPanelHandlers = {
  readonly type: (box: string, text: string) => void;
  readonly add: (side: PlayerSide) => void;
  /** Opens one player's fix (null shuts it). */
  readonly fix: (playerId: string | null) => void;
  readonly save: (side: PlayerSide, playerId: string) => void;
  readonly takeOff: (side: PlayerSide, playerId: string) => void;
  readonly close: () => void;
};

export type PlayersSheetProps = {
  readonly t: Translate;
  readonly panel: PlayersPanel;
  /** The same rosters the panel was made from: a typed number is checked against them. */
  readonly rosters: DeviceRosters;
  readonly drafts: PlayerDrafts;
  /** The teams whose add line is being stored: its button waits (one submit at a time). */
  readonly busy?: Partial<Readonly<Record<PlayerSide, boolean>>>;
  /** The player whose fix is open, or null. */
  readonly fixing: string | null;
  readonly said: Partial<Readonly<Record<PlayerSide, PanelSaid>>>;
  /** The saved banner's words, so the count of what waits shows over the panel too. */
  readonly banner: string;
  readonly on: PlayersPanelHandlers;
};

const sides: readonly PlayerSide[] = ['home', 'away'];
const sheetTitle = 'court-players-title';

/** How a refused change names its player: an add was never listed, so by what was typed. */
function refusedLabel(group: RefusedGroup, rosters: DeviceRosters, t: Translate): string {
  const command = group.change?.command;
  if (command !== undefined && isTablePlayerCommand(command)) {
    const input = command.input;
    if (input.type === 'add-player') {
      const name = input.name.trim();
      if (input.jersey === '') return t('tracker.player.name', { name });
      return name === ''
        ? t('tracker.player.number', { jersey: input.jersey })
        : t('tracker.player.numberName', { jersey: input.jersey, name });
    }
  }
  const id = group.playerId.toLowerCase();
  const player = [...rosters.home.players, ...rosters.away.players].find(
    (p) => p.personId.toLowerCase() === id,
  );
  return playerLabel(player, t);
}

export function PlayersSheet(props: PlayersSheetProps) {
  const { t, panel, on } = props;
  return (
    <div className="court-sheet-wrap court-players-wrap" data-players-panel="">
      <div className="court-scrim" onClick={on.close} />
      <div
        className="court-sheet court-players-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={sheetTitle}
      >
        <div className="court-sheet-head">
          <h2 id={sheetTitle}>{t('tracker.players.title')}</h2>
          <button
            type="button"
            className="court-close"
            aria-label={t('tracker.court.close')}
            data-players-close=""
            onClick={on.close}
          >
            <span className="court-cross" aria-hidden="true" />
          </button>
        </div>
        <p className="court-quiet" data-players-banner="">
          {props.banner}
        </p>
        {panel.readOnly === null ? null : (
          <p className="court-notice" data-players-read-only={panel.readOnly.reason}>
            {t(panel.readOnly.key)}
          </p>
        )}
        {panel.refused.length === 0 ? null : (
          <div className="court-players-refused" data-players-refused="" role="alert">
            {panel.refused.map((group) => (
              <div key={group.playerId} className="court-notice" data-kind="error">
                <p>
                  <strong>{refusedLabel(group, props.rosters, t)}</strong> {t(group.key)}
                </p>
                {group.plays.length === 0 ? null : (
                  <p>{t.plural('tracker.players.refusedPlays', group.plays.length)}</p>
                )}
              </div>
            ))}
          </div>
        )}
        {/* On a phone the teams are stacked: the second is one tap away, not 17 rows down. */}
        <button
          type="button"
          className="court-button court-players-jump"
          data-players-jump="away"
          onClick={() =>
            document.getElementById(teamAnchor('away'))?.scrollIntoView({ block: 'start' })
          }
        >
          {t('tracker.players.jump', { team: panel.away.name })}
        </button>
        <div className="court-players-teams">
          {sides.map((side) => (
            <TeamPlayers key={side} {...props} team={panel[side]} />
          ))}
        </div>
      </div>
    </div>
  );
}

const teamAnchor = (side: PlayerSide) => `court-players-team-${side}`;

function TeamPlayers(props: PlayersSheetProps & { readonly team: PanelTeam }) {
  const { t, team, drafts, on } = props;
  const readOnly = props.panel.readOnly !== null;
  const line = drafts[lineBox(team.side)] ?? '';
  const name = drafts[nameBox(team.side)] ?? '';
  const clashes = typedClashes(teamOn(props.rosters, team.side), line);
  const marked = clashedIds(clashes);
  const said = props.said[team.side];
  const busy = props.busy?.[team.side] === true;
  const lineId = `court-players-line-${team.side}`;
  const nameId = `court-players-name-${team.side}`;
  const listed = team.players.filter((p) => !p.player.left);
  return (
    <section
      className="court-players-team"
      id={teamAnchor(team.side)}
      data-players-team={team.side}
      aria-label={team.name}
      data-color={team.side === 'home' ? 'light' : 'dark'}
    >
      <h3 className="court-players-team-name">
        {team.name}{' '}
        <span className="court-quiet">{t.plural('tracker.players.count', listed.length)}</span>
      </h3>
      {readOnly ? null : (
        <form
          className="court-players-add"
          onSubmit={(event) => {
            event.preventDefault();
            on.add(team.side);
          }}
        >
          <label htmlFor={lineId}>{t('tracker.players.numbers')}</label>
          <input
            id={lineId}
            className="court-players-input"
            inputMode="numeric"
            autoComplete="off"
            value={line}
            data-players-line={team.side}
            aria-describedby={`${lineId}-help`}
            onChange={(event) => on.type(lineBox(team.side), event.target.value)}
          />
          <p id={`${lineId}-help`} className="court-quiet">
            {t('tracker.players.numbersHelp')}
          </p>
          <label htmlFor={nameId}>{t('tracker.players.name')}</label>
          <input
            id={nameId}
            className="court-players-input"
            autoComplete="off"
            value={name}
            data-players-name={team.side}
            onChange={(event) => on.type(nameBox(team.side), event.target.value)}
          />
          {clashes.map((clash) => (
            <p key={clash.jersey} className="court-players-clash" data-players-typed-clash="">
              {t('tracker.players.clashTyped', {
                jersey: clash.jersey,
                players: clash.wornBy
                  .map((p) => playerLabel(p, t))
                  .join(t('tracker.queue.separator')),
              })}
            </p>
          ))}
          <button
            type="submit"
            className="court-button"
            data-kind="main"
            data-players-add={team.side}
            disabled={busy || (line.trim() === '' && name.trim() === '')}
            aria-busy={busy ? true : undefined}
          >
            {t('tracker.players.add')}
          </button>
        </form>
      )}
      {said === undefined ? null : (
        <p
          className="court-notice"
          data-kind={said.kind === 'error' ? 'error' : undefined}
          role={said.kind === 'error' ? 'alert' : 'status'}
          data-players-said={team.side}
        >
          {said.text}
        </p>
      )}
      {listed.length === 0 ? (
        <p className="court-quiet">{t('tracker.lineup.noPlayers', { team: team.name })}</p>
      ) : (
        <ul className="court-players-list">
          {listed.map((p) => (
            <PlayerRow
              key={p.player.personId}
              {...props}
              entry={p}
              side={team.side}
              typedClash={marked.has(p.player.personId.toLowerCase())}
              readOnly={readOnly}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function clashWords(entry: PanelPlayer, team: PanelTeam, t: Translate): string {
  const others = entry.clashWith
    .map((id) => team.players.find((p) => p.player.personId === id)?.player)
    .filter((p): p is DevicePlayer => p !== undefined)
    .map((p) => playerLabel(p, t));
  return t('tracker.players.clash', { players: others.join(t('tracker.queue.separator')) });
}

function PlayerRow(
  props: PlayersSheetProps & {
    readonly team: PanelTeam;
    readonly entry: PanelPlayer;
    readonly side: PlayerSide;
    readonly typedClash: boolean;
    readonly readOnly: boolean;
  },
) {
  const { t, entry, side, drafts, on, team } = props;
  const { player } = entry;
  const id = player.personId;
  const open = !props.readOnly && props.fixing?.toLowerCase() === id.toLowerCase();
  const clash = entry.clashWith.length > 0 || props.typedClash;
  const numberId = `court-player-number-${id}`;
  const nameId = `court-player-name-${id}`;
  const reasonId = `court-player-reason-${id}`;
  const fullName = `${player.firstName} ${player.lastName}`.trim();
  return (
    <li
      className="court-players-row"
      data-player-row={id}
      data-clash={clash ? '' : undefined}
      data-waiting={entry.waiting ? '' : undefined}
      data-open={open ? '' : undefined}
    >
      <div className="court-players-row-head">
        <span className="court-players-who">{playerLabel(player, t)}</span>
        {entry.waiting ? (
          <span className="court-players-tag" data-player-waiting="">
            {t('tracker.players.waiting')}
          </span>
        ) : null}
        {props.readOnly ? null : (
          <button
            type="button"
            className="court-button court-players-fix"
            data-player-fix={id}
            aria-expanded={open}
            onClick={() => on.fix(open ? null : id)}
          >
            {t(open ? 'tracker.players.fixDone' : 'tracker.players.fix')}
          </button>
        )}
      </div>
      {clash ? (
        <p className="court-players-clash" data-player-clash={id}>
          {entry.clashWith.length > 0 ? clashWords(entry, team, t) : t('tracker.players.clashLine')}
        </p>
      ) : null}
      {open ? (
        <form
          className="court-players-fix-form"
          onSubmit={(event) => {
            event.preventDefault();
            on.save(side, id);
          }}
        >
          <label htmlFor={numberId}>{t('tracker.players.number')}</label>
          <input
            id={numberId}
            className="court-players-input"
            inputMode="numeric"
            autoComplete="off"
            value={drafts[fixNumberBox(id)] ?? player.jerseyNumber ?? ''}
            data-player-number={id}
            onChange={(event) => on.type(fixNumberBox(id), event.target.value)}
          />
          <label htmlFor={nameId}>{t('tracker.players.name')}</label>
          <input
            id={nameId}
            className="court-players-input"
            autoComplete="off"
            value={entry.rename.ok ? (drafts[fixNameBox(id)] ?? fullName) : fullName}
            readOnly={!entry.rename.ok}
            aria-describedby={entry.rename.ok ? undefined : reasonId}
            data-player-name-box={id}
            onChange={(event) => on.type(fixNameBox(id), event.target.value)}
          />
          {entry.rename.ok ? null : (
            <p id={reasonId} className="court-quiet" data-player-reason={id}>
              {t(entry.rename.key)}
            </p>
          )}
          <div className="court-players-fix-actions">
            <button type="submit" className="court-button" data-kind="main" data-player-save={id}>
              {t('tracker.players.save')}
            </button>
            {entry.takeOff.ok ? (
              <button
                type="button"
                className="court-button"
                data-kind="danger"
                data-player-takeoff={id}
                onClick={() => on.takeOff(side, id)}
              >
                {t('tracker.players.takeOff')}
              </button>
            ) : null}
          </div>
          {!entry.takeOff.ok && entry.rename.ok ? (
            <p className="court-quiet" data-player-reason={id}>
              {t(entry.takeOff.key)}
            </p>
          ) : null}
        </form>
      ) : null}
    </li>
  );
}

/** The way into the panel: behind More, before tip-off in the pad, and on an empty team. */
export function PlayersButton(props: {
  readonly t: Translate;
  readonly where: 'more' | 'pregame' | PlayerSide;
  readonly onOpen: () => void;
}) {
  const { t } = props;
  const button = (
    <button
      type="button"
      className="court-button"
      aria-haspopup="dialog"
      data-players-open={props.where}
      onClick={props.onOpen}
    >
      {t(
        props.where === 'home' || props.where === 'away'
          ? 'tracker.players.addFirst'
          : 'tracker.players.open',
      )}
    </button>
  );
  return props.where === 'more' ? (
    <div className="court-sheet-item">
      {button}
      <p className="court-quiet">{t('tracker.players.openHelp')}</p>
    </div>
  ) : (
    button
  );
}
