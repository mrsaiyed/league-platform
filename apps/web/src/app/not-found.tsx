import { t } from '../server/messages.ts';

export default function NotFound() {
  return (
    <main>
      <h1>{t('common.notFound')}</h1>
    </main>
  );
}
