// The Players panel as it is drawn (step 2.118, part 2): both teams, the add line and
// what is typed in it, a clash marked on both players, the name box read-only with its
// reason for the league's own players, take off only for a table player not reviewed,
// read-only when the game is final or the device is not scoring, a refused change with
// the plays refused because of it. The data is `playersPanel`'s own (roster-changes.ts).
import type { BatchCommand, TablePlayerCommand } from '@srleagues/contracts';
import { createTranslator, en } from '@srleagues/site';
import type { basketball } from '@srleagues/sports';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { DevicePlayer, DeviceRosters } from './opened-game-storage.ts';
import { lineBox, nameBox, fixNameBox, type PlayerDrafts } from './players-form.ts';
import { PlayersButton, PlayersSheet, type PanelSaid } from './players-panel.tsx';
import { playersPanel, withChanges } from './roster-changes.ts';
import type { KeptTap } from './queue-storage.ts';
import { tippedOff } from './scoring-test-game.test-helper.ts';
import { trackerCatalog } from './tracker-catalog.ts';
import type { RefusedCommand } from './tracker-queue.ts';

const t = createTranslator('en', { en: trackerCatalog(en) });
const gameId = '00000000-0000-4000-8000-0000000000a1';
const id = (n: number) => `00000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`;
const player = (
  n: number,
  jersey: string | null,
  more: Partial<DevicePlayer> = {},
): DevicePlayer => ({
  personId: id(n),
  firstName: `Made${n}`,
  lastName: 'Up',
  jerseyNumber: jersey,
  left: false,
  addedAtGameId: null,
  toReview: false,
  ...more,
});
const atTable = { addedAtGameId: gameId, toReview: true };
const rosters: DeviceRosters = {
  home: { teamId: id(90), name: 'Made Home', players: [player(1, '4'), player(2, '7', atTable)] },
  away: { teamId: id(91), name: 'Made Away', players: [] },
  uniqueJerseys: false,
  allowTies: false,
};
const command = (n: number, input: BatchCommand['input']): BatchCommand =>
  ({ commandId: id(50 + n), at: 1, input }) as BatchCommand;
const none = () => undefined;
const on = { type: none, add: none, fix: none, save: none, takeOff: none, close: none };

function draw(args: {
  readonly rosters?: DeviceRosters;
  readonly waiting?: readonly BatchCommand[];
  readonly refused?: readonly RefusedCommand[];
  readonly game?: basketball.GameState | null;
  readonly scoring?: boolean;
  readonly drafts?: PlayerDrafts;
  readonly fixing?: string | null;
  readonly said?: Partial<Record<'home' | 'away', PanelSaid>>;
}): string {
  const waiting = args.waiting ?? [];
  const shown = withChanges(args.rosters ?? rosters, waiting as TablePlayerCommand[], gameId);
  const panel = playersPanel({
    rosters: shown,
    waiting: waiting.map((c): KeptTap => ({ command: c, moment: null })),
    refused: args.refused ?? [],
    game: args.game ?? null,
    scoring: args.scoring ?? true,
  });
  return renderToStaticMarkup(
    createElement(PlayersSheet, {
      t,
      panel,
      rosters: shown,
      drafts: args.drafts ?? {},
      fixing: args.fixing ?? null,
      said: args.said ?? {},
      banner: '2 plays waiting to send',
      on,
    }),
  );
}

const count = (html: string, mark: string) => html.split(mark).length - 1;

describe('the Players panel, drawn', () => {
  it('draws both teams, each with its add line, and says what waits', () => {
    const html = draw({});
    expect(html).toContain('data-players-team="home"');
    expect(html).toContain('data-players-team="away"');
    expect(html).toContain('data-players-line="home"');
    expect(html).toContain('data-players-line="away"');
    expect(html).toContain('No Made Away players yet.');
    expect(html).toContain('3 5 10 12 14');
    expect(html).toContain('2 plays waiting to send');
    expect(html).toContain('role="dialog"');
  });

  it('gives back a half-typed line as it was typed', () => {
    const html = draw({ drafts: { [lineBox('away')]: '3 5 1', [nameBox('home')]: 'Made Na' } });
    expect(html).toMatch(/data-players-line="away"[^>]*value="3 5 1"/u);
    expect(html).toMatch(/data-players-name="home"[^>]*value="Made Na"/u);
    expect(html).not.toMatch(/data-players-add="away"[^>]*disabled/u);
    expect(draw({})).toMatch(/data-players-add="home" disabled=""/u);
  });

  it('lists added players waiting, a clash marked on both and the add never stopped (S-44)', () => {
    const waiting = [
      command(1, { type: 'add-player', side: 'home', playerId: id(21), jersey: '4', name: '' }),
    ];
    const html = draw({ waiting });
    expect(html).toContain(`data-player-row="${id(21)}" data-clash="" data-waiting=""`);
    expect(html).toContain(`data-player-row="${id(1)}" data-clash=""`);
    expect(count(html, 'Same number as')).toBe(2);
    expect(html).toContain('Not sent yet');
  });

  it('marks a number being typed on the player who wears it, with the add still offered', () => {
    const html = draw({ drafts: { [lineBox('home')]: '7 9' } });
    expect(html).toContain('#7 is already worn by #7 Made2 Up');
    expect(html).toContain(`data-player-row="${id(2)}" data-clash=""`);
    expect(html).not.toMatch(/data-players-add="home"[^>]*disabled/u);
  });

  it('keeps a league player’s name box read-only and says why, with no take off (S-45)', () => {
    const html = draw({ fixing: id(1) });
    expect(html).toMatch(new RegExp(`readOnly=""[^>]*data-player-name-box="${id(1)}"`, 'u'));
    expect(html).toContain(`data-player-reason="${id(1)}"`);
    expect(html).toContain('on the team’s own roster');
    expect(html).not.toContain(`data-player-takeoff="${id(1)}"`);
    expect(html).toContain(`data-player-number="${id(1)}"`);
  });

  it('lets a player added at a table and not reviewed be renamed and taken off', () => {
    const html = draw({ fixing: id(2), drafts: { [fixNameBox(id(2))]: 'Made Fixed' } });
    expect(html).not.toMatch(new RegExp(`readOnly=""[^>]*data-player-name-box="${id(2)}"`, 'u'));
    expect(html).toContain('value="Made Fixed"');
    expect(html).toContain(`data-player-takeoff="${id(2)}"`);
    const reviewed = {
      ...rosters,
      home: {
        ...rosters.home,
        players: [player(2, '7', { addedAtGameId: gameId, toReview: false })],
      },
    };
    const shut = draw({ rosters: reviewed, fixing: id(2) });
    expect(shut).toContain('A league admin has checked this player');
    expect(shut).not.toContain('data-player-takeoff');
  });

  it('is read-only, with the reason, on a final game and on a device that is not scoring', () => {
    const final = draw({ game: { ...tippedOff(), status: 'final' } });
    expect(final).toContain('data-players-read-only="final"');
    expect(final).toContain('This game is over');
    expect(final).not.toContain('data-players-line');
    expect(final).not.toContain('data-player-fix');
    const watching = draw({ scoring: false });
    expect(watching).toContain('data-players-read-only="device"');
    expect(watching).not.toContain('data-players-add');
  });

  it('says a refused change under its player, with the plays refused because of it', () => {
    const add = command(1, {
      type: 'add-player',
      side: 'away',
      playerId: id(30),
      jersey: '12',
      name: '',
    });
    const refused = [
      { command: add, refusal: { problem: 'player-id-taken' } },
      {
        command: command(2, { type: 'undo' } as unknown as BatchCommand['input']),
        refusal: { problem: 'player-not-added', follows: add.commandId, playerId: id(30) },
      },
    ] as unknown as RefusedCommand[];
    const html = draw({ refused });
    expect(html).toContain('data-players-refused=""');
    expect(html).toContain('<strong>#12</strong> This player could not be added.');
    expect(html).toContain('1 play that names them was not saved.');
  });

  it('says what a team’s last change did, and opens from three places', () => {
    const html = draw({
      said: { away: { kind: 'done', text: t.plural('tracker.players.added', 5) } },
    });
    expect(html).toContain('data-players-said="away"');
    expect(html).toContain('5 players added.');
    for (const where of ['more', 'pregame', 'away'] as const) {
      const button = renderToStaticMarkup(createElement(PlayersButton, { t, where, onOpen: none }));
      expect(button).toContain(`data-players-open="${where}"`);
    }
  });
});

describe('both teams within reach on a phone (step 2.118, part 3)', () => {
  it('puts a jump to the away team at the top, and each add line above its list', () => {
    const html = draw({
      rosters: { ...rosters, away: { ...rosters.away, players: [player(3, '9')] } },
    });
    const jump = html.indexOf('data-players-jump="away"');
    expect(jump).toBeGreaterThan(-1);
    expect(html).toContain('Go to the away team: Made Away');
    expect(jump).toBeLessThan(html.indexOf('data-players-team="home"'));
    expect(html).toContain('id="court-players-team-away"');
    for (const side of ['home', 'away']) {
      const team = html.indexOf(`data-players-team="${side}"`);
      const line = html.indexOf(`data-players-line="${side}"`, team);
      const firstRow = html.indexOf('data-player-row=', team);
      expect(line).toBeGreaterThan(team);
      expect(line).toBeLessThan(firstRow);
    }
  });
});
