import { expect, test } from '@jest/globals';

import { buildLayoutInput, lineDiff } from '../history';

const commit = (hash: string, parents: string[], date: string) => ({ hash, shortHash: hash, parents, authorName: 'Alex', authorEmail: '', authorDate: date, commitDate: date, subject: hash });

test('uncommitted changes sit on top, stashes where their date falls but never below their base', () => {
  const commits = [commit('c3', ['c2'], '2026-11-01T12:00:00Z'), commit('c2', ['c1'], '2026-11-01T10:00:00Z'), commit('c1', [], '2026-11-01T08:00:00Z')];
  const stashes = [
    { hash: 's-new', index: 0, message: 'WIP on main', date: '2026-11-01T11:00:00Z', baseCommitHash: 'c2' },
    { hash: 's-late', index: 1, message: 'taken from c1, dated late', date: '2026-11-01T13:00:00Z', baseCommitHash: 'c1' },
    { hash: 's-gone', index: 2, message: 'base not loaded', date: '2026-11-01T09:00:00Z', baseCommitHash: 'c0' },
  ];
  const rows = buildLayoutInput(commits, stashes, { changeCount: 2 }, 'c3');
  expect(rows.map((r) => r.hash)).toEqual(['#uncommitted', 's-late', 'c3', 's-new', 'c2', 'c1']);
  expect(rows[0]).toMatchObject({ kind: 'uncommitted', parents: ['c3'], subject: 'Uncommitted Changes (2)' });
  expect(rows[3]).toMatchObject({ kind: 'stash', parents: ['c2'], stashIndex: 0 });
  expect(buildLayoutInput(commits, [], null, 'c3').map((r) => r.hash)).toEqual(['c3', 'c2', 'c1']);
});

test('two versions of a file become a unified diff with context', () => {
  const before = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].join('\n');
  const after = ['a', 'b', 'c', 'D', 'e', 'f', 'g', 'h', 'i', 'j', 'k'].join('\n');
  const lines = lineDiff(before, after, 2);
  expect(lines.map((l) => l.text)).toEqual([
    '@@ -2,5 +2,5 @@', ' b', ' c', '-d', '+D', ' e', ' f',
    '@@ -9,2 +9,3 @@', ' i', ' j', '+k',
  ]);
  expect(lines.map((l) => l.kind).slice(0, 5)).toEqual(['hunk', 'context', 'context', 'del', 'add']);
});

test('a new or deleted file is all additions or all deletions; same text, no lines', () => {
  expect(lineDiff('', 'one\ntwo').map((l) => l.text)).toEqual(['@@ -0,0 +1,2 @@', '+one', '+two']);
  expect(lineDiff('one', '').map((l) => l.text)).toEqual(['@@ -1,1 +0,0 @@', '-one']);
  expect(lineDiff('same\n', 'same\n')).toEqual([]);
});

test('files too different to compare here say so instead of hanging', () => {
  const big = (seed: string) => Array.from({ length: 6000 }, (_, i) => `${seed}${i}`).join('\n');
  expect(lineDiff(big('x'), big('y'))).toEqual([{ kind: 'meta', text: 'Too many changes to show here.' }]);
});

test('the diff rebuilds both versions, for any two texts', () => {
  let seed = 7;
  const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const text = () => Array.from({ length: Math.floor(random() * 40) }, () => 'abcde'[Math.floor(random() * 5)]).join('\n');
  for (let run = 0; run < 300; run++) {
    const before = text();
    const after = text();
    const lines = lineDiff(before, after, 1e9);
    const side = (keep: string) => lines.filter((l) => l.kind !== 'hunk' && l.text[0] !== keep).map((l) => l.text.slice(1)).join('\n');
    if (before === after) { expect(lines).toEqual([]); continue; }
    expect(side('+')).toBe(before);
    expect(side('-')).toBe(after);
  }
});

test('a whole new or deleted file needs no comparing, however long', () => {
  const long = Array.from({ length: 5000 }, (_, i) => `line ${i}`).join('\n');
  expect(lineDiff('', long)).toHaveLength(5001);
  expect(lineDiff(long, '')[0].text).toBe('@@ -1,5000 +0,0 @@');
});
