import { t, type TextKey } from '../../server/messages.ts';

/** A page whose address exists and whose screen comes in a later step. */
export function NotBuilt({ title }: { readonly title: TextKey }) {
  return (
    <main>
      <h1>{t(title)}</h1>
      <p>{t('shell.notBuilt')}</p>
    </main>
  );
}
