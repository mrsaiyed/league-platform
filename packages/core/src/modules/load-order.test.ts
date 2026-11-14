// Games, leagues and standings import each other's index files in a ring (games ->
// leagues -> standings -> games). Whichever is loaded first must still work: the
// events they share live in a leaf file, so nothing is read before it is defined.
import { describe, expect, it, vi } from 'vitest';

describe('module load order', () => {
  it('loads games first, then standings', async () => {
    vi.resetModules();
    const games = await import('./games/index.ts');
    const standings = await import('./standings/index.ts');
    expect(games.gameFinalized).toBe('games.finalized');
    expect(standings.standingsHandlers).toHaveLength(2);
  });

  it('loads standings first, then games', async () => {
    vi.resetModules();
    const standings = await import('./standings/index.ts');
    const games = await import('./games/index.ts');
    expect(games.gameReopened).toBe('games.reopened');
    expect(standings.standingsHandlers).toHaveLength(2);
  });

  it('loads leagues first, then games and standings', async () => {
    vi.resetModules();
    await import('./leagues/index.ts');
    const games = await import('./games/index.ts');
    const standings = await import('./standings/index.ts');
    expect(games.gameFinalized).toBe('games.finalized');
    expect(standings.standingsHandlers).toHaveLength(2);
  });
});
