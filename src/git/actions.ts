// Git Graph actions from the phone (run-git-graph-action), with the
// desktop's confirmations (public/git-graph-dialogs.js) for the ones that
// lose work.

import type { Refs } from './history';

export type GraphAction = {
  label: string;
  actionId: string;
  params: Record<string, unknown>;
  /** Asked first, as the desktop does: "Are you sure?" with this text. */
  confirm?: string;
  destructive?: boolean;
  /** A name to ask for first, put into params[promptKey]. */
  prompt?: { title: string; key: string; initial?: string };
};

type Target = { hash: string; parents: string[]; kind: 'commit' | 'stash' | 'uncommitted'; stashIndex?: number | null; refs?: Refs; shortHash: string; subject: string };

/** What a row of the graph offers, given the branch checked out and the remotes. */
export function rowActions(row: Target, { currentBranch, remotes }: { currentBranch: string | null; remotes: string[] }): GraphAction[] {
  if (row.kind === 'uncommitted') {
    return [
      { label: 'Stash the changes', actionId: 'stashPush', params: { includeUntracked: true } },
      { label: 'Discard the changes', actionId: 'resetUncommitted', params: { mode: 'hard' }, confirm: 'This discards all uncommitted changes. Continue?', destructive: true },
      { label: 'Delete untracked files', actionId: 'cleanUntracked', params: { removeDirectories: true }, confirm: 'This permanently deletes untracked files. Continue?', destructive: true },
    ];
  }
  if (row.kind === 'stash') {
    const stashRef = `stash@{${row.stashIndex ?? 0}}`;
    return [
      { label: 'Apply stash', actionId: 'stashApply', params: { stashRef } },
      { label: 'Pop stash', actionId: 'stashPop', params: { stashRef } },
      { label: 'New branch from stash…', actionId: 'stashCreateBranch', params: { stashRef }, prompt: { title: 'Branch name', key: 'name' } },
      { label: 'Drop stash', actionId: 'stashDrop', params: { stashRef }, confirm: `Drop stash "${row.subject}"? This cannot be undone.`, destructive: true },
    ];
  }

  const commit = row.hash;
  const merge = row.parents.length > 1;
  const actions: GraphAction[] = [];
  const refs = row.refs || { heads: [], remotes: [], tags: [] };
  for (const name of refs.heads) {
    if (name !== currentBranch) {
      actions.push({ label: `Check out ${name}`, actionId: 'checkoutBranchImmediate', params: { name } });
      if (currentBranch) {
        actions.push({ label: `Merge ${name} into ${currentBranch}`, actionId: 'merge', params: { ref: name, refType: 'branch' } });
        actions.push({ label: `Rebase ${currentBranch} onto ${name}`, actionId: 'rebase', params: { upstream: name, refType: 'branch' } });
      }
    }
    if (remotes.length) actions.push({ label: `Push ${name}`, actionId: 'pushBranch', params: { branch: name, remotes: [remotes.includes('origin') ? 'origin' : remotes[0]], setUpstream: true, force: 'none' } });
    actions.push({ label: `Rename ${name}…`, actionId: 'renameBranch', params: { oldName: name }, prompt: { title: 'New name', key: 'newName', initial: name } });
    if (name !== currentBranch) actions.push({ label: `Delete ${name}`, actionId: 'deleteBranch', params: { name }, confirm: `Delete branch ${name}?`, destructive: true });
  }
  for (const { remote, name } of refs.remotes) {
    actions.push({ label: `Check out ${remote}/${name}`, actionId: 'checkoutRemoteBranch', params: { remote, shortName: name } });
    if (currentBranch) actions.push({ label: `Pull ${remote}/${name} into ${currentBranch}`, actionId: 'pullBranch', params: { remote, shortName: name } });
    actions.push({ label: `Delete ${remote}/${name}`, actionId: 'deleteRemoteBranch', params: { remote, shortName: name }, confirm: `Delete branch ${name} on remote ${remote}?`, destructive: true });
  }
  for (const name of refs.tags) {
    if (remotes.length) actions.push({ label: `Push tag ${name}`, actionId: 'pushTag', params: { tagName: name, remotes } });
    actions.push({ label: `Delete tag ${name}`, actionId: 'deleteTag', params: { name }, confirm: `Delete tag ${name}?`, destructive: true });
  }
  actions.push(
    { label: 'Check out this commit', actionId: 'checkoutCommit', params: { commit }, confirm: 'Checking out a specific commit leaves the repository in a detached HEAD state.' },
    { label: 'New branch here…', actionId: 'createBranch', params: { commit, checkOut: false }, prompt: { title: 'Branch name', key: 'name' } },
    { label: 'New tag here…', actionId: 'addTag', params: { commit, type: 'lightweight' }, prompt: { title: 'Tag name', key: 'name' } },
    { label: 'Cherry-pick', actionId: 'cherryPick', params: merge ? { commit, parent: 1 } : { commit } },
    { label: 'Revert', actionId: 'revert', params: merge ? { commit, parent: 1 } : { commit } },
  );
  if (currentBranch) {
    actions.push(
      { label: `Reset ${currentBranch} here (keep changes)`, actionId: 'resetToCommit', params: { commit, mode: 'mixed' } },
      { label: `Reset ${currentBranch} here (discard changes)`, actionId: 'resetToCommit', params: { commit, mode: 'hard' }, confirm: 'This discards all uncommitted and committed changes since this point. Continue?', destructive: true },
    );
  }
  if (!merge) actions.push({ label: 'Drop this commit', actionId: 'dropCommit', params: { commit }, confirm: `Are you sure you want to drop commit ${row.shortHash}? This cannot be undone.`, destructive: true });
  return actions;
}

/** deleteBranch failed because the branch is not merged: the desktop offers to force it. */
export function forceRetry(action: GraphAction, error: string): GraphAction | null {
  if (action.actionId !== 'deleteBranch' || !/not fully merged/i.test(error)) return null;
  const name = String(action.params.name);
  return { ...action, params: { ...action.params, forceDelete: true }, confirm: `Branch "${name}" is not fully merged. Force delete anyway?` };
}
