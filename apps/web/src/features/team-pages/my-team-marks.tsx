'use client';
// The "your team" marks of a league's public pages (step 2.168; U-5, T-95), drawn on this
// device only once the page's one private read has answered (my-team-read.ts). The page as
// it arrives holds no trace of them, so it is the same for everyone. With scripts off there
// are none, and the account menu's "My team" is the way to the team.
import { Emblem } from '@srleagues/ui';
import { useEffect, useState, type ReactNode } from 'react';
import {
  offersDeviceChoice,
  pageMyTeam,
  yoursLine,
  type MyTeamHeard,
  type SharedMyTeam,
} from './my-team-read.ts';

/**
 * What the read said for this page's address: undefined until it answers, null when it
 * failed.
 */
export function useMyTeam(
  address: string,
  shared: SharedMyTeam = pageMyTeam,
): MyTeamHeard | undefined {
  const [reply, setReply] = useState<MyTeamHeard | undefined>(undefined);
  useEffect(() => shared.ask(address, setReply), [address, shared]);
  return reply;
}

/**
 * Under a team's title. To a signed-in member on their own team's page, of the current season: "This is your team.",
 * with "The league opens here for you." where the league opens on it for them. To a member
 * with a team here, no "Make this my team" on any team's page: their own team is where the
 * league opens for them whatever this device chose. To everyone else, the page as it came
 * (`children`: the device's choice, where the league offers it), once the read has answered
 * or failed. Until then the choice is in the page but not shown where scripts run
 * (`.team-mine-wait`), so a coach never sees it flash on their own team's page; with
 * scripts off it is shown as it always was.
 */
export function TeamMine({
  address,
  slug,
  isCurrent,
  children,
}: {
  /** The read's address (leagueApiUrl). */
  readonly address: string;
  readonly slug: string;
  /** Whether the page is of the current season: only there is a team said to be theirs. */
  readonly isCurrent: boolean;
  readonly children?: ReactNode;
}) {
  const shows = teamMineShows(useMyTeam(address), slug, isCurrent);
  if (shows === 'waiting') return <div className="team-mine-wait">{children}</div>;
  if (shows === 'choice') return children;
  if (shows === 'nothing') return null;
  return (
    <div className="team-mine" data-yours="">
      <p>{shows.line}</p>
    </div>
  );
}

/**
 * What TeamMine draws for what the read said (undefined while it has not answered, null
 * when it failed): the member's line, the device's choice, the choice kept unseen while
 * the read is out ('waiting'), or nothing.
 */
export function teamMineShows(
  reply: MyTeamHeard | undefined,
  slug: string,
  isCurrent: boolean,
): 'waiting' | 'choice' | 'nothing' | { readonly line: string } {
  if (reply === undefined) return 'waiting';
  const line = reply === null ? null : yoursLine(reply, slug, isCurrent);
  if (line !== null) return { line };
  return offersDeviceChoice(reply) ? 'choice' : 'nothing';
}

/** On a team's card in the Teams list: "Your team", on the person's own or the chosen one. */
export function TeamMark({ address, slug }: { readonly address: string; readonly slug: string }) {
  const reply = useMyTeam(address);
  if (reply?.words === undefined || !reply.marked.some((team) => team.slug === slug)) {
    return null;
  }
  return (
    <p data-your-team="">
      <span className="ui-badge">{reply.words.mark}</span>
    </p>
  );
}

/** On the league home, at the top of its column: "Your team" and the way to it, one tap. */
export function YourTeamLine({ address }: { readonly address: string }) {
  const reply = useMyTeam(address);
  if (reply?.words === undefined || reply.marked.length === 0) return null;
  const { mark } = reply.words;
  return (
    <div className="team-mine" data-your-team="">
      <span className="ui-badge">{mark}</span>
      {reply.marked.map((team) => (
        <a key={team.slug} className="team-mine-way" href={team.href} dir="auto">
          <Emblem name={team.name} color={team.color} />
          <span>{team.name}</span>
        </a>
      ))}
    </div>
  );
}
