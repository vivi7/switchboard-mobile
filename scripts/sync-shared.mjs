#!/usr/bin/env node
// Copy the modules this app shares with the Switchboard desktop app into
// src/shared/vendor/. They are read from a git ref of the switchboard
// checkout next to this one (master by default), not from its working tree,
// so a half-done change there never leaks in.
//
//   node scripts/sync-shared.mjs [ref]

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const desktop = join(root, '..', 'switchboard');
const ref = process.argv[2] || 'master';
const files = [
  'remote-protocol.js',
  'public/session-config.js',
  'public/plan-parser.js',
  'public/snooze.js',
  'public/git-graph-layout.js',
];

const git = (...args) => execFileSync('git', ['-C', desktop, ...args], { encoding: 'utf8' });
const commit = git('rev-parse', '--short', ref).trim();
const outDir = join(root, 'src', 'shared', 'vendor');
mkdirSync(outDir, { recursive: true });

for (const file of files) {
  const source = git('show', `${ref}:${file}`);
  const header = `// Copied from switchboard/${file} at ${ref} ${commit} by scripts/sync-shared.mjs.\n// Do not edit: change it in switchboard and sync again.\n\n`;
  writeFileSync(join(outDir, basename(file)), header + source);
  console.log(`${file} → src/shared/vendor/${basename(file)}`);
}
