// The list of every command, by name (T-23). The apps look commands up here (the
// worker by a job's command name, receipts by theirs), and the two-league harness
// checks that each one it lists has an isolation case (T-65).

/** What the registry keeps of a command: callable, and its name. */
export type NamedCommand = ((...args: never[]) => unknown) & { readonly commandName: string };

export type CommandRegistry = ReadonlyMap<string, NamedCommand>;

export function commandRegistry(commands: readonly NamedCommand[]): CommandRegistry {
  const byName = new Map<string, NamedCommand>();
  for (const command of commands) {
    if (byName.has(command.commandName)) {
      throw new Error(`Two commands are named ${command.commandName}.`);
    }
    byName.set(command.commandName, command);
  }
  return byName;
}
