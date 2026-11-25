/** The place on the page the Profile part is, for links that cure a "Must fix" item. */
export const profilePlace = 'settings-profile';

/** A setting's own place on League settings (step 2.155 part 4), where the browser lands. */
export const settingPlace = (key: string): string => `setting-${key.replaceAll('.', '-')}`;
