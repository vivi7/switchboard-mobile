import { expect, test } from '@jest/globals';

import { applyDiffEvent, diffsFrom, type PendingDiffs } from '../model';

const data = (name: string) => ({ oldFilePath: `/code/app/${name}`, oldContent: 'a\n', newContent: 'b\n', tabName: name });

test('pending diffs come from the list, then follow the events', () => {
  let diffs: PendingDiffs = diffsFrom([{ sessionId: 's1', diffId: 'd1', ...data('one.ts'), openedAt: 1 }]);
  expect(Object.keys(diffs)).toEqual(['d1']);
  diffs = applyDiffEvent(diffs, 'mcp-open-diff', ['s1', 'd2', data('two.ts')]);
  diffs = applyDiffEvent(diffs, 'mcp-open-diff', ['s2', 'd3', data('three.ts')]);
  expect(diffs.d2).toMatchObject({ sessionId: 's1', oldFilePath: '/code/app/two.ts' });
  diffs = applyDiffEvent(diffs, 'mcp-diff-resolved', ['s1', 'd1', 'accept']);
  diffs = applyDiffEvent(diffs, 'mcp-close-tab', ['s1', 'd2']);
  expect(Object.keys(diffs)).toEqual(['d3']);
  diffs = applyDiffEvent(diffs, 'session-forked', ['s2', 's2-fork']);
  expect(diffs.d3.sessionId).toBe('s2-fork');
  diffs = applyDiffEvent(diffs, 'mcp-open-diff', ['s2-fork', 'd4', data('four.ts')]);
  diffs = applyDiffEvent(diffs, 'mcp-close-all-diffs', ['s2-fork']);
  expect(diffs).toEqual({});
});

test('a session that exits takes its diffs with it; other events change nothing', () => {
  const diffs = applyDiffEvent({}, 'mcp-open-diff', ['s1', 'd1', data('one.ts')]);
  expect(applyDiffEvent(diffs, 'cli-busy-state', ['s1', true])).toBe(diffs);
  expect(applyDiffEvent(diffs, 'process-exited', ['s1', 0])).toEqual({});
});
