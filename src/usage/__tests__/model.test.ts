import { expect, test } from '@jest/globals';

import { limitRows, recentActivity } from '../model';

test('limits come as rows, from the list or the older flat keys, or say why not', () => {
  expect(limitRows({ limits: [{ label: 'Current session', percent: 42, reset: 'in 2h', severity: 'normal' }] })).toEqual({ rows: [{ label: 'Current session', percent: 42, reset: 'in 2h', warning: false }] });
  expect(limitRows({ session: 10, sessionReset: 'in 1h', weekAll: 95 })).toEqual({ rows: [
    { label: 'Current session', percent: 10, reset: 'in 1h', warning: false },
    { label: 'Week (all models)', percent: 95, reset: null, warning: true },
  ] });
  expect(limitRows({ _error: true, message: 'Not signed in' })).toEqual({ rows: [], note: 'Not signed in' });
  expect(limitRows({ _rateLimited: true, retryAfterSeconds: 90 })).toEqual({ rows: [], note: 'Asked too often; try again in 2 minutes.' });
  expect(limitRows({})).toEqual({ rows: [], note: 'Not used on this computer.' });
});

test('the last days of activity, with the days nothing happened', () => {
  const stats = { dailyActivity: [{ date: '2026-10-30', messageCount: 12, sessionCount: 2 }, { date: '2026-11-01', messageCount: 5, sessionCount: 1 }] };
  expect(recentActivity(stats, 3, '2026-11-01')).toEqual([
    { date: '2026-10-30', messages: 12, sessions: 2 },
    { date: '2026-10-31', messages: 0, sessions: 0 },
    { date: '2026-11-01', messages: 5, sessions: 1 },
  ]);
  expect(recentActivity(null, 2, '2026-11-01')).toEqual([{ date: '2026-10-31', messages: 0, sessions: 0 }, { date: '2026-11-01', messages: 0, sessions: 0 }]);
});
