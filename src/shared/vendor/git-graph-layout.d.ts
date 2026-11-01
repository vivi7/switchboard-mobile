// Types for git-graph-layout.js, which is copied from switchboard (see
// scripts/sync-shared.mjs). Only what the app uses.

export type LayoutEdge = { parentHash: string; toLane: number; viaLane: number; style: 'same-lane' | 'branch-out' | 'merge-in' };
export type LayoutRow = { hash: string; lane: number; colorIndex: number; edges: LayoutEdge[]; row: number };

export function computeGitGraphLayout(
  commits: { hash: string; parents: string[] }[],
  order?: string,
  options?: { firstParentOnly?: boolean; paletteSize?: number },
): LayoutRow[];
