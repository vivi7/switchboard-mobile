import { expect, test } from '@jest/globals';

import { forceRetry, rowActions } from '../actions';

const row = (extra = {}) => ({ hash: 'abc1234def', shortHash: 'abc1234', parents: ['p1'], kind: 'commit' as const, subject: 'Fix login', ...extra });

test('a commit with branches offers the branch actions, never deleting the current one', () => {
  const actions = rowActions(row({ refs: { heads: ['main', 'feature'], remotes: [{ remote: 'origin', name: 'feature' }], tags: ['v1'] } }), { currentBranch: 'main', remotes: ['origin'], upstreams: { feature: 'origin/feature' } });
  const labels = actions.map((a) => a.label);
  expect(labels).toContain('Check out feature');
  expect(labels).toContain('Merge feature into main');
  expect(labels).toContain('Delete feature');
  expect(labels).not.toContain('Delete main');
  expect(labels).not.toContain('Check out main');
  expect(labels).toContain('Pull origin/feature into main');
  // A branch that tracks a remote goes there, as git would choose; one that does not is published and tracked.
  expect(actions.find((a) => a.label === 'Push feature to origin')?.params).toEqual({ branch: 'feature', remotes: [], setUpstream: false, force: 'none' });
  expect(actions.find((a) => a.label === 'Push main to origin (and track it)')?.params).toEqual({ branch: 'main', remotes: ['origin'], setUpstream: true, force: 'none' });
  expect(actions.find((a) => a.label === 'Push tag v1 to origin')?.params).toEqual({ tagName: 'v1', remotes: ['origin'] });
  expect(actions.find((a) => a.label === 'Delete tag v1')?.confirm).toBe('Delete tag v1?');
});

test('a merge commit picks its first parent for cherry-pick and revert, and cannot be dropped', () => {
  const actions = rowActions(row({ parents: ['p1', 'p2'] }), { currentBranch: 'main', remotes: [] });
  expect(actions.find((a) => a.actionId === 'cherryPick')?.params).toEqual({ commit: 'abc1234def', parent: 1 });
  expect(actions.some((a) => a.actionId === 'dropCommit')).toBe(false);
  expect(actions.find((a) => a.label === 'Reset main here (discard changes)')?.confirm).toMatch(/discards all uncommitted and committed changes/);
});

test('stashes and uncommitted changes have their own actions', () => {
  const stash = rowActions(row({ kind: 'stash', stashIndex: 2, subject: 'WIP', hash: 'st4sh' }), { currentBranch: 'main', remotes: [] });
  expect(stash.map((a) => a.params.stashRef)).toEqual(['stash@{2}', 'stash@{2}', 'stash@{2}', 'stash@{2}']);
  // The computer checks the stash is still the one seen here.
  expect(stash.every((a) => a.params.stashHash === 'st4sh')).toBe(true);
  expect(rowActions(row({ kind: 'stash', stashIndex: null }), { currentBranch: 'main', remotes: [] })).toEqual([]);
  expect(stash.find((a) => a.actionId === 'stashDrop')?.confirm).toBe('Drop stash "WIP"? This cannot be undone.');
  const changes = rowActions(row({ kind: 'uncommitted', hash: '#uncommitted' }), { currentBranch: 'main', remotes: [] });
  expect(changes.map((a) => a.actionId)).toEqual(['stashPush', 'resetUncommitted', 'cleanUntracked']);
});

test('deleting a branch that is not merged asks before forcing it', () => {
  const del = rowActions(row({ refs: { heads: ['old'], remotes: [], tags: [] } }), { currentBranch: 'main', remotes: [] }).find((a) => a.actionId === 'deleteBranch')!;
  expect(forceRetry(del, "error: the branch 'old' is not fully merged")).toMatchObject({ params: { name: 'old', forceDelete: true }, confirm: 'Branch "old" is not fully merged. Force delete anyway?' });
  expect(forceRetry(del, 'some other error')).toBeNull();
});
