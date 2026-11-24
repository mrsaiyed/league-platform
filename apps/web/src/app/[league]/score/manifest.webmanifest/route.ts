// The tracker's web app manifest (step 2.38, T-115): features/tracker/tracker-install.ts.
import { trackerManifestAnswer } from '../../../../features/tracker/index.ts';

type ManifestRouteProps = { readonly params: Promise<{ readonly league: string }> };

export async function GET(request: Request, { params }: ManifestRouteProps): Promise<Response> {
  const { league } = await params;
  return trackerManifestAnswer(league, new URL(request.url).searchParams.get('game'));
}
