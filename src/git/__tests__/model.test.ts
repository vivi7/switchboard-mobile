import { expect, test } from '@jest/globals';

import { changeRows, diffLines, statusLetter, type Change } from '../model';

const change = (path: string, status: Change['status'], extra: Partial<Change> = {}): Change => ({ path, status, staged: false, ...extra });

test('a unified diff becomes typed lines, headers apart from content', () => {
  const diff = [
    'diff --git a/src/app.ts b/src/app.ts',
    'index 1b2c3d4..5e6f7a8 100644',
    '--- a/src/app.ts',
    '+++ b/src/app.ts',
    '@@ -1,3 +1,3 @@ export function main() {',
    ' const a = 1;',
    '-const b = 2;',
    '+const b = 3;',
    '\\ No newline at end of file',
  ].join('\n');
  expect(diffLines(diff).map((l) => l.kind)).toEqual(['meta', 'meta', 'meta', 'meta', 'hunk', 'context', 'del', 'add', 'meta']);
  expect(diffLines(diff)[6].text).toBe('-const b = 2;');
  expect(diffLines('')).toEqual([]);
});

test('changes read as a tree: folders first, each file under its folder', () => {
  const rows = changeRows([change('src/app.ts', 'modified'), change('README.md', 'added'), change('src/lib/util.ts', 'untracked'), change('src/b.ts', 'deleted')]);
  expect(rows.map((r) => `${'  '.repeat(r.depth)}${r.name}${r.change ? '' : '/'}`)).toEqual([
    'src/', '  lib/', '    util.ts', '  app.ts', '  b.ts', 'README.md',
  ]);
  expect(rows[2].change?.path).toBe('src/lib/util.ts');
});

test('each change has the letter the desktop shows', () => {
  expect(['modified', 'added', 'deleted', 'renamed', 'untracked', 'conflicted'].map((s) => statusLetter(change('x', s as Change['status'])))).toEqual(['M', 'A', 'D', 'R', 'U', '!']);
});
