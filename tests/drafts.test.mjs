import assert from 'node:assert/strict';
import { test } from 'node:test';
import { finishDraft, readDraft, writeDraft } from '../entrypoints/sidepanel/drafts.ts';

test('returning to an article or space restores only its own unsaved draft', () => {
  const keys = ['first', 'second'].map(space => JSON.stringify(['capture', 'article', space]));
  writeDraft(keys[0], 'First note');
  assert.equal(readDraft(keys[1]), undefined);
  writeDraft(keys[1], 'Second note');
  assert.equal(readDraft(keys[0]), 'First note');
  finishDraft(keys[0], 'First note');
  assert.equal(readDraft(keys[0]), undefined);
  assert.equal(readDraft(keys[1]), 'Second note');
});

test('save completion preserves newer typing and releases a submitted empty edit', () => {
  writeDraft('note', 'new');
  finishDraft('note', 'old');
  assert.equal(readDraft('note'), 'new');
  writeDraft('note', '');
  finishDraft('note', '');
  assert.equal(readDraft('note'), undefined);
});
