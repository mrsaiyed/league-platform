// English interface text (T-187), one part of `en`, which ../en.ts joins:
// The admin's fixture import.
// Keys in alphabetical order: a new key goes in its place, never at the end (step 2.188).
// A comment above a key is about that key or, from before the split, about the keys
// that followed it in the one file there was.
export const enAdminImport = {
  'admin.import.apply_one': 'Add {count} game to the schedule draft',
  'admin.import.apply_other': 'Add {count} games to the schedule draft',
  'admin.import.backToSchedule': 'Back to the schedule',
  'admin.import.clashes_one':
    '{count} clash needs a look in the schedule: a team, court or date is double-booked.',
  'admin.import.clashes_other':
    '{count} clashes need a look in the schedule: a team, court or date is double-booked.',
  'admin.import.col.away': 'Away',
  'admin.import.col.date': 'Date',
  'admin.import.col.home': 'Home',
  'admin.import.col.place': 'Venue and court',
  'admin.import.col.row': 'Row',
  'admin.import.col.score': 'Final score',
  'admin.import.col.time': 'Time',
  'admin.import.columns': 'Columns found: {columns}',
  'admin.import.discard': 'Stop reading and forget the file',
  'admin.import.done.apply': 'The games were added to the schedule draft.',
  'admin.import.done.discard': 'The file was forgotten. Nothing was imported.',
  'admin.import.done.undo': 'The import was undone. Its games are no longer in the draft.',
  'admin.import.done.upload': 'The file was uploaded.',
  'admin.import.draftEmpty': 'The schedule draft is empty: everything is published.',
  'admin.import.draft_one': 'The schedule draft has {count} change that is not published yet.',
  'admin.import.draft_other': 'The schedule draft has {count} changes that are not published yet.',
  'admin.import.error.change-refused':
    'One of the games could not be added to the draft. Nothing was changed.',
  'admin.import.error.changed-since-read':
    'This import changed while you were looking at it. Here is how it stands now.',
  'admin.import.error.draft-changed':
    'The schedule draft was changed after this import, so undo could not be sure what to take out. Remove the games in the schedule instead.',
  'admin.import.error.draft-too-large':
    'The schedule draft would be too large with these games. Publish or split the file first.',
  'admin.import.error.draft-unreadable': 'The schedule draft cannot be read. Nothing was changed.',
  'admin.import.error.file-too-large':
    'The file is too large to import at once. The limit is about {size}, a little less for a file with many rows. Split it into smaller files.',
  'admin.import.error.import-not-found': 'That import is not there.',
  'admin.import.error.invalid-input': 'Something in the form was missing. Try again.',
  'admin.import.error.no-account': 'Sign in again to import fixtures.',
  'admin.import.error.no-file': 'Choose a spreadsheet file to upload first.',
  'admin.import.error.no-season':
    'This league has no current season yet, so there is nowhere to import games.',
  'admin.import.error.not-allowed': 'You are not allowed to import fixtures in this league.',
  'admin.import.error.not-applied': 'Only an import that was added can be undone.',
  'admin.import.error.not-reading': 'This file has already been read.',
  'admin.import.error.not-ready': 'This import cannot be added: it is not a checked file waiting.',
  'admin.import.error.record-unreadable':
    'What this import added cannot be read, so it cannot be undone. Remove its games in the schedule.',
  'admin.import.error.report-unreadable':
    'The report of this import cannot be read. Upload the file again.',
  'admin.import.error.revision-out-of-date':
    'The schedule was published after the draft was started. Open the schedule, then try again.',
  'admin.import.error.season-archived':
    'That season is archived, so it is read-only: nothing can be imported into it, and nothing was changed.',
  'admin.import.error.season-not-found': 'That season is not there any more.',
  'admin.import.error.team-left':
    'A team named in the file has left the league since, so no game is made for it. Undo “Left the league” on the team’s page, or take its games out of the file and upload it again.',
  'admin.import.error.teams-changed':
    'A team named in the file was removed after it was checked. Upload the file again.',
  'admin.import.error.unknown': 'That did not work. Nothing was changed.',
  'admin.import.error.venues-changed':
    'A venue or court named in the file was removed after it was checked. Upload the file again.',
  'admin.import.fileLabel': 'Spreadsheet file (CSV)',
  'admin.import.fileName': 'File: {name}',
  'admin.import.gamesReady_one': '{count} game can be added.',
  'admin.import.gamesReady_other': '{count} games can be added.',
  'admin.import.gamesTitle': 'Games in the file',
  'admin.import.help':
    'Save the spreadsheet as CSV (UTF-8). Give it one row per game with columns for the date, home team and away team, and if you have them the time, venue, court, round, game number and final scores. Team and venue names must match the ones in this season.',
  'admin.import.intro':
    'Add many games at once from a spreadsheet. The games go into the schedule draft, so nothing reaches the public until you publish the schedule.',
  'admin.import.moreGames_one': 'And {count} more game not shown here.',
  'admin.import.moreGames_other': 'And {count} more games not shown here.',
  'admin.import.moreProblems_one': 'And {count} more row with a problem.',
  'admin.import.moreProblems_other': 'And {count} more rows with problems.',
  'admin.import.noFileName': 'File with no name',
  'admin.import.noSeason':
    'This league has no current season yet, so there is nowhere to import games. Set up a season first.',
  'admin.import.none': '–',
  'admin.import.place': '{venue}, {court}',
  'admin.import.problemRow': 'Row {row}: {message}',
  'admin.import.problemsHelp':
    'Fix these rows in the spreadsheet and import them again later if you need them. The other rows can be added now.',
  'admin.import.problemsTitle_one': '{count} row will be left out',
  'admin.import.problemsTitle_other': '{count} rows will be left out',
  'admin.import.reload': 'Reload',
  'admin.import.rowsRead_one': '{count} row read.',
  'admin.import.rowsRead_other': '{count} rows read.',
  'admin.import.score': '{home}–{away}',
  'admin.import.scoresRecorded_one': '{count} final score has been recorded.',
  'admin.import.scoresRecorded_other': '{count} final scores have been recorded.',
  'admin.import.scoresWaiting_one':
    '{count} final score will be recorded once its game is published.',
  'admin.import.scoresWaiting_other':
    '{count} final scores will be recorded once their games are published.',
  'admin.import.scores_one': '{count} of them has a final score.',
  'admin.import.scores_other': '{count} of them have final scores.',
  'admin.import.season': 'Importing into: {season}',
  'admin.import.status.applied': 'These games were added to the schedule draft.',
  'admin.import.status.failed': 'This file could not be used.',
  'admin.import.status.reading':
    'The file is being read. This usually takes a few seconds: reload the page to see the report.',
  'admin.import.status.ready':
    'The file has been checked. Look over the report, then add the games.',
  'admin.import.status.undone': 'This import was undone: its games were taken out of the draft.',
  // The fixture import screen (Admin → Schedule → Import fixtures, P7 §4 "Also", O-4).
  'admin.import.title': 'Import fixtures',
  'admin.import.undo': 'Undo this import',
  'admin.import.undoHelp':
    'Undo takes exactly these games out of the draft again. It works until someone changes or publishes the draft.',
  'admin.import.upload': 'Upload and check',
  'admin.import.uploadAnother': 'Upload a different file',
  'admin.import.warningsTitle': 'Worth a look',
} as const;
