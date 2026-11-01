import { expect, test } from '@jest/globals';
import { applyLiveEvent, buildSections, cleanDisplayName, noticesFrom, relativeTime, rowState, sessionState, sessionTitle, shortProjectPath, type Folder, type LiveState } from '../model';

const now = Date.parse('2026-11-01T15:00:00Z');
const at = (minutesAgo: number) => new Date(now - minutesAgo * 60000).toISOString();

const folders: Folder[] = [
  { folder: 'a', projectPath: '/Users/alex/Code/switchboard', sessions: [
    { sessionId: 'old', projectPath: '/Users/alex/Code/switchboard', summary: 'Old work', modified: at(60 * 30) },
    { sessionId: 'new', projectPath: '/Users/alex/Code/switchboard', aiTitle: 'Tidy up', modified: at(5), starred: 1 },
    { sessionId: 'gone', projectPath: '/Users/alex/Code/switchboard', summary: 'Archived', modified: at(1), archived: 1 },
  ] },
  { folder: 'b', projectPath: '/Users/alex/work/api', sessions: [
    { sessionId: 'busy', projectPath: '/Users/alex/work/api', name: 'Pipeline', modified: at(90) },
  ] },
  { folder: 'c', projectPath: '/tmp/empty', sessions: [] },
];

test('titles follow name, then AI title, then summary, cleaned like the desktop', () => {
  expect(sessionTitle({ sessionId: 'x', projectPath: '/', name: 'Mine', aiTitle: 'AI', summary: 'S' })).toBe('Mine');
  expect(sessionTitle({ sessionId: 'x', projectPath: '/', aiTitle: 'AI', summary: 'S' })).toBe('AI');
  expect(sessionTitle({ sessionId: 'x', projectPath: '/' })).toBe('New session');
  expect(sessionTitle({ sessionId: 'x', projectPath: '/', type: 'terminal' })).toBe('Terminal');
  expect(cleanDisplayName('Implement the following plan:  <command>Fix</command>   it')).toBe('Fix it');
  expect(shortProjectPath('/Users/alex/Code/switchboard')).toBe('Code/switchboard');
});

test('sections hold a folder each, newest session first, newest folder first', () => {
  const sections = buildSections(folders, { now });
  expect(sections.map((s) => s.title)).toEqual(['Code/switchboard', 'work/api']);
  expect(sections[0].data.map((s) => s.sessionId)).toEqual(['new', 'old']);
});

test('filters and search matches narrow the list', () => {
  const live: Record<string, LiveState> = { busy: { busy: true, attention: false, exited: false, starting: false } };
  expect(buildSections(folders, { now, filter: 'running', live }).flatMap((s) => s.data.map((d) => d.sessionId))).toEqual(['busy']);
  expect(buildSections(folders, { now, filter: 'starred' }).flatMap((s) => s.data.map((d) => d.sessionId))).toEqual(['new']);
  expect(buildSections(folders, { now, filter: 'today' }).flatMap((s) => s.data.map((d) => d.sessionId))).toEqual(['new', 'busy']);
  expect(buildSections(folders, { now, matches: new Set(['old']) }).flatMap((s) => s.data.map((d) => d.sessionId))).toEqual(['old']);
});

test('relative times read like the desktop', () => {
  expect(relativeTime(at(0), now)).toBe('just now');
  expect(relativeTime(at(5), now)).toBe('5m ago');
  expect(relativeTime(at(180), now)).toBe('3h ago');
  expect(relativeTime(at(60 * 24 * 2), now)).toBe('2d ago');
  expect(relativeTime(null, now)).toBe('');
});

test('events move a session between working, waiting and stopped', () => {
  let live: Record<string, LiveState> = {};
  live = applyLiveEvent(live, 'cli-busy-state', ['s1', true]);
  expect(sessionState(live.s1)).toBe('busy');
  live = applyLiveEvent(live, 'terminal-notification', ['s1', 'Claude needs your permission', 'attention']);
  expect(sessionState(live.s1)).toBe('attention');
  live = applyLiveEvent(live, 'cli-busy-state', ['s1', true]);
  expect(sessionState(live.s1)).toBe('busy');
  live = applyLiveEvent(live, 'cli-busy-state', ['s1', false]);
  expect(sessionState(live.s1)).toBe('running');
  const same = applyLiveEvent(live, 'terminal-notification', ['s1', 'done', 'idle']);
  expect(same).toBe(live);
  live = applyLiveEvent(live, 'session-forked', ['s1', 's2']);
  expect(live.s1).toBeUndefined();
  expect(sessionState(live.s2)).toBe('running');
  live = applyLiveEvent(live, 'process-exited', ['s2', 0, 0, false]);
  expect(sessionState(live.s2)).toBe('idle');
});

test('the desktop\'s marks arrive as sets, whatever shape they come in', () => {
  const notices = noticesFrom({ ready: ['a', 'b'], attention: ['c'] });
  expect([...notices.ready]).toEqual(['a', 'b']);
  expect(notices.attention.has('c')).toBe(true);
  expect(noticesFrom(null).ready.size).toBe(0);
  expect(noticesFrom({ ready: 'a', attention: [1, 'd'] })).toEqual({ ready: new Set(), attention: new Set(['d']) });
});

test('a row shows needs-you, then working, then unread, then running', () => {
  const idle: LiveState = { busy: false, attention: false, exited: false, starting: false };
  const notices = noticesFrom({ ready: ['done', 'busy', 'asked'], attention: ['asked-on-desktop'] });
  expect(rowState('done', undefined, notices)).toBe('unread');
  expect(rowState('done', idle, notices)).toBe('unread');
  expect(rowState('busy', { ...idle, busy: true }, notices)).toBe('busy');
  expect(rowState('asked', { ...idle, attention: true }, notices)).toBe('attention');
  // Needs-you outlives the process on the desktop until someone opens the session.
  expect(rowState('asked-on-desktop', undefined, notices)).toBe('attention');
  expect(rowState('other', idle, notices)).toBe('running');
  expect(rowState('other', undefined, notices)).toBe('idle');
});
