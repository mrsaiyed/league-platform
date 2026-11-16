// The browser tests' raw-HTML title check (tests/browser/web-browser-kit.mjs,
// titleInHeadProblem; step 2.175), on made-up pages shaped like what Next.js sends: the
// title in the head, and the title sent late, after the page, at the end of the body (as
// Next.js streams it to a browser unless htmlLimitedBots names every browser).
import assert from 'node:assert/strict';
import test from 'node:test';
import { titleInHeadProblem } from './browser/web-browser-kit.mjs';

const page = (head, body) =>
  `<!DOCTYPE html><html lang="en"><head><meta charSet="utf-8"/>${head}</head><body>${body}</body></html>`;
const main = '<main><h1>Your account</h1></main>';

test('a title with words in the head is right', () => {
  assert.equal(titleInHeadProblem(page('<title>SR Leagues</title>', main)), '');
});

test('a title sent after the page, at the end of the body, is named as late', () => {
  const late = page(
    '<script src="/_next/static/chunks/a.js" async=""></script>',
    `${main}<script>self.__next_f.push([1,"x"])</script><title>SR Leagues</title><div hidden id="S:1"></div>`,
  );
  assert.equal(titleInHeadProblem(late), 'the title comes after the head, not in it');
});

test('an empty title, no title and no head are each named', () => {
  assert.equal(
    titleInHeadProblem(page('<title> </title>', main)),
    'the title in the head is empty',
  );
  assert.equal(titleInHeadProblem(page('', main)), 'the page has no title');
  assert.equal(titleInHeadProblem(''), 'the page has no head');
});
