import type { Metadata } from 'next';
import { UploadCopyPage } from '../../../../../features/tracker/index.ts';
import { t } from '../../../../../server/messages.ts';

export const metadata: Metadata = { title: t('tracker.upload.title') };

type UploadRouteProps = {
  readonly params: Promise<{ readonly league: string; readonly game: string }>;
};

/** The upload of a copy of a game (step 2.70): features/tracker/upload-copy-page.tsx. */
export default async function Page({ params }: UploadRouteProps) {
  const { league, game } = await params;
  return <UploadCopyPage league={league} game={game} />;
}
