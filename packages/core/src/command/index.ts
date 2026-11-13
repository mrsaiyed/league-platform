// The command shape every module uses (T-23, T-24, T-74, T-196).
export { commandRegistry, type CommandRegistry, type NamedCommand } from './command-registry.ts';
export { defineCommand, type Command, type CommandDefinition } from './define-command.ts';
export { onEvent } from './on-event.ts';
export type {
  CommandContext,
  CommandDeps,
  CommandLogLine,
  CommandTx,
  DomainEvent,
  EventHandler,
  Job,
  JobQueue,
  TransactionRunner,
} from './ports.ts';
export {
  fail,
  ok,
  type CommandError,
  type InvalidInput,
  type NotAllowed,
  type Result,
} from './result.ts';
