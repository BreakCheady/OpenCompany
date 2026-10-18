#!/usr/bin/env node
// Read-only static inventory of Supabase calls made by the web client.
// Run from repository root: node android/tools/audit-frontend-access.mjs
import { readFileSync } from 'node:fs';

const files = ['app.js', 'management.js', 'guidance.js'];
const rpc = new Map(), from = new Map();
for (const filename of files) {
  const source = readFileSync(filename, 'utf8');
  for (const [regex, bucket] of [
    [/\.rpc\(\s*['"`]([^'"`]+)['"`]/g, rpc],
    [/\.from\(\s*['"`]([^'"`]+)['"`]/g, from]
  ]) {
    for (const match of source.matchAll(regex)) {
      if (!bucket.has(match[1])) bucket.set(match[1], new Set());
      bucket.get(match[1]).add(filename);
    }
  }
}
const output = (entries) => Object.fromEntries([...entries].sort(([a], [b]) => a.localeCompare(b))
  .map(([key, files]) => [key, [...files].sort()]));
process.stdout.write(JSON.stringify({
  notice: 'Static callsite inventory only; review dynamic calls, storage, realtime and backend separately.',
  rpc: output(rpc),
  from: output(from)
}, null, 2) + '\n');
