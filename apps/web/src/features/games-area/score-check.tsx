'use client';
// The box score grid's warning, shown as the admin types, when a team score differs
// from the total of its players' points (S-26). It never stops the save: the score
// typed is the one saved. Words come from the server, from the message files (T-187).
import { useEffect, useRef, useState } from 'react';
import type { BoxScoreFields } from './box-score-form.ts';
import { scoreMismatch, type ScoreCheckTeam } from './score-mismatch.ts';

export type ScoreCheckProps = {
  /** Each team, with its warning sentence holding {score} and {points}. */
  readonly teams: readonly (ScoreCheckTeam & { readonly warning: string })[];
};

export function ScoreCheck({ teams }: ScoreCheckProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [warnings, setWarnings] = useState<readonly string[]>([]);
  useEffect(() => {
    const form = ref.current?.closest('form');
    if (form === null || form === undefined) return undefined;
    const update = () => {
      const fields: Record<string, string> = {};
      for (const [name, value] of new FormData(form)) {
        if (typeof value === 'string') fields[name] = value;
      }
      const read: BoxScoreFields = fields;
      setWarnings(
        teams.flatMap((team) => {
          const found = scoreMismatch(team, read);
          return found === undefined
            ? []
            : [
                team.warning
                  .replaceAll('{score}', String(found.score))
                  .replaceAll('{points}', String(found.points)),
              ];
        }),
      );
    };
    update();
    form.addEventListener('input', update);
    return () => form.removeEventListener('input', update);
  }, [teams]);
  return (
    <div ref={ref} className="box-score-warning" role="status" aria-live="polite">
      {warnings.map((warning) => (
        <p key={warning}>{warning}</p>
      ))}
    </div>
  );
}
