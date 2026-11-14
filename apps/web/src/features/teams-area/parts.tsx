// The pieces both Teams screens are made of (step 2.51). Words come from the message
// files (T-187). Every form carries the route's league only so the server can find the
// page again; who is acting comes from the session (run-teams-action.ts).
import { statsVisibilityChoices, type TeamRecord } from '@srleagues/core';
import type { ReactNode } from 'react';
import type { AdminDivision } from '../../server/admin-teams.ts';
import { t, type TextKey } from '../../server/messages.ts';
import { doneKey, problemKey } from './answer.ts';

/** What Next.js gives a page: the address's query. */
export type SearchProps = {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
};

/** What went well or why a change was refused, from the address. */
export function Notice({
  query,
}: {
  readonly query: Readonly<Record<string, string | string[] | undefined>>;
}) {
  const problem = problemKey(query);
  const good = doneKey(query);
  if (problem !== undefined) return <p role="alert">{t(problem)}</p>;
  if (good !== undefined) return <p role="status">{t(good)}</p>;
  return null;
}

export function LeagueField({ league }: { readonly league: string }) {
  return <input type="hidden" name="league" value={league} />;
}

export function TextField({
  name,
  label,
  defaultValue,
  required = false,
  hint,
  maxLength,
}: {
  readonly name: string;
  readonly label: string;
  readonly defaultValue?: string;
  readonly required?: boolean;
  readonly hint?: string;
  readonly maxLength?: number;
}) {
  return (
    <p>
      <label>
        {label}
        <input
          name={name}
          type="text"
          defaultValue={defaultValue}
          required={required}
          maxLength={maxLength}
          autoComplete="off"
        />
      </label>
      {hint === undefined ? null : <small> {hint}</small>}
    </p>
  );
}

/** A color and the choice to use the league's own: the box is checked when there is no color. */
export function ColorFields({ color }: { readonly color: string | null }) {
  return (
    <p>
      <label>
        {t('adminTeams.field.color')}
        <input name="color" type="color" defaultValue={color ?? '#1f5fbf'} />
      </label>{' '}
      <label>
        <input name="useOwnColors" type="checkbox" defaultChecked={color === null} />{' '}
        {t('adminTeams.field.useOwnColors')}
      </label>
    </p>
  );
}

export function DivisionField({
  divisions,
  value,
}: {
  readonly divisions: readonly AdminDivision[];
  readonly value: string | null;
}) {
  return (
    <p>
      <label>
        {t('adminTeams.field.division')}
        <select name="divisionId" defaultValue={value ?? ''}>
          <option value="">{t('adminTeams.noDivision')}</option>
          {divisions.map((division) => (
            <option key={division.id} value={division.id}>
              {division.name}
            </option>
          ))}
        </select>
      </label>
    </p>
  );
}

/** Who sees a team's numbers (S-22): the choices a league can make today. */
export function StatsVisibilityField({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <p>
      <label>
        {label}
        <select name="statsVisibility" defaultValue={value}>
          {statsVisibilityChoices.map((choice) => (
            <option key={choice} value={choice}>
              {t(`adminTeams.stats.${choice}` as TextKey)}
            </option>
          ))}
        </select>
      </label>
    </p>
  );
}

/** A small swatch of the team's color; the name beside it says everything, so it is hidden from readers. */
export function Swatch({ team }: { readonly team: TeamRecord }) {
  if (team.color === null) return null;
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: '0.9em',
        height: '0.9em',
        marginInlineEnd: '0.4em',
        background: team.color,
        border: '1px solid currentColor',
      }}
    />
  );
}

export function Section({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  );
}
