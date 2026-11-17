// English interface text (T-187), one part of `en`, which ../en.ts joins:
// Scheduling's refusals and errors.
// Keys in alphabetical order: a new key goes in its place, never at the end (step 2.188).
// A comment above a key is about that key or, from before the split, about the keys
// that followed it in the one file there was.
export const enErrorScheduling = {
  'error.scheduling.add_draft_game.change-refused':
    'That change cannot be made to the schedule as it stands.',
  // Why a schedule draft edit was refused (T-187).
  'error.scheduling.add_draft_game.changed-since-read':
    'Someone else changed the schedule draft since you opened it. Reload it to see their changes.',
  'error.scheduling.add_draft_game.draft-too-large':
    'The schedule draft has grown too large. Publish it or discard it before adding more.',
  'error.scheduling.add_draft_game.draft-unreadable':
    'The saved schedule draft cannot be read. Discard it and start again.',
  'error.scheduling.add_draft_game.revision-out-of-date':
    'The schedule was published since you opened it. Discard this draft and start again from the published schedule.',
  'error.scheduling.add_draft_game.season-not-found': 'That season is not there.',
  'error.scheduling.add_draft_game.unknown-court': 'That court is not at the chosen venue.',
  'error.scheduling.add_draft_game.unknown-team':
    'One of those teams is not a team of this season.',
  'error.scheduling.add_draft_game.unknown-venue': 'That venue is not there.',
  'error.scheduling.add_draft_round.change-refused':
    'That round cannot be added to the schedule as it stands.',
  'error.scheduling.add_draft_round.changed-since-read':
    'Someone else changed the schedule draft since you opened it. Reload it to see their changes.',
  'error.scheduling.add_draft_round.draft-too-large':
    'The schedule draft has grown too large. Publish it or discard it before adding more.',
  'error.scheduling.add_draft_round.draft-unreadable':
    'The saved schedule draft cannot be read. Discard it and start again.',
  'error.scheduling.add_draft_round.revision-out-of-date':
    'The schedule was published since you opened it. Discard this draft and start again from the published schedule.',
  'error.scheduling.add_draft_round.season-not-found': 'That season is not there.',
  'error.scheduling.change_draft_round_date.change-refused':
    'That change cannot be made to the schedule as it stands.',
  'error.scheduling.change_draft_round_date.changed-since-read':
    'Someone else changed the schedule draft since you opened it. Reload it to see their changes.',
  'error.scheduling.change_draft_round_date.draft-too-large':
    'The schedule draft has grown too large. Publish it or discard it before adding more.',
  'error.scheduling.change_draft_round_date.draft-unreadable':
    'The saved schedule draft cannot be read. Discard it and start again.',
  'error.scheduling.change_draft_round_date.revision-out-of-date':
    'The schedule was published since you opened it. Discard this draft and start again from the published schedule.',
  'error.scheduling.change_draft_round_date.season-not-found': 'That season is not there.',
  'error.scheduling.discard_schedule_draft.changed-since-read':
    'Someone else changed the schedule draft since you opened it, so it was not discarded. Reload it to see their changes.',
  'error.scheduling.discard_schedule_draft.draft-not-found':
    'There is no schedule draft to discard.',
  'error.scheduling.discard_schedule_draft.season-not-found': 'That season is not there.',
  'error.scheduling.get_schedule_draft.draft-unreadable':
    'The saved schedule draft cannot be read. Discard it and start again.',
  'error.scheduling.get_schedule_draft.season-not-found': 'That season is not there.',
  'error.scheduling.move_draft_game.change-refused':
    'That change cannot be made to the schedule as it stands.',
  'error.scheduling.move_draft_game.changed-since-read':
    'Someone else changed the schedule draft since you opened it. Reload it to see their changes.',
  'error.scheduling.move_draft_game.draft-too-large':
    'The schedule draft has grown too large. Publish it or discard it before adding more.',
  'error.scheduling.move_draft_game.draft-unreadable':
    'The saved schedule draft cannot be read. Discard it and start again.',
  'error.scheduling.move_draft_game.revision-out-of-date':
    'The schedule was published since you opened it. Discard this draft and start again from the published schedule.',
  'error.scheduling.move_draft_game.season-not-found': 'That season is not there.',
  'error.scheduling.move_draft_game.unknown-court': 'That court is not at the chosen venue.',
  'error.scheduling.move_draft_game.unknown-venue': 'That venue is not there.',
  'error.scheduling.preview_schedule_publish.draft-not-found':
    'There is no schedule draft to publish.',
  'error.scheduling.preview_schedule_publish.draft-unreadable':
    'The saved schedule draft cannot be read. Discard it and start again.',
  'error.scheduling.preview_schedule_publish.season-not-found': 'That season is not there.',
  'error.scheduling.publish_schedule.change-no-longer-fits':
    'Some edits in the draft no longer fit the schedule (a game they name is gone). Fix or discard the draft.',
  'error.scheduling.publish_schedule.changed-since-read':
    'Someone else changed or published the schedule draft since you opened it. Reload it to see the latest.',
  'error.scheduling.publish_schedule.draft-not-found': 'There is no schedule draft to publish.',
  'error.scheduling.publish_schedule.draft-unreadable':
    'The saved schedule draft cannot be read. Discard it and start again.',
  'error.scheduling.publish_schedule.game-already-started':
    'The draft changes a game that is already live or has a final result. Games like that are corrected, not moved or removed.',
  'error.scheduling.publish_schedule.game-cannot-be-removed':
    'The draft removes a game that has been scored, which cannot be removed.',
  'error.scheduling.publish_schedule.game-id-taken':
    'A game the draft adds already exists (it may be in the bin or have no date).',
  'error.scheduling.publish_schedule.game-without-time':
    'A game in the draft has no time yet. Give every added or moved game a time before publishing.',
  'error.scheduling.publish_schedule.nothing-to-publish':
    'The draft changes nothing in the published schedule, so there is nothing to publish.',
  'error.scheduling.publish_schedule.revision-out-of-date':
    'The schedule was published since this draft was started. Discard the draft and start again from the published schedule.',
  'error.scheduling.publish_schedule.round-cannot-be-updated':
    'A round the draft renames or re-dates is no longer in this season. Discard the draft and start again.',
  // Why publishing the schedule, or previewing it, was refused (P7 §4.4, T-187).
  'error.scheduling.publish_schedule.season-not-found': 'That season is not there.',
  'error.scheduling.publish_schedule.unknown-court':
    'A game in the draft names a court that is not at its venue.',
  'error.scheduling.publish_schedule.unknown-team':
    'A game in the draft names a team that is no longer in this season.',
  'error.scheduling.publish_schedule.unknown-venue':
    'A game in the draft names a venue that is no longer there.',
  'error.scheduling.remove_draft_game.change-refused':
    'That change cannot be made to the schedule as it stands.',
  'error.scheduling.remove_draft_game.changed-since-read':
    'Someone else changed the schedule draft since you opened it. Reload it to see their changes.',
  'error.scheduling.remove_draft_game.draft-too-large':
    'The schedule draft has grown too large. Publish it or discard it before adding more.',
  'error.scheduling.remove_draft_game.draft-unreadable':
    'The saved schedule draft cannot be read. Discard it and start again.',
  'error.scheduling.remove_draft_game.revision-out-of-date':
    'The schedule was published since you opened it. Discard this draft and start again from the published schedule.',
  'error.scheduling.remove_draft_game.season-not-found': 'That season is not there.',
  'error.scheduling.remove_draft_round.change-refused':
    'That round cannot be removed from the schedule as it stands.',
  'error.scheduling.remove_draft_round.changed-since-read':
    'Someone else changed the schedule draft since you opened it. Reload it to see their changes.',
  'error.scheduling.remove_draft_round.draft-too-large':
    'The schedule draft has grown too large. Publish it or discard it before adding more.',
  'error.scheduling.remove_draft_round.draft-unreadable':
    'The saved schedule draft cannot be read. Discard it and start again.',
  'error.scheduling.remove_draft_round.revision-out-of-date':
    'The schedule was published since you opened it. Discard this draft and start again from the published schedule.',
  'error.scheduling.remove_draft_round.round-in-use':
    'A game with no date yet is still in this round, so it cannot be removed.',
  'error.scheduling.remove_draft_round.season-not-found': 'That season is not there.',
  'error.scheduling.rename_draft_round.change-refused':
    'That change cannot be made to the schedule as it stands.',
  'error.scheduling.rename_draft_round.changed-since-read':
    'Someone else changed the schedule draft since you opened it. Reload it to see their changes.',
  'error.scheduling.rename_draft_round.draft-too-large':
    'The schedule draft has grown too large. Publish it or discard it before adding more.',
  'error.scheduling.rename_draft_round.draft-unreadable':
    'The saved schedule draft cannot be read. Discard it and start again.',
  'error.scheduling.rename_draft_round.revision-out-of-date':
    'The schedule was published since you opened it. Discard this draft and start again from the published schedule.',
  'error.scheduling.rename_draft_round.season-not-found': 'That season is not there.',
  'error.scheduling.set_draft_recording.change-refused':
    'That change cannot be made to the schedule as it stands.',
  'error.scheduling.set_draft_recording.changed-since-read':
    'Someone else changed the schedule draft since you opened it. Reload it to see their changes.',
  'error.scheduling.set_draft_recording.draft-too-large':
    'The schedule draft has grown too large. Publish it or discard it before adding more.',
  'error.scheduling.set_draft_recording.draft-unreadable':
    'The saved schedule draft cannot be read. Discard it and start again.',
  'error.scheduling.set_draft_recording.revision-out-of-date':
    'The schedule was published since you opened it. Discard this draft and start again from the published schedule.',
  'error.scheduling.set_draft_recording.season-not-found': 'That season is not there.',
  'error.scheduling.swap_draft_games.change-refused':
    'That change cannot be made to the schedule as it stands.',
  'error.scheduling.swap_draft_games.changed-since-read':
    'Someone else changed the schedule draft since you opened it. Reload it to see their changes.',
  'error.scheduling.swap_draft_games.draft-too-large':
    'The schedule draft has grown too large. Publish it or discard it before adding more.',
  'error.scheduling.swap_draft_games.draft-unreadable':
    'The saved schedule draft cannot be read. Discard it and start again.',
  'error.scheduling.swap_draft_games.revision-out-of-date':
    'The schedule was published since you opened it. Discard this draft and start again from the published schedule.',
  'error.scheduling.swap_draft_games.season-not-found': 'That season is not there.',
} as const;
