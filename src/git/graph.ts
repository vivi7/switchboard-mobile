// The Git Graph's lines, row by row. Lanes come from the desktop's own layout
// (git-graph-layout.js); each row of the list draws its node and the part of
// every line that crosses it, so the list can stay virtualized.

import { computeGitGraphLayout } from '@/shared/vendor/git-graph-layout';

export const LANE_WIDTH = 14;
export const ROW_HEIGHT = 44;

export type Segment = { d: string; colorIndex: number };
export type GraphRow = { hash: string; node: { x: number; colorIndex: number }; segments: Segment[] };

const x = (lane: number) => LANE_WIDTH / 2 + lane * LANE_WIDTH;
const MID = ROW_HEIGHT / 2;

/** From one point to another lower down: straight in one lane, a curve between two. */
function link(x1: number, y1: number, x2: number, y2: number): string {
  return x1 === x2 ? `M${x1} ${y1} L${x2} ${y2}` : `M${x1} ${y1} C${x1} ${y2} ${x2} ${y1} ${x2} ${y2}`;
}

export function graphRows(commits: { hash: string; parents: string[] }[], options: { firstParentOnly?: boolean } = {}) {
  const layout = computeGitGraphLayout(commits, 'date', options);
  const index = new Map(layout.map((row, i) => [row.hash, i]));
  const rows: GraphRow[] = layout.map((row) => ({ hash: row.hash, node: { x: x(row.lane), colorIndex: row.colorIndex }, segments: [] }));
  let lanes = 0;
  layout.forEach((row, i) => {
    lanes = Math.max(lanes, row.lane + 1);
    for (const edge of row.edges) {
      lanes = Math.max(lanes, edge.viaLane + 1, edge.toLane + 1);
      const j = index.get(edge.parentHash);
      const colorIndex = edge.style === 'same-lane' ? row.colorIndex : j !== undefined ? layout[j].colorIndex : row.colorIndex;
      rows[i].segments.push({ d: link(x(row.lane), MID, x(edge.viaLane), ROW_HEIGHT), colorIndex });
      const last = j === undefined ? layout.length : j;
      for (let k = i + 1; k < last; k++) rows[k].segments.push({ d: `M${x(edge.viaLane)} 0 L${x(edge.viaLane)} ${ROW_HEIGHT}`, colorIndex });
      if (j !== undefined) rows[j].segments.push({ d: link(x(edge.viaLane), 0, x(edge.toLane), MID), colorIndex });
    }
  });
  return { rows, lanes };
}
