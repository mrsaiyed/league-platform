'use server';
// The schedule grid's server actions, one per button. Each posts from a plain form, so
// the grid works with no script in the page; Next.js refuses a post from another site.
import { performScheduleAction } from './perform-action.ts';

export async function saveGameAction(form: FormData): Promise<void> {
  return performScheduleAction('save-game', form);
}
export async function addGameAction(form: FormData): Promise<void> {
  return performScheduleAction('add-game', form);
}
export async function removeGameAction(form: FormData): Promise<void> {
  return performScheduleAction('remove-game', form);
}
export async function putBackGameAction(form: FormData): Promise<void> {
  return performScheduleAction('put-back-game', form);
}
export async function swapGamesAction(form: FormData): Promise<void> {
  return performScheduleAction('swap-games', form);
}
export async function renameRoundAction(form: FormData): Promise<void> {
  return performScheduleAction('rename-round', form);
}
export async function changeRoundDateAction(form: FormData): Promise<void> {
  return performScheduleAction('change-round-date', form);
}
export async function addRoundAction(form: FormData): Promise<void> {
  return performScheduleAction('add-round', form);
}
export async function removeRoundAction(form: FormData): Promise<void> {
  return performScheduleAction('remove-round', form);
}
export async function publishAction(form: FormData): Promise<void> {
  return performScheduleAction('publish', form);
}
export async function discardAction(form: FormData): Promise<void> {
  return performScheduleAction('discard', form);
}
