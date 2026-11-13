import { t, type TextKey } from '../../server/messages.ts';

/** A page whose address exists and whose screen comes in a later step. */
export function NotBuilt({
  title,
  className,
}: {
  readonly title: TextKey;
  readonly className?: string;
}) {
  return (
    <main className={className}>
      <h1>{t(title)}</h1>
      <p>{t('shell.notBuilt')}</p>
    </main>
  );
}
