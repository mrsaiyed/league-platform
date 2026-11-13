// Every command in the registry names the permission it needs (T4 §4), and the
// access module knows that name. A command that names nothing, or something that
// is not a permission, fails here, as well as in the role-by-command test of
// packages/database (T4 §12), which runs each role against it as the name says.
import { describe, expect, it } from 'vitest';
import { commands } from './commands.ts';
import { commandsWithoutRequirement } from './modules/access/index.ts';

describe('the command registry', () => {
  it('has every command name a known permission', () => {
    expect(commandsWithoutRequirement(commands.values())).toEqual([]);
  });

  it('would fail on a planted command that names none', () => {
    const planted = Object.assign(() => undefined, { commandName: 'games.planted' });
    expect(commandsWithoutRequirement([...commands.values(), planted])).toEqual(['games.planted']);
  });
});
