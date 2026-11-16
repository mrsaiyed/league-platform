// The pieces both Teams screens are made of (step 2.51). Words come from the message
// files (T-187). Every form carries the route's league only so the server can find the
// page again; who is acting comes from the session (run-teams-action.ts).
import { statsVisibilityChoices, type TeamRecord } from '@srleagues/core';
import { Emblem } from '@srleagues/ui';
import type { ReactNode } from 'react';
import type { AdminDivision } from '../../server/admin-teams.ts';
import { t, type TextKey } from '../../server/messages.ts';
import { doneKey, problemKey } from './answer.ts';

/** What Next.js gives a page: the address's query. */
export type SearchProps = {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
};

/**
 * What went well or why a change was refused, from the address. A refusal said beside
 * the field it is about, or what went well said on its own roster line (`saidBeside`), is
 * not said again here.
 */
export function Notice({
  query,
  saidBeside = false,
}: {
  readonly query: Readonly<Record<string, string | string[] | undefined>>;
  readonly saidBeside?: boolean;
}) {
  const problem = problemKey(query);
  const good = doneKey(query);
  if (saidBeside) return null;
  // One notice, in kinds told apart at a glance (step 2.103): refused; saved; or removed.
  if (problem !== undefined) {
    return (
      <p className="ui-notice" data-kind="error" role="alert">
        {t(problem)}
      </p>
    );
  }
  if (good !== undefined) {
    return (
      <p
        className="ui-notice"
        data-kind={/removed$/i.test(good) ? 'removed' : 'saved'}
        role="status"
      >
        {t(good)}
      </p>
    );
  }
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
  // The label above its field, the hint quiet beneath (the staff area's field, step 2.103).
  return (
    <p className="admin-field-group">
      <label className="staff-field">
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
      {hint === undefined ? null : <small className="ui-field-help"> {hint}</small>}
    </p>
  );
}

/** A color and the choice to use the league's own: the box is checked when there is no color. */
export function ColorFields({ color }: { readonly color: string | null }) {
  return (
    <p className="admin-color-fields">
      <label className="staff-field">
        {t('adminTeams.field.color')}
        <input name="color" type="color" defaultValue={color ?? '#1f5fbf'} />
      </label>{' '}
      <label className="staff-check">
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
      <label className="staff-field">
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
      <label className="staff-field">
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

/**
 * The team's mark: its shield with its initial, in the team's own color (the league's
 * accent for a team with none). The name beside it says everything, so the shield is
 * hidden from readers. A colored square stood here before step 2.103.
 */
export function Swatch({
  team,
  size = 'card',
}: {
  readonly team: TeamRecord;
  readonly size?: 'small' | 'card';
}) {
  return <Emblem name={team.name} color={team.color} size={size} />;
}

/** A part of a Teams screen: a panel with its title (the staff area's panel, step 2.103). */
export function Section({
  title,
  id,
  kind,
  children,
}: {
  readonly title: string;
  /** The part's own place on the page, for a button at the top that leads to it. */
  readonly id?: string;
  /** A part that takes something away is edged as one, apart from the rest. */
  readonly kind?: 'danger';
  readonly children: ReactNode;
}) {
  return (
    <section id={id} className="staff-panel admin-team-part" data-kind={kind}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}
