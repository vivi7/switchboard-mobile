import { expect, test } from '@jest/globals';

import { graphRows, LANE_WIDTH, ROW_HEIGHT } from '../graph';

const x = (lane: number) => LANE_WIDTH / 2 + lane * LANE_WIDTH;
const mid = ROW_HEIGHT / 2;

// A merges C into B; B and C both come from D, the root.
const commits = [
  { hash: 'A', parents: ['B', 'C'] },
  { hash: 'B', parents: ['D'] },
  { hash: 'C', parents: ['D'] },
  { hash: 'D', parents: [] },
];

test('each row gets its node and the lines that cross it', () => {
  const { rows, lanes } = graphRows(commits);
  expect(lanes).toBe(2);
  expect(rows.map((r) => r.node.x)).toEqual([x(0), x(0), x(1), x(0)]);
  // A: down its own lane to B, and a curve out to lane 1 towards C.
  expect(rows[0].segments.map((s) => s.d)).toEqual([
    `M${x(0)} ${mid} L${x(0)} ${ROW_HEIGHT}`,
    `M${x(0)} ${mid} C${x(0)} ${ROW_HEIGHT} ${x(1)} ${mid} ${x(1)} ${ROW_HEIGHT}`,
  ]);
  // B: lane 1 passes by; B's own line goes on down to D.
  expect(rows[1].segments.map((s) => s.d)).toContain(`M${x(1)} 0 L${x(1)} ${ROW_HEIGHT}`);
  // D: both lines arrive at its node.
  expect(rows[3].segments.filter((s) => s.d.endsWith(`${x(0)} ${mid}`)).length).toBe(2);
});

test('a parent outside the loaded commits runs to the bottom of the list', () => {
  const { rows } = graphRows([{ hash: 'A', parents: ['old'] }, { hash: 'B', parents: ['A'] }].reverse());
  // A: B's line arrives from above, A's own leaves at the bottom towards a parent not loaded.
  expect(rows[1].segments.map((s) => s.d)).toEqual([`M${x(0)} 0 L${x(0)} ${mid}`, `M${x(0)} ${mid} L${x(0)} ${ROW_HEIGHT}`]);
  expect(rows).toHaveLength(2);
});

test('lines take the colour of the line of history they belong to', () => {
  const { rows } = graphRows(commits);
  const branchOut = rows[0].segments[1];
  expect(branchOut.colorIndex).toBe(rows[2].node.colorIndex);
  expect(rows[0].segments[0].colorIndex).toBe(rows[0].node.colorIndex);
});
