// Names said in one sentence, in the language's own way ("Falcons, Herons and Owls"): the
// joining words are the locale's (Intl.ListFormat), never typed here (T-187).
import { locale } from '../../server/messages.ts';

export function namesList(names: readonly string[]): string {
  return new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(names);
}
