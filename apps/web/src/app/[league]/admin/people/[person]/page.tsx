import { PersonPage } from '../../../../../features/people-area/index.ts';

type PersonRouteProps = {
  readonly params: Promise<{ readonly league: string; readonly person: string }>;
};

export default async function Page({ params }: PersonRouteProps) {
  const { league, person } = await params;
  return <PersonPage league={league} personId={person} />;
}
