// What a command names as the permission it needs (T4 §4). Almost always one of the
// permissions in roles.ts. Two needs are no role's: being signed in at all (reading
// one's own access, accepting an invitation with its link) and being our own staff
// (creating and suspending leagues; staff are not a league role, A-3, T-77).
//
// The name is what the role-by-command test (T4 §12) runs each command against, so
// a command that names nothing, or names something not here, fails it (fail closed).
import { isPermission, type Permission } from './roles.ts';

export const nonRoleRequirements = ['signed-in', 'platform-staff'] as const;
export type NonRoleRequirement = (typeof nonRoleRequirements)[number];
export type CommandRequirement = Permission | NonRoleRequirement;

export function isCommandRequirement(value: unknown): value is CommandRequirement {
  return isPermission(value) || (nonRoleRequirements as readonly unknown[]).includes(value);
}

/**
 * The commands, by name, that do not name a known requirement: none named, an empty
 * one, or one that is neither a permission nor a non-role requirement.
 */
export function commandsWithoutRequirement(
  commands: Iterable<{ readonly commandName: string; readonly permission?: unknown }>,
): string[] {
  const missing: string[] = [];
  for (const command of commands) {
    if (!isCommandRequirement(command.permission)) missing.push(command.commandName);
  }
  return missing;
}
