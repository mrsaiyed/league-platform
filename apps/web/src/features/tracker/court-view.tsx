// The scoring screen as it is drawn (step 2.35; docs/build/DESIGN.md section 7, "the
// courtside look"): the frame at four sizes, the two teams, the players' tiles and the
// pad. It draws what it is given and holds no state: scoring-screen.tsx owns what is
// picked, what was said and the taps. Every number comes from the engine's state through
// scoring-view.ts; every word from the message files (T-187); every color from the
// `--court-…` values of court.css, never from a league's design (record 064).
//
// The places left for the steps that follow (their content is handed in as `slots`):
// the clock controls and Undo (2.36, 2.37), the play log (2.37), the pad at rest (2.36's
// Start clock; on a phone 2.37's latest plays), each team's fouls and timeouts (2.36),
// the Players panel's buttons (2.118) and the once-a-game buttons behind More (2.37,
// 2.118, 2.119).
import type { Translate } from '@srleagues/site';
import { basketball } from '@srleagues/sports';
import { memo, type MouseEvent, type PointerEvent, type ReactNode, type Ref } from 'react';
import { playerLabel, playerShortLabel } from './engine-words.ts';
import type { PadAction, PadMode } from './scoring-moves.ts';
import {
  findTile,
  type PlayerTile,
  type ScoringView,
  type Side,
  type TeamPanel,
} from './scoring-view.ts';

/** What the later steps draw in the places this frame leaves for them. */
export type CourtSlots = {
  /** Start and Pause, the period picker (2.36); Undo and Redo (2.37). */
  readonly controls?: ReactNode;
  /** The play log, where it has a panel of its own: a tablet (2.37). */
  readonly playLog?: ReactNode;
  /** The pad while nobody is picked: the Start clock button (2.36), the latest plays (2.37). */
  readonly padRest?: ReactNode;
  /** Beside a team's name: its team fouls, the bonus badge and the timeouts chip (2.36). */
  readonly teamHead?: (side: Side) => ReactNode;
  /** In place of the floor of a team with no players: "Add players" (2.118). */
  readonly noPlayers?: (side: Side) => ReactNode;
  /** In the banner before tip-off: the button to the Players panel (2.118). */
  readonly pregame?: ReactNode;
  /** Behind More: Players, the format, Mark not started, End game (2.118, 2.119, 2.37). */
  readonly more?: ReactNode;
};

export type CourtBanner = {
  readonly text: string;
  /** `saved`: nothing waits; `waiting`: plays wait to be sent; `trouble`: not saved or not kept. */
  readonly state: 'saved' | 'waiting' | 'trouble';
};

export type CourtHandlers = {
  readonly tile: (playerId: string, event: MouseEvent<HTMLButtonElement>) => void;
  readonly startShortHanded: (side: Side) => void;
  readonly action: (
    tile: PlayerTile,
    action: PadAction,
    event: MouseEvent<HTMLButtonElement>,
  ) => void;
  readonly substitute: (
    coming: PlayerTile,
    going: PlayerTile,
    event: MouseEvent<HTMLButtonElement>,
  ) => void;
  readonly closePad: () => void;
  readonly turnovers: (side: Side) => void;
  /** Opens a team's whole bench in the pad: to pick one, or who comes in for `forId`. */
  readonly bench: (side: Side, forId: string | null) => void;
  /** A player tapped in the opened bench. */
  readonly benchPick: (playerId: string, event: MouseEvent<HTMLButtonElement>) => void;
  readonly takeBackTurnover: (tile: PlayerTile) => void;
  readonly teamTurnover: (side: Side) => void;
  readonly takeBackTeamTurnover: (side: Side) => void;
  readonly more: (open: boolean) => void;
  readonly swapColors: () => void;
  /** Leaving the game by a link: the session is released first. */
  readonly leave: (to: string) => (event: MouseEvent<HTMLAnchorElement>) => void;
};

export type CourtViewProps = {
  readonly t: Translate;
  readonly view: ScoringView;
  /** "Bears at Hawks". */
  readonly title: string;
  /** The game's day and time, or null when it has none. */
  readonly when: string | null;
  /** The game clock as it reads now, "7:58". */
  readonly clock: ReactNode;
  readonly banner: CourtBanner;
  /** What the tracker has to tell about holding the game; nothing most of the time. */
  readonly notices?: ReactNode;
  readonly pad: PadMode;
  /** The latest thing the screen said, or null. */
  readonly said: string | null;
  readonly moreOpen: boolean;
  readonly links: {
    readonly back: string;
    readonly account: string;
    /** The league's public page of this game. */
    readonly watch: string;
  };
  readonly on: CourtHandlers;
  readonly slots?: CourtSlots;
  /** Drawn over the screen: the label that follows the finger while a player is dragged. */
  readonly children?: ReactNode;
  /** The drag of a bench player onto a floor player (scoring-screen.tsx). */
  readonly drag?: {
    readonly ref: Ref<HTMLElement>;
    readonly onPointerDown: (event: PointerEvent<HTMLElement>) => void;
    readonly onPointerMove: (event: PointerEvent<HTMLElement>) => void;
    readonly onPointerUp: (event: PointerEvent<HTMLElement>) => void;
    readonly onPointerCancel: (event: PointerEvent<HTMLElement>) => void;
    readonly onLostPointerCapture: (event: PointerEvent<HTMLElement>) => void;
    readonly onClickCapture: (event: MouseEvent<HTMLElement>) => void;
    readonly onClick: (event: MouseEvent<HTMLElement>) => void;
  };
};

const sides = basketball.SIDES;

/** The ids the pad and the chips that open it share (aria-controls). */
const padId = 'court-pad';
const moreId = 'court-more';

export function CourtView(props: CourtViewProps) {
  const { t, view, pad, on, slots = {} } = props;
  const stage = view.pickingLineups ? 'lineups' : 'play';
  return (
    <main
      className="court court-play"
      data-tracker=""
      data-scoring=""
      data-stage={stage}
      data-plays={view.plays}
      data-pad-mode={pad.kind}
      ref={props.drag?.ref}
      onPointerDown={props.drag?.onPointerDown}
      onPointerMove={props.drag?.onPointerMove}
      onPointerUp={props.drag?.onPointerUp}
      onPointerCancel={props.drag?.onPointerCancel}
      onLostPointerCapture={props.drag?.onLostPointerCapture}
      onClickCapture={props.drag?.onClickCapture}
      onClick={props.drag?.onClick}
    >
      <header className="court-top">
        <h1 className="court-title">
          <span className="court-title-teams">{props.title}</span>
          {props.when === null ? null : <span className="court-title-when">{props.when}</span>}
        </h1>
        <button
          type="button"
          className="court-button court-more-button"
          aria-haspopup="dialog"
          aria-expanded={props.moreOpen}
          aria-controls={moreId}
          onClick={() => on.more(true)}
        >
          <span className="court-more-dots" aria-hidden="true" />
          <span className="court-more-word">{t('tracker.court.more')}</span>
        </button>
        <div className="court-board" role="group" aria-label={t('tracker.court.scoreboard')}>
          <Score t={t} team={view.teams.home} />
          <div className="court-clock" data-clock="">
            <span className="court-clock-time">{props.clock}</span>
            <span className="court-clock-period">{periodLabel(view, t)}</span>
          </div>
          <Score t={t} team={view.teams.away} />
        </div>
        <p
          className="court-banner"
          role="status"
          aria-live="polite"
          data-saved-banner=""
          data-state={props.banner.state}
        >
          {props.banner.text}
        </p>
        {props.notices === undefined || props.notices === null ? null : (
          <div className="court-notices">{props.notices}</div>
        )}
      </header>

      <section
        className="court-controls court-slot"
        data-slot="clock-controls"
        aria-label={t('tracker.court.controls')}
      >
        {slots.controls}
      </section>

      <div className="court-teams" data-teams="">
        {sides.map((side) => (
          <Team key={side} {...props} team={view.teams[side]} />
        ))}
      </div>

      <section
        className="court-log court-slot"
        data-slot="play-log"
        aria-label={t('tracker.court.plays')}
      >
        {slots.playLog}
      </section>

      <Pad {...props} />

      {props.moreOpen ? <More {...props} /> : null}
      {props.children}
    </main>
  );
}

const periodLabel = (view: ScoringView, t: Translate): string =>
  view.period > view.periods
    ? t('tracker.period.overtime', { number: view.period - view.periods })
    : t(view.periods === 2 ? 'tracker.period.half' : 'tracker.period.quarter', {
        number: view.period,
      });

function Score({ t, team }: { readonly t: Translate; readonly team: TeamPanel }) {
  return (
    <div
      className="court-score"
      data-side={team.side}
      data-color={team.color}
      data-score={team.side}
      role="group"
      aria-label={t('tracker.court.teamScore', { team: team.name, score: team.score })}
    >
      <span className="court-score-name" aria-hidden="true">
        {team.name}
      </span>
      <span className="court-score-value" aria-hidden="true">
        {team.score}
      </span>
    </div>
  );
}

function Team(props: CourtViewProps & { readonly team: TeamPanel }) {
  const { t, team, pad, on, slots = {} } = props;
  const turnoversOpen = pad.kind === 'turnovers' && pad.side === team.side;
  const benchOpen = pad.kind === 'bench' && pad.side === team.side;
  const openId = pad.kind === 'player' ? pad.playerId : null;
  const nameId = `court-team-${team.side}`;
  return (
    <section
      className="court-team"
      data-side={team.side}
      data-color={team.color}
      data-team-stage={team.stage}
      aria-labelledby={nameId}
    >
      <header className="court-team-head">
        <h2 className="court-team-name" id={nameId}>
          <span className="court-swatch" aria-hidden="true" />
          <span className="court-team-name-text">{team.name}</span>
          <span className="court-sr">{t(`tracker.team.${team.color}`)}</span>
        </h2>
        <div className="court-team-chips">
          {slots.teamHead?.(team.side)}
          {/* Where the bench is folded away (a short phone), this opens it in the pad. */}
          {team.stage === 'set' ? (
            <button
              type="button"
              className="court-chip court-bench-open"
              data-bench-open={team.side}
              aria-expanded={benchOpen}
              aria-controls={padId}
              onClick={() => on.bench(team.side, null)}
            >
              {t('tracker.bench.open', { count: team.bench.length })}
              <span className="court-caret" aria-hidden="true" />
            </button>
          ) : null}
          <button
            type="button"
            className="court-chip"
            data-turnovers={team.side}
            aria-expanded={turnoversOpen}
            aria-controls={padId}
            onClick={() => on.turnovers(team.side)}
          >
            {t.plural('tracker.turnovers.chip', team.turnovers)}
            <span className="court-caret" aria-hidden="true" />
          </button>
        </div>
      </header>

      {team.stage === 'no-players' ? (
        <div className="court-pick" data-pick={team.side}>
          <p>{t('tracker.lineup.noPlayers', { team: team.name })}</p>
          {slots.noPlayers?.(team.side)}
        </div>
      ) : null}

      {team.stage === 'picking' ? (
        <>
          <div className="court-pick" data-pick={team.side}>
            <p role="status">
              {team.picks.length === 0
                ? t('tracker.lineup.pick', { size: basketball.LINEUP_SIZE })
                : t('tracker.lineup.picked', {
                    count: team.picks.length,
                    size: basketball.LINEUP_SIZE,
                  })}
            </p>
            {team.picks.length === 0 ? null : (
              <button
                type="button"
                className="court-button"
                data-kind="main"
                data-start-short={team.side}
                onClick={() => on.startShortHanded(team.side)}
              >
                {t('tracker.lineup.startWith', { count: team.picks.length })}
              </button>
            )}
          </div>
          <div className="court-bench court-bench-picking" role="group" data-bench={team.side}>
            {team.bench.map((tile) => (
              <Tile key={tile.id} t={t} tile={tile} open={false} picking onTap={on.tile} />
            ))}
          </div>
        </>
      ) : null}

      {team.stage === 'set' ? (
        <>
          <div
            className="court-floor"
            role="group"
            aria-label={t('tracker.floor.title')}
            data-floor={team.side}
          >
            {team.floor.map((tile) => (
              <Tile key={tile.id} t={t} tile={tile} open={openId === tile.id} onTap={on.tile} />
            ))}
          </div>
          <div
            className="court-bench"
            role="group"
            aria-label={t('tracker.bench.title')}
            data-bench={team.side}
            data-fit=""
          >
            <span className="court-bench-label" aria-hidden="true">
              {t('tracker.bench.title')}
            </span>
            {/* Shown where the bench does not all fit in its row: how many more, and
                the way to all of them (scoring-screen.tsx counts what fits). */}
            <button
              type="button"
              className="court-tile court-chip-tile court-more-tile"
              data-more-bench={team.side}
              aria-label={t('tracker.bench.showAll', { team: team.name })}
              onClick={() => on.bench(team.side, null)}
            >
              <span className="court-more-count" aria-hidden="true" />
            </button>
            {team.bench.length === 0 ? (
              <p className="court-quiet">{t('tracker.bench.everyoneOn')}</p>
            ) : (
              team.bench.map((tile) => (
                <Tile key={tile.id} t={t} tile={tile} open={openId === tile.id} onTap={on.tile} />
              ))
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}

type TileProps = {
  readonly t: Translate;
  readonly tile: PlayerTile;
  /** Its options are open in the pad. */
  readonly open: boolean;
  /** Its team's starters are being picked: a tap picks, and no figures are shown. */
  readonly picking?: boolean;
  readonly onTap: CourtHandlers['tile'];
};

/** What a tile shows of its player: when none of it changed, the tile is not drawn again. */
const sameTile = (a: PlayerTile, b: PlayerTile): boolean =>
  a === b ||
  (a.id === b.id &&
    a.side === b.side &&
    a.player === b.player &&
    a.onCourt === b.onCourt &&
    a.points === b.points &&
    a.fouls === b.fouls &&
    a.ms === b.ms &&
    a.fouledOut === b.fouledOut &&
    a.unlisted === b.unlisted &&
    a.picked === b.picked);

/**
 * A player's tile. Drawn again only when what it shows changed (finding M6): a tap that
 * opens one player's options, or a basket for one player, leaves the other tiles alone,
 * so a slow tablet answers at once.
 */
const Tile = memo(
  TileButton,
  (before, after) =>
    before.open === after.open &&
    before.picking === after.picking &&
    before.t === after.t &&
    before.onTap === after.onTap &&
    sameTile(before.tile, after.tile),
);

function TileButton({ t, tile, open, picking = false, onTap }: TileProps) {
  const name = playerLabel(tile.player, t);
  const where = t(tile.onCourt ? 'tracker.where.floor' : 'tracker.where.bench');
  const label = t('tracker.tile.label', {
    player: name,
    where,
    points: t.plural('tracker.tile.pointsCount', tile.points),
    fouls: t.plural('tracker.tile.foulsCount', tile.fouls),
  });
  return (
    <button
      type="button"
      className={tile.onCourt ? 'court-tile' : 'court-tile court-chip-tile'}
      data-player={tile.id}
      data-side={tile.side}
      data-oncourt={tile.onCourt ? '1' : '0'}
      data-out={tile.fouledOut ? '' : undefined}
      data-unlisted={tile.unlisted ? '' : undefined}
      data-open={open ? '' : undefined}
      {...(picking
        ? { 'aria-pressed': tile.picked, 'aria-label': name }
        : {
            'aria-expanded': open,
            'aria-controls': padId,
            'aria-label': tile.fouledOut ? t('tracker.tile.labelOut', { label }) : label,
          })}
      onClick={(event) => onTap(tile.id, event)}
    >
      <span className="court-tile-number" data-none={tile.number === null ? '' : undefined}>
        {tile.number ?? t('tracker.tile.noNumber')}
      </span>
      <span className="court-tile-name">
        {tile.unlisted ? t('tracker.player.unlistedShort') : tile.shortName}
      </span>
      {picking ? null : (
        <span className="court-tile-stats">
          {tile.fouledOut ? <span className="court-tile-out">{t('tracker.tile.out')}</span> : null}
          <span className="court-tile-fouls" data-fouls={tile.fouls}>
            {t('tracker.tile.fouls', { count: tile.fouls })}
          </span>
          <span className="court-tile-points" data-points={tile.points}>
            {t('tracker.tile.points', { count: tile.points })}
          </span>
        </span>
      )}
      {picking || !tile.onCourt ? null : (
        <span className="court-tile-minutes">{basketball.formatMinutes(tile.ms)}</span>
      )}
    </button>
  );
}

function Pad(props: CourtViewProps) {
  const { t, view, pad, slots = {} } = props;
  const tile = pad.kind === 'player' ? findTile(view, pad.playerId) : undefined;
  return (
    <section
      className="court-pad"
      id={padId}
      data-pad=""
      aria-label={t('tracker.court.pad')}
      data-color={
        tile !== undefined
          ? view.teams[tile.side].color
          : pad.kind === 'turnovers' || pad.kind === 'bench'
            ? view.teams[pad.side].color
            : undefined
      }
    >
      {/* Always in the page, so a screen reader hears what is said the moment it is. */}
      <p className="court-say" role="status" aria-live="polite" data-say="">
        {props.said}
      </p>
      {tile !== undefined ? <PlayerPad {...props} tile={tile} /> : null}
      {pad.kind === 'turnovers' ? <TurnoversPad {...props} team={view.teams[pad.side]} /> : null}
      {pad.kind === 'bench' ? (
        <BenchPad {...props} team={view.teams[pad.side]} forId={pad.forId} />
      ) : null}
      {tile === undefined && pad.kind !== 'turnovers' && pad.kind !== 'bench' ? (
        <div className="court-rest" data-rest="">
          <div className="court-slot-rest" data-slot="pad-rest">
            {slots.padRest}
          </div>
          {view.status === 'scheduled' ? (
            <div className="court-pregame" data-pregame="">
              <h2 className="court-label">{t('tracker.pregame.title')}</h2>
              {/* How many players each team has, while its starters are still to be picked. */}
              {view.pickingLineups ? (
                <p data-player-counts="">
                  {sides
                    .map((side) =>
                      t.plural('tracker.pregame.players', view.teams[side].playerCount, {
                        team: view.teams[side].name,
                      }),
                    )
                    .join(t('tracker.queue.separator'))}
                </p>
              ) : null}
              <p>{t('tracker.pregame.todo')}</p>
              {slots.pregame}
            </div>
          ) : null}
          <div className="court-hint" data-hint="">
            <h2 className="court-label">{t('tracker.hint.title')}</h2>
            <p>{t('tracker.hint.players')}</p>
            {/* The hint says only what this size offers: where the bench is folded away
                (a short phone) there is no bench tile to tap or drag, and the stylesheet
                shows the second wording in place of the first. */}
            <p>
              <span className="court-hint-bench">{t('tracker.hint.subs')}</span>
              <span className="court-hint-folded">{t('tracker.hint.subsFolded')}</span>
            </p>
            <p>{t('tracker.hint.turnovers')}</p>
            <p>{t('tracker.hint.saved')}</p>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function PlayerPad(props: CourtViewProps & { readonly tile: PlayerTile }) {
  const { t, view, tile, on } = props;
  const team = view.teams[tile.side];
  const name = playerLabel(tile.player, t);
  const others = tile.onCourt ? team.bench : team.floor;
  const facts = [
    t(
      tile.fouledOut
        ? 'tracker.pad.who.out'
        : tile.onCourt
          ? 'tracker.pad.who.floor'
          : 'tracker.pad.who.bench',
    ),
    t.plural('tracker.pad.who.fouls', tile.fouls),
    t('tracker.pad.who.points', { count: tile.points }),
    t('tracker.pad.who.minutes', { minutes: basketball.formatMinutes(tile.ms) }),
  ];
  return (
    <div
      className="court-options"
      role="group"
      aria-label={t('tracker.pad.optionsFor', { player: name })}
      data-options={tile.id}
    >
      <div className="court-who">
        <span className="court-who-number" aria-hidden="true">
          {tile.number ?? t('tracker.tile.noNumber')}
        </span>
        <span className="court-who-text">
          <span className="court-who-name">{name}</span>
          <span className="court-who-facts" data-out={tile.fouledOut ? '' : undefined}>
            {facts.join(t('tracker.queue.separator'))}
          </span>
        </span>
        <button
          type="button"
          className="court-close"
          aria-label={t('tracker.pad.closeOptions')}
          onClick={on.closePad}
        >
          <span className="court-cross" aria-hidden="true" />
        </button>
      </div>
      <div className="court-subs" data-subs="">
        <span className="court-label">
          {t(tile.onCourt ? 'tracker.pad.subIn' : 'tracker.pad.inFor')}
        </span>
        {/* "Sub in" is the bench, as many as fit and a way to the rest; "In for" is the
            five on the court, all of them always. */}
        <div
          className="court-subs-row"
          data-fit={tile.onCourt ? '' : undefined}
          data-all={tile.onCourt ? undefined : ''}
        >
          {/* Where the bench does not all fit in this row: how many more, and the way
              to all of them, to come in for this player. */}
          {tile.onCourt ? (
            <button
              type="button"
              className="court-opt court-opt-sub court-more-tile"
              data-more-bench={tile.side}
              aria-label={t('tracker.bench.showAll', { team: team.name })}
              onClick={() => on.bench(tile.side, tile.id)}
            >
              <span className="court-more-count" aria-hidden="true" />
            </button>
          ) : null}
          {others.length === 0 ? (
            <p className="court-quiet">{t('tracker.bench.everyoneOn')}</p>
          ) : (
            others.map((other) => {
              const [coming, going] = tile.onCourt ? [other, tile] : [tile, other];
              return (
                <button
                  key={other.id}
                  type="button"
                  className="court-opt court-opt-sub"
                  data-act="sub"
                  data-other={other.id}
                  aria-label={t('tracker.pad.inForPlayer', {
                    in: playerLabel(coming.player, t),
                    out: playerLabel(going.player, t),
                  })}
                  onClick={(event) => on.substitute(coming, going, event)}
                >
                  <span className="court-opt-number">
                    {other.number ?? t('tracker.tile.noNumber')}
                  </span>
                  <span className="court-opt-name">
                    {other.unlisted ? t('tracker.player.unlistedShort') : other.shortName}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
      <div className="court-points">
        {([1, 2, 3] as const).map((points) => (
          <button
            key={points}
            type="button"
            className="court-opt court-opt-points"
            data-act={`p${points}`}
            aria-label={t('tracker.pad.scoreFor', {
              points: t('tracker.pad.points', { points }),
              player: name,
            })}
            onClick={(event) => on.action(tile, `p${points}`, event)}
          >
            <span className="court-opt-big">{t('tracker.pad.points', { points })}</span>
            <span className="court-opt-small">{t(`tracker.pad.pointsLabel.${points}`)}</span>
          </button>
        ))}
      </div>
      <div className="court-acts">
        <button
          type="button"
          className="court-opt court-opt-foul"
          data-act="foul"
          aria-label={t('tracker.pad.foulFor', { player: name })}
          onClick={(event) => on.action(tile, 'foul', event)}
        >
          {t('tracker.pad.foul')}
        </button>
        <button
          type="button"
          className="court-opt court-opt-unfoul"
          data-act="unfoul"
          aria-label={t('tracker.pad.unfoulFor', { player: name })}
          disabled={tile.fouls === 0}
          onClick={(event) => on.action(tile, 'unfoul', event)}
        >
          {t('tracker.pad.unfoul')}
        </button>
        <button
          type="button"
          className="court-opt court-opt-turnover"
          data-act="turnover"
          aria-label={t('tracker.pad.turnoverFor', { player: name })}
          onClick={(event) => on.action(tile, 'turnover', event)}
        >
          {t('tracker.pad.turnover')}
        </button>
      </div>
    </div>
  );
}

/**
 * A team's whole bench, in the pad: where it is folded away (a short phone) or longer
 * than its row. A tap opens that player's options, or brings them in for the floor
 * player the bench was opened for.
 */
function BenchPad(
  props: CourtViewProps & { readonly team: TeamPanel; readonly forId: string | null },
) {
  const { t, view, team, forId, on } = props;
  const going = forId === null ? undefined : findTile(view, forId);
  return (
    <div className="court-options court-bench-pad" role="group" data-bench-list={team.side}>
      <div className="court-who">
        <span className="court-swatch" aria-hidden="true" />
        <span className="court-who-text">
          <span className="court-who-name">
            {going === undefined
              ? t('tracker.bench.of', { team: team.name })
              : t('tracker.bench.comesInFor', { player: playerLabel(going.player, t) })}
          </span>
        </span>
        <button
          type="button"
          className="court-close"
          aria-label={t('tracker.pad.closeOptions')}
          onClick={on.closePad}
        >
          <span className="court-cross" aria-hidden="true" />
        </button>
      </div>
      {team.bench.length === 0 ? (
        <p className="court-quiet court-turnovers-none">{t('tracker.bench.everyoneOn')}</p>
      ) : (
        <div className="court-bench-rows">
          {team.bench.map((player) => (
            <button
              key={player.id}
              type="button"
              className="court-opt court-opt-sub"
              data-bench-pick={player.id}
              aria-label={
                going === undefined
                  ? playerLabel(player.player, t)
                  : t('tracker.pad.inForPlayer', {
                      in: playerLabel(player.player, t),
                      out: playerLabel(going.player, t),
                    })
              }
              onClick={(event) => on.benchPick(player.id, event)}
            >
              <span className="court-opt-number">
                {player.number ?? t('tracker.tile.noNumber')}
              </span>
              <span className="court-opt-name">
                {player.unlisted ? t('tracker.player.unlistedShort') : player.shortName}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TurnoversPad(props: CourtViewProps & { readonly team: TeamPanel }) {
  const { t, team, on } = props;
  const none = team.turnoverList.length === 0 && team.teamTurnovers === 0;
  return (
    <div className="court-options court-turnovers" role="group" data-turnover-list={team.side}>
      <div className="court-who">
        <span className="court-swatch" aria-hidden="true" />
        <span className="court-who-text">
          <span className="court-who-name">
            {t('tracker.turnovers.title', { team: team.name })}
          </span>
        </span>
        <button
          type="button"
          className="court-close"
          aria-label={t('tracker.pad.closeOptions')}
          onClick={on.closePad}
        >
          <span className="court-cross" aria-hidden="true" />
        </button>
      </div>
      {none ? (
        <p className="court-quiet court-turnovers-none">{t('tracker.turnovers.none')}</p>
      ) : (
        <ul className="court-turnover-rows">
          {team.turnoverList.map((tile) => (
            <li key={tile.id} data-turnovers-of={tile.id}>
              <span className="court-turnover-who">{playerShortLabel(tile.player, t)}</span>
              <b className="court-turnover-count">{tile.turnovers}</b>
              <button
                type="button"
                className="court-opt court-opt-minus"
                data-act="unturnover"
                aria-label={t('tracker.turnovers.takeBack', {
                  who: playerLabel(tile.player, t),
                })}
                onClick={() => on.takeBackTurnover(tile)}
              >
                <span className="court-minus" aria-hidden="true" />
              </button>
            </li>
          ))}
          {team.teamTurnovers === 0 ? null : (
            <li data-turnovers-of="team">
              <span className="court-turnover-who">{t('tracker.turnovers.team')}</span>
              <b className="court-turnover-count">{team.teamTurnovers}</b>
              <button
                type="button"
                className="court-opt court-opt-minus"
                data-act="team-unturnover"
                aria-label={t('tracker.turnovers.takeBackTeam', { team: team.name })}
                onClick={() => on.takeBackTeamTurnover(team.side)}
              >
                <span className="court-minus" aria-hidden="true" />
              </button>
            </li>
          )}
        </ul>
      )}
      <button
        type="button"
        className="court-opt court-opt-team-turnover"
        data-act="team-turnover"
        title={t('tracker.turnovers.addTeamHelp')}
        onClick={() => on.teamTurnover(team.side)}
      >
        {t('tracker.turnovers.addTeam')}
      </button>
    </div>
  );
}

function More(props: CourtViewProps) {
  const { t, on, links, slots = {} } = props;
  return (
    <div className="court-sheet-wrap" data-more="">
      <div className="court-scrim" onClick={() => on.more(false)} />
      <div
        className="court-sheet"
        id={moreId}
        role="dialog"
        aria-modal="true"
        aria-labelledby="court-more-title"
      >
        <div className="court-sheet-head">
          <h2 id="court-more-title">{t('tracker.court.moreTitle')}</h2>
          <button
            type="button"
            className="court-close"
            aria-label={t('tracker.court.close')}
            onClick={() => on.more(false)}
          >
            <span className="court-cross" aria-hidden="true" />
          </button>
        </div>
        <div className="court-sheet-items">
          <div className="court-sheet-item">
            <button
              type="button"
              className="court-button"
              data-swap-colors=""
              onClick={on.swapColors}
            >
              {t('tracker.court.swapColors')}
            </button>
            <p className="court-quiet">{t('tracker.court.swapColorsHelp')}</p>
          </div>
          {slots.more}
          <div className="court-sheet-item">
            <a className="court-button" href={links.watch} target="_blank" rel="noopener">
              {t('tracker.court.watch')}
            </a>
            <p className="court-quiet">{t('tracker.court.watchHelp')}</p>
          </div>
          <div className="court-sheet-item">
            <a className="court-button" href={links.back} onClick={on.leave(links.back)}>
              {t('tracker.back')}
            </a>
          </div>
          <p className="court-quiet" data-shared-device="">
            {t('tracker.sharedDevice.text')}{' '}
            <a href={links.account} onClick={on.leave(links.account)}>
              {t('tracker.sharedDevice.link')}
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
