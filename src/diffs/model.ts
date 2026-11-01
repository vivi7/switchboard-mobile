// IDE diffs waiting for an answer: a Claude session started on the desktop
// with IDE emulation asks to change a file and waits until someone accepts or
// rejects it, in the window or on a phone (the first answer wins).

export type PendingDiff = {
  sessionId: string; diffId: string;
  oldFilePath: string; oldContent: string; newContent: string; tabName: string;
  openedAt?: number;
};
export type PendingDiffs = Record<string, PendingDiff>;

/** list-pending-diffs, for a phone that connects after a diff opened. */
export function diffsFrom(list: unknown): PendingDiffs {
  const diffs: PendingDiffs = {};
  for (const diff of Array.isArray(list) ? list : []) {
    if (diff && typeof diff.diffId === 'string' && typeof diff.sessionId === 'string') diffs[diff.diffId] = diff;
  }
  return diffs;
}

const without = (diffs: PendingDiffs, keep: (diff: PendingDiff) => boolean) => {
  const next = Object.fromEntries(Object.entries(diffs).filter(([, diff]) => keep(diff)));
  return Object.keys(next).length === Object.keys(diffs).length ? diffs : next;
};

/** One desktop event applied to the pending diffs. Returns the same object when nothing changed. */
export function applyDiffEvent(diffs: PendingDiffs, event: string, args: any[]): PendingDiffs {
  switch (event) {
    case 'mcp-open-diff': {
      const [sessionId, diffId, data] = args;
      if (typeof diffId !== 'string' || !data) return diffs;
      return { ...diffs, [diffId]: { sessionId, diffId, ...data, openedAt: Date.now() } };
    }
    case 'mcp-diff-resolved':
    case 'mcp-close-tab':
      return without(diffs, (diff) => diff.diffId !== args[1]);
    case 'mcp-close-all-diffs':
    case 'process-exited':
      // A session that ends answers its diffs on the desktop without a word.
      return without(diffs, (diff) => diff.sessionId !== args[0]);
    case 'session-detected':
    case 'session-forked': {
      const [oldId, newId] = args;
      if (!Object.values(diffs).some((diff) => diff.sessionId === oldId)) return diffs;
      return Object.fromEntries(Object.entries(diffs).map(([id, diff]) => [id, diff.sessionId === oldId ? { ...diff, sessionId: newId } : diff]));
    }
    default:
      return diffs;
  }
}
