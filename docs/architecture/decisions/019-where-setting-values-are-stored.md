# 019 — Where setting values are stored

Date: 2026-11-13. Step 2.1; serves T5 §6 (T-98) and T-44, T-46, T-50. Decided by the lead (technical). T-231.

## Problem

T5 §6 says every setting is declared once in code (key, schema, default, the levels it can be set at, permission, label) and that a value is looked up season, then program, then league, then our default. T3 did not say where the values an admin sets are kept. Step 2.14 needs a place to read and write them, and step 2.1 builds it.

## What

- **One table, `setting_values`** (migration 0007): one row per value an admin set, with `league_id`, `level` (league, program or season), `program_id` or `season_id` (the place, empty at league level), `key`, `value` and `version`.
- **The level names its place and only that place**: a league value names neither a program nor a season, a program value names its program only, a season value its season only (`setting_values_place`). The program and season are the same league's (T-40). The key, level and place never change once the row exists; a different place is a new row.
- **One value per key at each place** (`setting_values_once`). "Not set" is no row: clearing a value removes it, and the lookup falls back to the next level. Values are not binned. The command that sets or clears one writes the activity log (step 2.14).
- **`value` is a small versioned document, `{"version": n, "value": <the value>}`.** The version is the declared format of that setting's value, so a declaration can upgrade an old value when it is read (T-50, T-104). The database checks only the envelope (a version, a value that is not null, nothing else, at most 8 KB); the declaration's schema checks the value itself, on writing and on reading. The envelope is an object because both database drivers send an object as JSON, while a bare string or array would not arrive as JSON.
- **The key is a dotted camelCase name** (`notifications.reminderLeadHours`), at most 100 characters. The database does not hold the list of keys: settings are declared in code (T-98). A value whose key is no longer declared is ignored when read; removing such rows is tidying, not a schema change.
- Behind the league fence like every league table, with its one forced policy; `version` for two admins saving at once (T-46, A-8).

## Left for later steps: the bin

Divisions, venues and courts go to the bin (`deleted_at`, T-45), and the database does not carry a bin move down to children. Step 2.16 (the commands that bin and restore them) and the nightly purge must handle:

- **A live child under a binned parent**: a sub-division whose parent is in the bin, or a court whose venue is. Binning a parent does not bin its children; the command decides whether to bin them too or refuse while live children remain.
- **No cascade on purge**: purging a parent for good fails while its children (or anything naming it) still exist, so the purge must remove or refuse in the right order.
- **Restore hitting a name**: a name in the bin lets its place go, so restoring it fails on the name rule (`divisions_name_key`, `venues_name_key`, `courts_name_key`) if a live row has taken that name since. Restore must say so plainly and offer a rename.

## Considered

- **A JSON column on `leagues`, `programs` and `seasons`.** One read per level, but a save rewrites the whole document, so two admins changing two different settings would collide on one version, and nothing in the database could say which keys exist at which level.
- **A column per setting.** Real columns are what T-44 asks for when we search, sort, join or constrain. Settings are not used that way: each is read whole by its key, and its limits live in its declaration. A column per setting would make every new setting a migration, which T-98 is meant to avoid. A setting the database must itself enforce (the unique-jersey switch, T-44) stays a real column on its table.
- **Season rules (`seasons.rules`).** These stay a separate versioned document, since they change results and are previewed and locked as S-1 says. Settings are everything else.

## Revisit if

A setting must be enforced by the database itself (then it becomes a real column), values are needed at a further level (a team or a division), or a value grows past the 8 KB limit, which would mean it is a document of its own rather than a setting.

## Notes from the step 2.16 review

- **Who may read the lists.** `scheduling.list_venues` needs `schedule.read` at any scope, so a scheduler or scorekeeper limited to one program can list venues (they are the league's shared data). `leagues.list_divisions` needs `divisions.manage` today; other roles will need a broader read in steps 2.18 and 2.52 and in registration, and that read is added then, not by loosening this one.
- **Removing is refused for what uses it.** Removing a division or a venue must also be refused while teams (step 2.18) or games (step 2.3) use it, once those exist. Today only live sub-divisions and live courts stop it.
- **Purge order: children first.** The nightly purge removes sub-divisions before their parent division, and courts before their venue, and teams and games before either, since the database does not cascade.
