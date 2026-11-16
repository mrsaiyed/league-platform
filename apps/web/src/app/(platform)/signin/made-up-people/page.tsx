import { leagueUrl, platformUrl, type LeagueMembership } from '@srleagues/core';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { membershipsInWords, StandalonePage } from '../../../../features/shell/index.ts';
import type { MadeUpPlace } from '../../../../server/local-tools.ts';
import { localTools } from '../../../../server/local-only.ts';
import { t } from '../../../../server/messages.ts';
import { beMadeUpPersonAction } from '../../../../server/sign-in/local-actions.ts';

// "Be this made-up person" (step 2.96): LOCAL WORK AND TESTS ONLY. In staging and
// production the page and its form's action answer "not found", as an address that does
// not exist (local-only.ts decides, from the app's own settings). It lists the made-up
// people, with what they are in which league, and signs this browser in as the one chosen
// through the ordinary sign-in on the sign-in stand-in (be-made-up-person.ts). Linked from
// no page a visitor sees; run-it-locally.md says where it is.
export default async function Page() {
  // The cookies first: this makes the page drawn per request, never at build time.
  await cookies();
  const tools = await localTools();
  if (tools === undefined) notFound();
  const people = await tools.madeUpPeople();
  return (
    <StandalonePage>
      <main className="ui-message made-up-people">
        <h1>{t('standIn.madeUpPeople.title')}</h1>
        <p>{t('standIn.madeUpPeople.intro')}</p>
        <ul>
          {people.map((person) => (
            <li key={person.key} data-made-up-person={person.email}>
              <h2 dir="auto">{person.name}</h2>
              <p>{person.email}</p>
              {person.places.length === 0 ? (
                <p>{t('standIn.madeUpPeople.none')}</p>
              ) : (
                <ul>
                  {person.places.map((place) => (
                    <li key={place.slug} dir="auto">
                      {place.name}: {membershipsInWords(place.memberships)}
                    </li>
                  ))}
                </ul>
              )}
              <BeForm
                person={person.key}
                next={platformUrl('home')}
                words={t('standIn.madeUpPeople.be', { name: person.name })}
              />
              {person.places.map((place) => (
                <BeForm
                  key={place.slug}
                  person={person.key}
                  next={placeToOpen(place)}
                  words={t('standIn.madeUpPeople.open', { league: place.name, name: person.name })}
                />
              ))}
            </li>
          ))}
        </ul>
        <p>
          <a href={platformUrl('keptEmails')}>{t('standIn.keptEmails.title')}</a>
        </p>
      </main>
    </StandalonePage>
  );
}

function BeForm({
  person,
  next,
  words,
}: {
  readonly person: string;
  readonly next: string;
  readonly words: string;
}) {
  return (
    <form action={beMadeUpPersonAction}>
      <input type="hidden" name="person" value={person} />
      <input type="hidden" name="next" value={next} />
      <button type="submit">{words}</button>
    </form>
  );
}

/** Who only coaches or plays opens the league's home; anyone else its admin. */
const homeOnly: readonly LeagueMembership[] = ['coach', 'captain', 'on-a-team'];

function placeToOpen(place: MadeUpPlace): string {
  const league = { slug: place.slug };
  return place.memberships.every((m) => homeOnly.includes(m))
    ? leagueUrl(league, 'home')
    : leagueUrl(league, 'admin');
}
