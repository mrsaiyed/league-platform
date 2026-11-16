// The admin's menu marks the current item by more than its color (step 2.103;
// docs/build/DESIGN.md section 4, line 20). The colors are proved for any league's colors
// in packages/site (design/staff-look.test.ts); this proves what the stylesheet does with
// them, so that a later change cannot quietly leave the current item told by color alone,
// or leave a quiet word on its fill in the menu's own quiet color.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../../app/[league]/admin/staff.css', import.meta.url), 'utf8');

/** The declarations of the first rule whose selector list holds `selector`, as text. */
function rule(selector: string): string {
  const at = css.indexOf(`${selector} {`);
  const listed = at === -1 ? css.indexOf(`${selector},`) : at;
  if (listed === -1) return '';
  const open = css.indexOf('{', listed);
  return css.slice(open + 1, css.indexOf('}', open));
}

describe('the admin menu’s current item', () => {
  it('is filled, heavier, and marked by a bar at its start edge', () => {
    const current = rule(".staff .staff-nav a[aria-current='page']");
    expect(current).toContain('background: var(--staff-menu-current)');
    expect(current).toContain('color: var(--staff-on-menu-current)');
    expect(current).toContain('font-weight: 700');
    // The bar is a border, so it is still drawn when a device takes backgrounds away,
    // and it is at the start edge in either direction of reading (T-188).
    const bar = rule(".staff .staff-nav a[aria-current='page']::before");
    expect(bar).toMatch(/border-inline-start: [^;]+ solid currentColor/);
    expect(bar).toContain('inset-inline-start: 0');
  });

  it('keeps its fill under the pointer', () => {
    expect(css).toContain(
      ".staff .staff-nav a[aria-current='page'],\n.staff .staff-nav a[aria-current='page']:hover {",
    );
  });

  it('writes everything on it in the one color that reads on its fill', () => {
    expect(rule(".staff-nav a[aria-current='page'] .staff-icon")).toContain('color: inherit');
    expect(rule(".staff-nav a[aria-current='page'] .staff-nav-mark")).toContain('color: inherit');
  });
});
