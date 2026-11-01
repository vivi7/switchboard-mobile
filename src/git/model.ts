// A project's repositories as the desktop's Git tab shows them: what changed,
// as a list or a tree, and the diff of one file.

/** One changed file, from the porcelain status (git.js parsePorcelain). */
export type Change = {
  path: string;
  oldPath?: string | null;
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'conflicted';
  staged: boolean;
};

export type Commit = { hash: string; shortHash: string; author: string; date: string; subject: string };

/** A repository attached to a project (get-project-git-info). */
export type Repository = {
  path: string;
  mode: 'in-place' | 'worktree';
  git: boolean;
  branch?: string;
  detached?: boolean;
  head?: string;
  dirty?: boolean;
  ahead?: number | null;
  behind?: number | null;
  operation?: string | null;
  changes?: Change[];
  stats?: { insertions: number; deletions: number };
  commits?: Commit[];
};

export type DiffLine = { kind: 'meta' | 'hunk' | 'add' | 'del' | 'context'; text: string };

/** A unified diff, line by line, with what each line is. */
export function diffLines(diff: string): DiffLine[] {
  if (!diff) return [];
  let inHunk = false;
  return diff.replace(/\n$/, '').split('\n').map((text) => {
    if (text.startsWith('@@')) { inHunk = true; return { kind: 'hunk', text }; }
    if (text.startsWith('diff ')) inHunk = false;
    if (!inHunk || text.startsWith('\\')) return { kind: 'meta', text };
    if (text.startsWith('+')) return { kind: 'add', text };
    if (text.startsWith('-')) return { kind: 'del', text };
    return { kind: 'context', text };
  });
}

export type ChangeRow = { key: string; depth: number; name: string; change?: Change };

/** The changes as a tree: each folder, then what is inside it, folders before files. */
export function changeRows(changes: Change[]): ChangeRow[] {
  type Node = { folders: Map<string, Node>; files: Change[] };
  const root: Node = { folders: new Map(), files: [] };
  for (const change of changes) {
    const parts = change.path.split('/');
    let node = root;
    for (const part of parts.slice(0, -1)) {
      if (!node.folders.has(part)) node.folders.set(part, { folders: new Map(), files: [] });
      node = node.folders.get(part)!;
    }
    node.files.push(change);
  }
  const rows: ChangeRow[] = [];
  const visit = (node: Node, depth: number, prefix: string) => {
    for (const [name, child] of [...node.folders].sort(([a], [b]) => a.localeCompare(b))) {
      rows.push({ key: `${prefix}${name}/`, depth, name });
      visit(child, depth + 1, `${prefix}${name}/`);
    }
    for (const change of [...node.files].sort((a, b) => a.path.localeCompare(b.path))) {
      rows.push({ key: change.path, depth, name: change.path.split('/').pop() || change.path, change });
    }
  };
  visit(root, 0, '');
  return rows;
}

const LETTERS: Record<Change['status'], string> = { modified: 'M', added: 'A', deleted: 'D', renamed: 'R', untracked: 'U', conflicted: '!' };

export function statusLetter(change: Change): string {
  return LETTERS[change.status] || '?';
}
