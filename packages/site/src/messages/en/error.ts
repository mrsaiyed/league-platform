// English interface text (T-187), one part of `en`, which ../en.ts joins:
// The refusals and errors of every area but scheduling.
// Keys in alphabetical order: a new key goes in its place, never at the end (step 2.188).
// A comment above a key is about that key or, from before the split, about the keys
// that followed it in the one file there was.
export const enError = {
  'error.changed-since-read':
    'Someone else changed this while you were looking. The page now shows the latest; try again.',
  'error.games.assign_scorekeeper.already-assigned':
    'That person is already assigned to this game.',
  'error.games.assign_scorekeeper.cannot-score-game':
    'That person cannot score this game. Give them the scorekeeper role first.',
  'error.games.assign_scorekeeper.game-closed':
    'That game is already decided or cancelled, so there is nothing left to score.',
  // Why assigning a scorekeeper was refused (T-187).
  'error.games.assign_scorekeeper.game-not-found': 'That game is not there.',
  'error.games.open_scoring_session.game-closed':
    'That game is already decided or cancelled. Reopen it first to correct it.',
  // Why opening a game to score was refused (T6 §5, T-187).
  'error.games.open_scoring_session.game-not-found': 'That game is not there.',
  'error.games.release_scoring_session.game-not-found': 'That game is not there.',
  'error.games.renew_scoring_session.game-closed':
    'That game is now decided or cancelled, so scoring it has stopped.',
  'error.games.renew_scoring_session.game-not-found': 'That game is not there.',
  'error.games.reopen_tracked_game.changed-since-read':
    'This game changed since your device last read it. Open the game again, then reopen it if it still needs it.',
  'error.games.reopen_tracked_game.game-not-decided':
    'This game is not over, so there is nothing to reopen.',
  // Why the scorekeeper's reopening of a game they ended was refused (step 2.120, S-36).
  // The tracker shows them by the code its endpoint answers.
  'error.games.reopen_tracked_game.game-not-found': 'That game is not there.',
  'error.games.reopen_tracked_game.not-allowed':
    'You cannot score this game, so you cannot reopen it. A league admin can reopen it.',
  'error.games.reopen_tracked_game.not-ended-by-tracker':
    'This game was not ended from the tracker, so it cannot be reopened here. A league admin can reopen it from the games area.',
  'error.games.reopen_tracked_game.not-ended-by-you':
    '{name} ended this game, so only they can reopen it here. A league admin can reopen it.',
  // When the server knows no account for the end (a game brought over from elsewhere).
  'error.games.reopen_tracked_game.not-ended-by-you.unknown':
    'Only the scorekeeper who ended this game can reopen it here. A league admin can reopen it.',
  'error.games.reopen_tracked_game.reason-needed':
    'Say in a few words why the game is being reopened (up to 1000 characters). It is kept in the game’s corrections, never shown publicly.',
  'error.games.reopen_tracked_game.reopen-time-over':
    'It is too long since this game ended for a scorekeeper to reopen it. A league admin can reopen it.',
  'error.games.reopen_tracked_game.result-overturned':
    'This result was overturned. Take the overturn off in Standings and stats first.',
  'error.games.reopen_tracked_game.scorekeepers-may-not-reopen':
    'This league does not let scorekeepers reopen a game. A league admin can reopen it.',
  'error.games.reopen_tracked_game.season-archived':
    'This game’s season is archived, so it is read-only and the game was not reopened. A league admin can still correct its result, with a reason.',
  'error.games.take_over_scoring.game-closed':
    'That game is already decided or cancelled. Reopen it first to correct it.',
  'error.games.take_over_scoring.game-not-found': 'That game is not there.',
  'error.games.unassign_scorekeeper.game-not-found': 'That game is not there.',
  'error.games.unassign_scorekeeper.not-assigned': 'That person is not assigned to this game.',
  'error.imports.apply_fixture_import.change-refused':
    'One of the games in the file cannot be added to the schedule as it stands.',
  'error.imports.apply_fixture_import.changed-since-read':
    'Someone else changed this import since you opened it. Reload it to see where it stands.',
  'error.imports.apply_fixture_import.draft-changed':
    'The schedule draft changed while the games were being added. Try again.',
  'error.imports.apply_fixture_import.draft-too-large':
    'These games do not fit in the schedule draft. Publish or discard the draft first, or split the file into smaller files.',
  'error.imports.apply_fixture_import.draft-unreadable':
    'The saved schedule draft cannot be read. Discard it and start again.',
  'error.imports.apply_fixture_import.import-not-found': 'That import is not there.',
  'error.imports.apply_fixture_import.not-ready':
    'This import is not ready to apply. It is either still being read, was refused, or has already been applied.',
  'error.imports.apply_fixture_import.report-unreadable':
    'The saved report of this import cannot be read. Upload the file again.',
  'error.imports.apply_fixture_import.revision-out-of-date':
    'The schedule was published since the import was previewed. Discard the draft or start the import again from the published schedule.',
  // Why a fixtures import was refused (T-187).
  'error.imports.apply_fixture_import.season-not-found': 'That season is not there.',
  'error.imports.apply_fixture_import.team-left':
    'A team named in the file has left the league since, so no game is made for it. Undo “Left the league” on the team’s page, or take its games out of the file and upload it again.',
  'error.imports.apply_fixture_import.teams-changed':
    'A team named in the file has since been removed from this season. Upload the file again.',
  'error.imports.apply_fixture_import.venues-changed':
    'A venue or court named in the file has since been removed. Upload the file again.',
  'error.imports.discard_fixture_import.import-not-found': 'That import is not there.',
  'error.imports.discard_fixture_import.not-reading':
    'This import is not waiting to be read, so there is nothing to discard.',
  'error.imports.get_fixture_import.import-not-found': 'That import is not there.',
  'error.imports.record_imported_scores.changed-since-read':
    'Someone else changed this import since you opened it. Reload it to see where it stands.',
  'error.imports.record_imported_scores.import-not-found': 'That import is not there.',
  'error.imports.record_imported_scores.not-applied':
    'Scores can be recorded only for an import that has been applied.',
  'error.imports.record_imported_scores.record-unreadable':
    'The record of what this import added cannot be read.',
  'error.imports.start_fixture_import.file-too-large':
    'The file is too large to import in one go. Split it into smaller files.',
  'error.imports.start_fixture_import.no-account': 'You need to be signed in to import a file.',
  'error.imports.start_fixture_import.season-not-found': 'That season is not there.',
  'error.imports.undo_fixture_import.changed-since-read':
    'Someone else changed this import since you opened it. Reload it to see where it stands.',
  'error.imports.undo_fixture_import.draft-changed':
    'The schedule draft was edited, published or discarded after this import, so it cannot be undone automatically. Remove its games by hand.',
  'error.imports.undo_fixture_import.import-not-found': 'That import is not there.',
  'error.imports.undo_fixture_import.not-applied':
    'This import has not been applied, or has already been undone.',
  'error.imports.undo_fixture_import.record-unreadable':
    'The record of what this import added cannot be read, so it cannot be undone automatically.',
  // Why a teams or people change was refused (T-187): `error.`, the command's name, the code.
  'error.invalid-input': 'Something you entered is not valid. Check the fields and try again.',
  'error.leagues.clear_setting.changed-since-read':
    'Someone else changed this setting while you were looking, so it was not put back to the default. The page now shows the latest value.',
  'error.leagues.clear_setting.unknown-setting': 'That setting does not exist.',
  'error.leagues.rename_short_name.short-name-blocked':
    'That short name cannot be used. Choose another.',
  'error.leagues.rename_short_name.short-name-taken':
    'Another league already has that short name, or keeps it for forwarding. Choose another.',
  'error.leagues.restore_division.division-name-taken':
    'Another division of the season now has this name. Rename one of them in Divisions, then bring this one back.',
  'error.leagues.restore_division.division-parent-in-bin':
    'The division it sits in is in the bin. Bring that division back first.',
  'error.leagues.restore_game.game-not-found': 'That game is not there.',
  'error.leagues.restore_game.game-not-restorable':
    'A game that was played cannot be restored. Correct it instead.',
  'error.leagues.restore_game.game-number-taken':
    'Another game of the season now has this game number. Give that game another number in Schedule, then bring this one back.',
  'error.leagues.restore_game.game-part-in-bin':
    'A team, division, venue or court of this game is in the bin, so this game cannot come back yet. Bring that back first, from the bin in League settings.',
  'error.leagues.restore_game.game-reference-taken':
    'Another game now has this outside reference. Change that game’s reference in Schedule, then bring this one back.',
  'error.leagues.restore_game.revision-out-of-date':
    'Someone published this season’s schedule at the same moment. Try again.',
  'error.leagues.restore_person.person-not-found': 'That person is not there.',
  'error.leagues.restore_person.person-profile-taken':
    'The account of this person is now linked to someone else in this league. Bring them back once that person is taken off the league list, or add them again as someone new in People.',
  'error.leagues.restore_team.team-division-in-bin':
    'The division of this team is in the bin. Bring the division back first.',
  'error.leagues.restore_team.team-lineage-taken':
    'This season already has a team that carries on this team from other seasons. Move that team to the bin first, then try again.',
  'error.leagues.restore_team.team-name-taken':
    'Another team of the season now has this name. Rename that team on its page in Teams, then bring this one back.',
  'error.leagues.restore_team.team-not-found': 'That team is not there.',
  'error.leagues.restore_team.team-short-name-taken':
    'Another team of the season now has this short name. Change that team’s short name on its page in Teams, then bring this one back.',
  'error.leagues.set_audience.confirmation-needed':
    'Tick the confirmation to show more people as adults, then save again.',
  // Why a season's roster settings were refused (T-187): `error.`, the command's name,
  // the code, and the setting at fault when there is one.
  'error.leagues.set_season_roster_settings.invalid-rules': 'These roster settings are not valid.',
  'error.leagues.set_season_roster_settings.invalid-rules.locksOn':
    'The day rosters lock is not a valid date.',
  'error.leagues.set_season_roster_settings.invalid-rules.maxSize':
    'The largest roster is not a valid number, or is smaller than the smallest.',
  'error.leagues.set_season_roster_settings.invalid-rules.minSize':
    'The smallest roster is not a valid number.',
  'error.leagues.set_setting.changed-since-read':
    'Someone else changed this setting while you were looking, so yours was not saved. The page now shows the latest value; change it again if you still want to.',
  'error.leagues.set_setting.confirmation-needed':
    'This choice needs you to tick the box to confirm before it is saved. Nothing was changed.',
  'error.leagues.set_setting.invalid-value':
    'That value is not allowed for this setting. Check what it accepts and try again.',
  'error.leagues.set_setting.no-child-recorded':
    'This league is for adults and no one in it is recorded as a child, so there is nothing to confirm yet. Nothing was changed. You can confirm once the league is for children or has a child recorded.',
  'error.leagues.set_setting.unknown-setting': 'That setting does not exist.',
  'error.leagues.set_status.illegal-transition':
    'The league cannot be changed that way from where it is now.',
  // Publishing waits for P3's "Must fix" list (step 2.240): each item says where it is put right.
  'error.leagues.set_status.no-contact-email':
    'The league has no contact email yet, so it cannot be published. Ask the people who run SR Leagues, who made the league, to add it.',
  'error.leagues.set_status.privacy-not-chosen':
    'Choose how young players\' names show first: save "Names on public pages" under Privacy, then publish.',
  'error.leagues.start_season.game-rule-refused':
    'The mercy rule needs a stop clock and a lead from 1 to 100 points. Choose a stop clock or leave the mercy rule empty; nothing was changed.',
  'error.leagues.start_season.program-not-found':
    'There is nowhere to start this season in this league. Nothing was changed.',
  'error.leagues.start_season.season-slug-taken':
    'Another season already uses that short name. Choose another; nothing was changed.',
  'error.leagues.update_season.season-not-found': 'That season is not there.',
  'error.not-allowed': 'You are not allowed to do that.',
  'error.not-confirmed': 'Tick the box to confirm first. Nothing was changed.',
  // Step 2.157: someone whose role may not add a person to the league (a club admin).
  'error.people.create_person.not-allowed':
    "Your role in this league does not include adding people to its list. If it should, ask the league's owner or an admin.",
  'error.people.create_person.sensitive-fields-not-allowed':
    'You are not allowed to enter those details.',
  'error.people.get_person.person-not-found': 'That person is not in the league list.',
  'error.people.remove_person.person-not-found': 'That person is not in the league list.',
  'error.people.remove_person.person-on-a-roster':
    'That person is still on a roster. Mark them as having left their team first, then take them off the list.',
  'error.people.set_name_request.initials-not-offered':
    'This league does not offer initials for adults, so nothing was changed. You can still choose "removed" to take their name off the public pages.',
  'error.people.set_name_request.person-not-found': 'That person is not in the league list.',
  'error.people.update_person.changed-since-read':
    'Someone else changed this person’s details while you were looking. What you typed is still here; check it against theirs and save again.',
  'error.people.update_person.person-not-found': 'That person is not in the league list.',
  'error.people.update_person.sensitive-fields-not-allowed':
    'You are not allowed to change those details.',
  'error.scheduling.restore_court.court-name-taken':
    'Another court of the venue now has this name. Rename one of them in Venues, then bring this one back.',
  'error.scheduling.restore_court.court-venue-in-bin':
    'Its venue is in the bin. Bring the venue back first.',
  'error.scheduling.restore_venue.venue-name-taken':
    'Another venue now has this name. Rename one of them in Venues, then bring this one back.',
  'error.season-archived':
    'That season is archived, so it is read-only and nothing was changed. Only a correction with a reason changes one of its games.',
  'error.season-hidden':
    'That season is hidden from visitors, so it was not archived: an archived season is shown to visitors and cannot be hidden again. Show it to visitors first, or leave it hidden.',
  'error.short-name-needed':
    'A short name could not be made from this name. Type a short name: lower-case letters and numbers, with single hyphens.',
  'error.teams.add_new_person.already-on-team':
    'That person is already on this team, so the new person was not kept in the league list.',
  'error.teams.add_new_person.invalid-input':
    'The role or number is not valid, so nobody was added.',
  'error.teams.add_new_person.jersey-taken':
    'Another player on this team already wears that number, so the new person was not kept in the league list.',
  'error.teams.add_new_person.not-allowed': 'You are not allowed to do that.',
  'error.teams.add_new_person.not-undone':
    'The person could not be put on the roster, and could not be taken off the league list again either, so they are still in the league list. Remove them there if they should not be.',
  'error.teams.add_new_person.team-not-found': 'That team is not there, so nobody was added.',
  'error.teams.add_to_roster.already-on-team': 'That person is already on this team.',
  'error.teams.add_to_roster.jersey-taken':
    'Another player on this team already wears that number. This season asks for a different number for each player.',
  'error.teams.add_to_roster.person-not-found': 'That person is not in the league list.',
  // Why a roster change was refused (T-187).
  'error.teams.add_to_roster.team-not-found': 'That team is not there.',
  'error.teams.change_roster_entry.already-left':
    'This person has left the team, so their entry can no longer be changed.',
  'error.teams.change_roster_entry.jersey-taken':
    'Another player on this team already wears that number. This season asks for a different number for each player.',
  'error.teams.change_roster_entry.roster-entry-not-found': 'That roster entry is not there.',
  'error.teams.create_team.division-not-found': 'That division is not there.',
  'error.teams.create_team.season-not-found': 'That season is not there.',
  'error.teams.create_team.team-name-taken': 'Another team of this season already has that name.',
  'error.teams.create_team.team-short-name-taken':
    'Another team of this season already has that short name.',
  'error.teams.list_roster.team-not-found': 'That team is not there.',
  'error.teams.mark_left.already-left': 'This person is already marked as having left.',
  'error.teams.mark_left.left-after-today':
    'The leaving date is after today. Choose today or a day before: nobody was marked as left.',
  'error.teams.mark_left.left-before-joined': 'The leaving date is before the day they joined.',
  'error.teams.mark_left.roster-entry-not-found': 'That roster entry is not there.',
  'error.teams.put_back_on_roster.already-on-team':
    'This person is on the team again already, so they were not put back a second time.',
  'error.teams.put_back_on_roster.jersey-taken':
    'This player could not be put back, even with no number: the roster refused it. Nothing was changed; reload the page and try again.',
  'error.teams.put_back_on_roster.not-left':
    'This person is already on the roster, so there was nothing to put back.',
  'error.teams.put_back_on_roster.person-not-found':
    'This person has been taken off the league list, so they cannot be put back on the roster.',
  'error.teams.put_back_on_roster.roster-entry-not-found': 'That roster entry is not there.',
  // A-17: the team's own page says what is true now instead (adminTeams.remove.cannot, notYet).
  'error.teams.remove_team.team-has-games-to-play':
    'This team still has games without a result. Remove them from the schedule, or cancel them, first. Do not record them as forfeited: a forfeit is a result, and a team with a result cannot be removed.',
  'error.teams.remove_team.team-has-results':
    'This team cannot be removed this season: its results are part of other teams’ records.',
  'error.teams.remove_team.team-not-found': 'That team is not there.',
  'error.teams.reorder_roster.roster-entry-not-found':
    'Someone on that list is not on this roster.',
  'error.teams.reorder_roster.roster-incomplete':
    'The roster changed while you were looking. The page now shows the latest; try again.',
  'error.teams.reorder_roster.team-not-found': 'That team is not there.',
  'error.teams.set_stats_visibility.team-not-found': 'That team is not there.',
  'error.teams.set_stats_visibility.teams-may-not-choose':
    'This league decides who sees the numbers; teams may not choose.',
  'error.teams.update_team.changed-since-read':
    'Someone else changed this team since you opened this page, so it was not saved. What you typed is kept, and beside each box that differs is what is saved now. Save again to replace it with yours.',
  'error.teams.update_team.division-not-found': 'That division is not there.',
  'error.teams.update_team.team-name-taken': 'Another team of this season already has that name.',
  'error.teams.update_team.team-not-found': 'That team is not there.',
  'error.teams.update_team.team-short-name-taken':
    'Another team of this season already has that short name.',
  'error.unknown': 'That could not be done.',
} as const;
