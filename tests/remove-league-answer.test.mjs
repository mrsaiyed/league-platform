// The answer to `npm run league:remove`'s question (scripts/remove-league-answer.mjs):
// spaces around the typed line are taken off, then the comparison is exact.
import assert from 'node:assert/strict';
import test from 'node:test';
import { typedOwnerEmail, typedShortName } from '../scripts/remove-league-answer.mjs';

test('the owner’s email, asked once the owner has signed in, is compared the same way', () => {
  const email = 'Owner.Name@example.test';
  assert.equal(typedOwnerEmail(`  ${email}\n`, email), email);
  for (const answer of ['owner.name@example.test', 'Owner.Name@example.tes', 'yes', '']) {
    assert.equal(typedOwnerEmail(answer, email), null, JSON.stringify(answer));
  }
});

test('takes off the spaces around the typed line, then compares exactly, capitals included', () => {
  for (const answer of [
    'made-up-hoops',
    '  made-up-hoops',
    'made-up-hoops \n',
    '\tmade-up-hoops',
  ]) {
    assert.equal(typedShortName(answer, 'made-up-hoops'), 'made-up-hoops', JSON.stringify(answer));
  }
  for (const answer of [
    'Made-up-hoops',
    'MADE-UP-HOOPS',
    'made-up hoops',
    'made-up-hoop',
    'yes',
    '',
  ]) {
    assert.equal(typedShortName(answer, 'made-up-hoops'), null, JSON.stringify(answer));
  }
});
