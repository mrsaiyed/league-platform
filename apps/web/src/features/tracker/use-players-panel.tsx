// The Players panel as the scoring screen holds it (step 2.118, part 2): open or shut,
// what is typed (kept on the device by game, so it survives the panel shut and a
// reload), and what the controller answered, worded from the message files. It opens
// by itself, once, when a team has nobody on it and this device may change players.
import type { Translate } from '@srleagues/site';
import type { basketball } from '@srleagues/sports';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { playerLabel } from './engine-words.ts';
import type { DeviceRosters } from './opened-game-storage.ts';
import {
  cleared,
  fixChange,
  fixNameBox,
  fixNumberBox,
  lineBox,
  lineChanges,
  lineProblem,
  nameBox,
  readDrafts,
  someTeamIsEmpty,
  typed,
  writeDrafts,
  type PlayerDrafts,
} from './players-form.ts';
import { PlayersButton, PlayersSheet, type PanelSaid } from './players-panel.tsx';
import {
  numbersOfLine,
  playersPanel,
  teamOn,
  type PlayerChange,
  type PlayerSide,
} from './roster-changes.ts';
import type {
  PlayersResult,
  TrackerController,
  TrackerControllerStatus,
} from './tracker-controller.ts';

/** The device's own storage for drafts, or none where it cannot be reached. */
function draftStore(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** What a refused change says, from the message files (S-37 names who wears the number). */
function refusalText(
  result: Exclude<PlayersResult, { ok: true }>,
  rosters: DeviceRosters,
  side: PlayerSide,
  t: Translate,
) {
  switch (result.reason) {
    case 'not-scoring':
      return t('tracker.players.readOnly.device');
    case 'invalid':
      return t('tracker.players.invalid');
    case 'storage':
      return t('tracker.players.refused.not-saved');
    case 'rule': {
      const { problem } = result;
      if (problem.wornBy === undefined) return t(problem.key);
      const id = problem.wornBy.playerId.toLowerCase();
      const wearer = teamOn(rosters, side).players.find((p) => p.personId.toLowerCase() === id);
      return `${t(problem.key)} ${t('tracker.players.wornBy', {
        player: playerLabel(wearer, t),
        jersey: problem.wornBy.jersey,
      })}`;
    }
  }
}

export function usePlayersPanel(args: {
  readonly controller: TrackerController;
  readonly status: TrackerControllerStatus;
  readonly state: basketball.GameState;
  readonly rosters: DeviceRosters;
  readonly t: Translate;
  /** The saved banner's words, shown over the panel too. */
  readonly banner: string;
  /** Where the drafts are kept: the game's id. */
  readonly draftsFor: string;
  /** Called as the panel is opened by a button (More is shut). */
  readonly onOpen?: () => void;
}): {
  readonly open: boolean;
  readonly sheet: ReactNode;
  readonly button: (where: 'more' | 'pregame' | PlayerSide) => ReactNode;
  readonly shut: () => boolean;
} {
  const { controller, status, state, rosters, t, draftsFor } = args;
  const [open, setOpen] = useState(false);
  const [fixing, setFixing] = useState<string | null>(null);
  const [said, setSaid] = useState<Partial<Record<PlayerSide, PanelSaid>>>({});
  const [drafts, setDrafts] = useState<PlayerDrafts>(() => readDrafts(draftStore(), draftsFor));
  const keep = useCallback(
    (next: PlayerDrafts) => {
      setDrafts(next);
      writeDrafts(draftStore(), draftsFor, next);
    },
    [draftsFor],
  );
  const latest = useRef(drafts);
  latest.current = drafts;

  const scoring = status.mode.kind === 'scoring';
  const panel = useMemo(
    () =>
      playersPanel({
        rosters,
        waiting: status.waiting,
        refused: status.notApplied,
        game: state,
        scoring,
      }),
    [rosters, status.waiting, status.notApplied, state, scoring],
  );

  // Opens by itself, once a screen, when a team has nobody and changes are taken here.
  const openedBySelf = useRef(false);
  const emptyTeam = someTeamIsEmpty(rosters);
  useEffect(() => {
    if (openedBySelf.current || !emptyTeam || panel.readOnly !== null) return;
    openedBySelf.current = true;
    setOpen(true);
  }, [emptyTeam, panel.readOnly]);

  // Escape shuts the panel, as it shuts More and the log.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const send = useCallback(
    async (
      side: PlayerSide,
      changes: readonly PlayerChange[],
      done: (r: PlayersResult) => void,
    ) => {
      const result = await controller.changePlayers(changes);
      done(result);
      setSaid((before) => ({
        ...before,
        [side]: result.ok
          ? {
              kind: 'done',
              text:
                changes[0]?.type === 'add-player'
                  ? t.plural('tracker.players.added', changes.length)
                  : changes[0]?.type === 'remove-player'
                    ? t('tracker.players.takenOff')
                    : t('tracker.players.saved'),
            }
          : { kind: 'error', text: refusalText(result, rosters, side, t) },
      }));
    },
    [controller, rosters, t],
  );

  const on = {
    type: (box: string, text: string) => keep(typed(latest.current, box, text)),
    add: (side: PlayerSide) => {
      const line = latest.current[lineBox(side)] ?? '';
      const name = latest.current[nameBox(side)] ?? '';
      if (lineProblem(line, name) !== null) {
        setSaid((before) => ({
          ...before,
          [side]: { kind: 'error', text: t('tracker.players.numbersWithName') },
        }));
        return;
      }
      const changes = lineChanges(side, line, name);
      void send(side, changes, (result) => {
        if (result.ok) keep(cleared(latest.current, [lineBox(side), nameBox(side)]));
        else if (result.reason === 'storage' && result.stored > 0) {
          // The first of a bench were kept: what is left of the line is what was not.
          keep(
            typed(
              latest.current,
              lineBox(side),
              numbersOfLine(line).slice(result.stored).join(' '),
            ),
          );
        }
      });
    },
    fix: (playerId: string | null) => {
      if (fixing !== null && playerId !== fixing) {
        keep(cleared(latest.current, [fixNumberBox(fixing), fixNameBox(fixing)]));
      }
      setFixing(playerId);
    },
    save: (side: PlayerSide, playerId: string) => {
      const id = playerId.toLowerCase();
      const player = teamOn(rosters, side).players.find((p) => p.personId.toLowerCase() === id);
      if (player === undefined) return;
      const change = fixChange(
        side,
        player,
        latest.current[fixNumberBox(playerId)],
        latest.current[fixNameBox(playerId)],
      );
      if (change === null) {
        setFixing(null);
        return;
      }
      void send(side, [change], (result) => {
        if (!result.ok) return;
        keep(cleared(latest.current, [fixNumberBox(playerId), fixNameBox(playerId)]));
        setFixing(null);
      });
    },
    takeOff: (side: PlayerSide, playerId: string) => {
      void send(side, [{ type: 'remove-player', side, playerId }], (result) => {
        if (result.ok) setFixing(null);
      });
    },
    close: () => setOpen(false),
  };

  return {
    open,
    sheet: open ? (
      <PlayersSheet
        t={t}
        panel={panel}
        rosters={rosters}
        drafts={drafts}
        fixing={fixing}
        said={said}
        banner={args.banner}
        on={on}
      />
    ) : null,
    button: (where) => (
      <PlayersButton
        t={t}
        where={where}
        onOpen={() => {
          args.onOpen?.();
          setOpen(true);
        }}
      />
    ),
    shut: () => {
      if (!open) return false;
      setOpen(false);
      return true;
    },
  };
}
