// Usage limits (get-usage, get-codex-usage) and Claude's activity
// (get-stats, from ~/.claude/stats-cache.json), as the desktop shows them.

export type LimitRow = { label: string; percent: number; reset: string | null; warning: boolean };

/** The limits of one CLI, or a note on why there are none. */
export function limitRows(usage: any): { rows: LimitRow[]; note?: string } {
  if (!usage || typeof usage !== 'object') return { rows: [], note: 'Not used on this computer.' };
  if (usage._error) return { rows: [], note: usage.message || 'Could not read the usage.' };
  if (usage._rateLimited) return { rows: [], note: `Asked too often; try again in ${Math.max(1, Math.ceil((usage.retryAfterSeconds || 60) / 60))} minutes.` };
  const row = (label: string, percent: number, reset: string | null | undefined, severity?: string): LimitRow => ({
    label, percent, reset: reset || null, warning: severity === 'warning' || severity === 'critical' || percent >= 90,
  });
  if (Array.isArray(usage.limits) && usage.limits.length) {
    return { rows: usage.limits.map((l: any) => row(l.label, Math.floor(l.percent), l.reset, l.severity)) };
  }
  const rows: LimitRow[] = [];
  if (typeof usage.session === 'number') rows.push(row('Current session', usage.session, usage.sessionReset));
  if (typeof usage.weekAll === 'number') rows.push(row('Week (all models)', usage.weekAll, usage.weekAllReset));
  return rows.length ? { rows } : { rows: [], note: 'Not used on this computer.' };
}

export type DayActivity = { date: string; messages: number; sessions: number };

/** The last `days` days up to `today` (YYYY-MM-DD), each with its messages and sessions. */
export function recentActivity(stats: any, days: number, today: string): DayActivity[] {
  const byDate = new Map<string, any>((stats?.dailyActivity || []).map((d: any) => [d.date, d]));
  const end = new Date(`${today}T12:00:00Z`);
  const out: DayActivity[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(end.getTime() - i * 86_400_000).toISOString().slice(0, 10);
    const day = byDate.get(date);
    out.push({ date, messages: day?.messageCount || 0, sessions: day?.sessionCount || 0 });
  }
  return out;
}
