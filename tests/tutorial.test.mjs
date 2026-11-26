import { test } from 'node:test';
import assert from 'node:assert/strict';
import { modules, move, initialProgress, readProgress } from '../lib/tutorial.ts';
test('guided modules cover 14 unique actions with a two-action essential path', () => {
  const steps = modules.flatMap((m) => m.steps);
  assert.equal(new Set(steps.map((s) => s.id)).size, 14);
  assert.equal(modules[0].steps.length, 2);
  for (const s of steps) assert.ok(s.why && s.how && s.example && s.target);
});
test('only the current active action advances, skip stays distinct from completion and resume restores the cursor', () => {
  const start = { ...initialProgress(), status: 'active' };
  assert.equal(move(start, 'next', 'pdf'), start);
  const next = move(start, 'next', 'space');
  assert.deepEqual(next.done, ['space']);
  const paused = move(next, 'pause');
  assert.equal(move(paused, 'next', 'save'), paused);
  assert.deepEqual(readProgress(JSON.parse(JSON.stringify(paused))), paused);
  const end = move(move(paused, 'resume'), 'skip', 'save');
  assert.equal(end.status, 'finished');
  assert.deepEqual(end.skipped, ['save']);
  assert.equal(move(next, 'back').cursor, 0);
  assert.equal(readProgress({ ...next, cursor: 99 }), undefined);
});
