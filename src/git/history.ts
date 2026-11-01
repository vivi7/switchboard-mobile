// The Git Graph's history (get-project-git-graph): the rows the graph lays
// out, and the diff of a file between two revisions, which the computer
// sends as the two versions of the file.

import type { DiffLine } from './model';

export type Refs = { heads: string[]; remotes: { remote: string; name: string }[]; tags: string[] };

export type GraphCommit = {
  hash: string; shortHash: string; parents: string[];
  authorName: string; authorEmail: string; authorDate: string; commitDate: string;
  subject: string; refs?: Refs; isHead?: boolean;
};
export type Stash = { hash: string; index: number | null; branch?: string | null; message: string; date: string; baseCommitHash: string | null };
export type Uncommitted = { changeCount: number };

export type HistoryRow = GraphCommit & { kind: 'commit' | 'stash' | 'uncommitted'; stashIndex?: number | null; changeCount?: number };

const time = (row: { commitDate?: string; authorDate?: string }) => new Date(row.commitDate || row.authorDate || 0).getTime();

/**
 * Commits as git listed them, with each stash where its date falls (never
 * below the commit it was taken from) and uncommitted changes on top: the
 * desktop's gitGraphBuildLayoutInput (public/git-graph-render.js).
 */
export function buildLayoutInput(commits: GraphCommit[], stashes: Stash[], uncommitted: Uncommitted | null, headHash: string | null): HistoryRow[] {
  const list: HistoryRow[] = commits.map((c) => ({ ...c, kind: 'commit' }));
  const stashRows: HistoryRow[] = stashes.map((stash) => ({
    hash: stash.hash, shortHash: stash.hash.slice(0, 8), parents: stash.baseCommitHash ? [stash.baseCommitHash] : [],
    authorName: '', authorEmail: '', authorDate: stash.date, commitDate: stash.date, subject: stash.message || '',
    kind: 'stash', stashIndex: stash.index,
  }));
  stashRows.sort((a, b) => time(a) - time(b));
  for (const stash of stashRows) {
    const base = stash.parents[0] ? list.findIndex((c) => c.hash === stash.parents[0]) : -1;
    // Its base commit is not loaded yet: it waits for Load More.
    if (base === -1) continue;
    let at = list.findIndex((c) => time(c) < time(stash));
    if (at === -1 || at > base) at = base;
    list.splice(at, 0, stash);
  }
  if (uncommitted) {
    const now = new Date().toISOString();
    list.unshift({
      hash: '#uncommitted', shortHash: '', parents: headHash ? [headHash] : [],
      authorName: '*', authorEmail: '', authorDate: now, commitDate: now,
      subject: `Uncommitted Changes (${uncommitted.changeCount || 0})`,
      kind: 'uncommitted', changeCount: uncommitted.changeCount || 0,
    });
  }
  return list;
}

const toLines = (text: string) => (text === '' ? [] : text.replace(/\n$/, '').split('\n'));

type Op = { type: ' ' | '-' | '+'; text: string };

/** The shortest edit script (Myers), or null past maxEdits. */
function editScript(a: string[], b: string[], maxEdits: number): Op[] | null {
  const n = a.length;
  const m = b.length;
  const offset = maxEdits + 1;
  const v = new Int32Array(2 * offset + 1);
  const trace: Int32Array[] = [];
  for (let d = 0; d <= maxEdits; d++) {
    trace.push(v.slice(offset - d - 1, offset + d + 2));
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]) ? v[offset + k + 1] : v[offset + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) { x++; y++; }
      v[offset + k] = x;
      if (x >= n && y >= m) return backtrack(a, b, trace, d);
    }
  }
  return null;
}

function backtrack(a: string[], b: string[], trace: Int32Array[], last: number): Op[] {
  const ops: Op[] = [];
  let x = a.length;
  let y = b.length;
  for (let d = last; d > 0; d--) {
    const saved = trace[d];
    const at = (k: number) => saved[k + d + 1];
    const k = x - y;
    const prevK = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1;
    const prevX = at(prevK);
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) { ops.push({ type: ' ', text: a[--x] }); y--; }
    if (x === prevX) ops.push({ type: '+', text: b[--y] });
    else ops.push({ type: '-', text: a[--x] });
  }
  while (x > 0 && y > 0) { ops.push({ type: ' ', text: a[--x] }); y--; }
  return ops.reverse();
}

/** Two versions of a file as a unified diff, `context` lines around each change. */
export function lineDiff(before: string, after: string, context = 3, maxEdits = 1500): DiffLine[] {
  const ops = editScript(toLines(before), toLines(after), maxEdits);
  if (!ops) return [{ kind: 'meta', text: 'Too many changes to show here.' }];
  const changes = ops.map((op, i) => (op.type === ' ' ? -1 : i)).filter((i) => i >= 0);
  if (!changes.length) return [];

  // Line numbers before each op, in the old and the new file.
  const oldAt: number[] = [];
  const newAt: number[] = [];
  let oldLine = 0;
  let newLine = 0;
  for (const op of ops) {
    oldAt.push(oldLine);
    newAt.push(newLine);
    if (op.type !== '+') oldLine++;
    if (op.type !== '-') newLine++;
  }

  const lines: DiffLine[] = [];
  let c = 0;
  while (c < changes.length) {
    let last = c;
    while (last + 1 < changes.length && changes[last + 1] - changes[last] - 1 <= 2 * context) last++;
    const start = Math.max(0, changes[c] - context);
    const end = Math.min(ops.length - 1, changes[last] + context);
    const hunk = ops.slice(start, end + 1);
    const oldCount = hunk.filter((op) => op.type !== '+').length;
    const newCount = hunk.filter((op) => op.type !== '-').length;
    // An empty side names the line before it, as git does.
    const oldStart = oldCount ? oldAt[start] + 1 : oldAt[start];
    const newStart = newCount ? newAt[start] + 1 : newAt[start];
    lines.push({ kind: 'hunk', text: `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@` });
    for (const op of hunk) lines.push({ kind: op.type === '+' ? 'add' : op.type === '-' ? 'del' : 'context', text: `${op.type}${op.text}` });
    c = last + 1;
  }
  return lines;
}
