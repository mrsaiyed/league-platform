// The words of a person's form, from the message files (T-187), handed to the form,
// which is drawn in the browser too.
import { t } from '../../server/messages.ts';
import type { PersonFormWords } from './person-form.tsx';

export function personFormWords(submit: string): PersonFormWords {
  return {
    firstName: t('adminPeople.field.firstName'),
    lastName: t('adminPeople.field.lastName'),
    privateTitle: t('adminPeople.private.title'),
    privateBody: t('adminPeople.private.body'),
    email: t('adminPeople.field.email'),
    emailHelp: t('adminPeople.field.emailHelp'),
    birthDate: t('adminPeople.field.birthDate'),
    birthDateHelp: t('adminPeople.field.birthDateHelp'),
    child: t('adminPeople.field.child'),
    childHelp: t('adminPeople.field.childHelp'),
    childChoices: {
      '': t('adminPeople.field.child.unknown'),
      child: t('adminPeople.field.child.child'),
      adult: t('adminPeople.field.child.adult'),
    },
    wrong: {
      firstName: t('adminPeople.wrong.firstName'),
      lastName: t('adminPeople.wrong.lastName'),
      contactEmail: t('adminPeople.wrong.contactEmail'),
      birthDate: t('adminPeople.wrong.birthDate'),
      child: t('error.invalid-input'),
    },
    submit,
  };
}

/** Today's date, the latest date of birth the commands take (person-fields.ts reads it so). */
export const todayForBirthDates = (): string => new Date().toISOString().slice(0, 10);
