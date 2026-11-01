import { expect, test } from '@jest/globals';

import { noticesFrom, type LiveState } from '@/sessions/model';
import { groupProjects, launchTarget, phaseItemPrompt, phasePrompt, projectSessions, rollupState, scheduleSummary, todoPrompt, type Project, type ProjectPlan, type Schedule } from '../model';

const now = Date.parse('2026-11-01T15:00:00Z');
const project = (id: string, extra: Partial<Project> = {}): Project => ({
  id, name: id, root: `/Users/alex/Switchboard/${id}`, status: 'active', snoozedUntil: null, defaultCwd: null,
  folders: [], tracks: [], schedules: [], sessions: [], ...extra,
});

test('projects split into active, snoozed and done; a snoozed one needing you is active again', () => {
  const projects = [
    project('web'),
    project('later', { snoozedUntil: '2026-11-02T08:00:00Z' }),
    project('woke', { snoozedUntil: '2026-11-01T14:00:00Z' }),
    project('asks', { snoozedUntil: '2026-11-02T08:00:00Z', sessions: [{ sessionId: 's-asks', projectPath: '/p' }] }),
    project('old', { status: 'done' }),
  ];
  const attention = noticesFrom({ attention: ['s-asks'] });
  const groups = groupProjects(projects, { now, live: {}, notices: attention });
  expect(groups.active.map((p) => p.id)).toEqual(['web', 'woke', 'asks']);
  expect(groups.snoozed.map((p) => p.id)).toEqual(['later']);
  expect(groups.done.map((p) => p.id)).toEqual(['old']);
});

test('a project reads as its most urgent session', () => {
  const p = project('web', {
    sessions: [{ sessionId: 'a', projectPath: '/p' }],
    tracks: [{ id: 't1', name: 'API', status: 'active', cwd: null, cli: null, sessions: [{ sessionId: 'b', projectPath: '/p' }, { sessionId: 'c', projectPath: '/p' }] }],
  });
  expect(projectSessions(p).map((s) => s.sessionId)).toEqual(['a', 'b', 'c']);
  const idle: LiveState = { busy: false, attention: false, exited: false, starting: false };
  const notices = noticesFrom({ ready: ['a'] });
  expect(rollupState(projectSessions(p), {}, notices)).toBe('unread');
  expect(rollupState(projectSessions(p), { b: { ...idle, busy: true } }, notices)).toBe('busy');
  expect(rollupState(projectSessions(p), { b: { ...idle, busy: true }, c: { ...idle, attention: true } }, notices)).toBe('attention');
  expect(rollupState([], {}, notices)).toBe('idle');
});

test('a session starts in the track\'s folder, then the project\'s default, then its own folder', () => {
  const track = { id: 't1', name: 'API', status: 'active' as const, cwd: '/code/api', cli: null, sessions: [] };
  expect(launchTarget(project('web'), null)).toEqual({ projectPath: '/Users/alex/Switchboard/web', projectId: 'web', trackId: null });
  expect(launchTarget(project('web', { defaultCwd: '/code/web' }), null).projectPath).toBe('/code/web');
  expect(launchTarget(project('web', { defaultCwd: '/code/web' }), track)).toEqual({ projectPath: '/code/api', projectId: 'web', trackId: 't1' });
});

test('prompts for a phase, an item of a phase and a todo are the desktop\'s', () => {
  const plan = { trackerPath: '/r/plan-tracker.md', planPath: '/r/plan.md', todosPath: '/r/todos.md', hasPlan: true } as ProjectPlan;
  const phase = { title: 'Phase 2: API', line: 4, headingDone: false, ticked: 1, done: false, items: [{ line: 5, text: 'Routes', done: true }, { line: 6, text: 'Auth', done: false }] };
  expect(phasePrompt(plan, phase)).toBe([
    'Work on this phase of the plan. The tracker is /r/plan-tracker.md and the plan itself is /r/plan.md.',
    '', 'Phase: Phase 2: API', '', 'Open items:', '- Auth', '',
    'When an item is finished, tick it in the tracker. Tick the phase heading once the whole phase is done.',
  ].join('\n'));
  expect(phasePrompt({ ...plan, hasPlan: false }, { ...phase, items: [] })).toBe(
    'Work on this phase of the plan. The tracker is /r/plan-tracker.md.\n\nPhase: Phase 2: API\n\nWhen an item is finished, tick it in the tracker. Tick the phase heading once the whole phase is done.');
  expect(phaseItemPrompt(plan, phase, phase.items[1])).toBe(
    'Work on this item from phase "Phase 2: API" of the plan. The tracker is /r/plan-tracker.md.\n\nAuth\n\nWhen it is done, tick it in the tracker.');
  expect(todoPrompt(plan, { line: 2, text: 'Write docs', done: false })).toBe(
    'Work on this todo from /r/todos.md:\n\nWrite docs\n\nWhen it is done, tick it in todos.md.');
});

test('a schedule reads as when it runs', () => {
  const s = (extra: Partial<Schedule>): Schedule => ({ id: 'x', name: 'x', prompt: '', every: 'day', atHour: 9, atMinute: 0, weekday: null, cron: null, enabled: true, cli: null, trackId: null, projectId: null, cwd: null, lastRunAt: null, ...extra });
  expect(scheduleSummary(s({ every: '15m' }))).toBe('Every 15 minutes');
  expect(scheduleSummary(s({ every: 'hour', atMinute: 5 }))).toBe('Every hour at :05');
  expect(scheduleSummary(s({ every: 'day', atHour: 9, atMinute: 30 }))).toBe('Every day at 09:30');
  expect(scheduleSummary(s({ every: 'weekdays', atHour: 18, atMinute: 0 }))).toBe('Weekdays at 18:00');
  expect(scheduleSummary(s({ every: 'week', weekday: 1, atHour: 9, atMinute: 0 }))).toBe('Mondays at 09:00');
  expect(scheduleSummary(s({ every: 'cron', cron: '0 3 * * *' }))).toBe('Cron 0 3 * * *');
  expect(scheduleSummary(s({ enabled: false }))).toBe('Every day at 09:00 (paused)');
});
