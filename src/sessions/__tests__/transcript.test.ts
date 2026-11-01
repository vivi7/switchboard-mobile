import { expect, test } from '@jest/globals';

import { cleanText, toolSummary, Transcript } from '../transcript';

const user = (uuid: string, content: any, extra: object = {}) => ({ type: 'user', uuid, message: { role: 'user', content }, ...extra });
const assistant = (uuid: string, content: any) => ({ type: 'assistant', uuid, message: { role: 'assistant', content } });

test('user and assistant text become chat items; other entries are skipped', () => {
  const t = new Transcript();
  const items = t.add([
    { type: 'file-history-snapshot' },
    user('u1', 'Fix the login page'),
    user('meta', 'Caveat: internal', { isMeta: true }),
    assistant('a1', [{ type: 'thinking', thinking: 'hmm' }, { type: 'text', text: 'Looking at **login.ts**.' }]),
  ]);
  expect(items.map((i) => [i.kind, 'text' in i ? i.text : ''])).toEqual([
    ['user', 'Fix the login page'],
    ['assistant', 'Looking at **login.ts**.'],
  ]);
});

test('a tool call gets its result when the result arrives, even in a later read', () => {
  const t = new Transcript();
  t.add([assistant('a1', [{ type: 'tool_use', id: 'toolu_1', name: 'Bash', input: { command: 'npm test\n--verbose', description: 'Run tests' } }])]);
  expect(t.items[0]).toMatchObject({ kind: 'tool', name: 'Bash', summary: 'npm test' });
  expect(t.items[0]).not.toHaveProperty('result');
  const before = t.items;
  const after = t.add([user('u2', [{ type: 'tool_result', tool_use_id: 'toolu_1', content: [{ type: 'text', text: '3 passed' }], is_error: false }])]);
  expect(after).not.toBe(before);
  expect(after[0]).toMatchObject({ kind: 'tool', result: '3 passed', error: false });
  expect(after).toHaveLength(1);
});

test('slash commands and their output read as one item', () => {
  const t = new Transcript();
  const items = t.add([
    user('c1', '<command-name>/compact</command-name>\n<command-message>compact</command-message>\n<command-args>keep the plan</command-args>'),
    user('c2', '<local-command-stdout>Compacted.</local-command-stdout>'),
  ]);
  expect(items).toEqual([{ kind: 'command', id: 'c1:0', text: '/compact keep the plan', output: 'Compacted.', time: undefined }]);
});

test('nothing new keeps the same array, so the list does not re-render', () => {
  const t = new Transcript();
  const first = t.add([user('u1', 'hi')]);
  expect(t.add([{ type: 'summary' }])).toBe(first);
});

test('text loses Claude Code wrappers; tool summaries stay one short line', () => {
  expect(cleanText('Do it<system-reminder>secret context</system-reminder> <b>now</b>')).toBe('Do it now');
  expect(toolSummary('Read', { file_path: '/src/app.ts' })).toBe('/src/app.ts');
  expect(toolSummary('Grep', { pattern: 'TODO', path: '/src' })).toBe('TODO');
  expect(toolSummary('Custom', { anything: 'x'.repeat(200) })).toHaveLength(161);
  expect(toolSummary('None', null)).toBe('');
});

test('terminal colour codes are taken out of command output and tool results', () => {
  const t = new Transcript();
  const items = t.add([
    user('c1', '<command-name>/model</command-name>'),
    user('c2', '<local-command-stdout>Set model to \x1b[1mSonnet\x1b[22m\x1b[2m and saved\x1b[22m</local-command-stdout>'),
    assistant('a1', [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls' } }]),
    user('u1', [{ type: 'tool_result', tool_use_id: 't1', content: '\x1b[34mdir\x1b[0m file\x1b]8;;http://x\x07' }]),
  ]);
  expect(items[0]).toMatchObject({ kind: 'command', output: 'Set model to Sonnet and saved' });
  expect(items[1]).toMatchObject({ kind: 'tool', result: 'dir file' });
});
