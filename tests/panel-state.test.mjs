import assert from 'node:assert/strict';
import { test } from 'node:test';

import { markTabLoading, recallSessionKey, summaryPoints, tabSnapshot, updateAnalysis } from '../entrypoints/sidepanel/panel-state.ts';

test('a replacement analysis preserves the previous result through loading, retry, failure and cancellation', () => {
  const previous = { analysis: { recall: [{ question: 'What was the main point?' }] } };
  let state = updateAnalysis({ status: 'idle' }, { status: 'ready', result: previous });
  for (const action of [
    { status: 'running' },
    { status: 'retrying' },
    { status: 'error', message: 'Ollama is unavailable.' },
    { status: 'running' },
    { status: 'cancelled' },
  ]) {
    state = updateAnalysis(state, action);
    assert.equal(state.status, action.status);
    assert.equal(state.result, previous);
  }

  const refreshed = { analysis: { recall: [{ question: 'What evidence supports it?' }] } };
  assert.equal(updateAnalysis(state, { status: 'ready', result: refreshed }).result, refreshed);
});

test('a same-URL reload invalidates extracted state even if the next snapshot is already complete', () => {
  const tab = { id: 7, url: 'https://example.org/article', loading: false };
  const initial = tabSnapshot({ status: 'loading' }, tab);
  assert.equal(markTabLoading(initial, 8), initial);
  assert.equal(tabSnapshot(initial, { ...tab, title: 'Updated tab title' }).documentVersion, 0);
  const loading = markTabLoading(initial, 7);
  assert.equal(loading.tab.loading, true);
  assert.equal(loading.documentVersion, 1);
  assert.equal(tabSnapshot(loading, tab).documentVersion, 1);
  assert.equal(tabSnapshot(loading, { ...tab, id: 8 }).documentVersion, 0);
});

test('a cached round trip preserves the recall session even when storage reorders its fields', () => {
  const question = { question: 'What helps recall?', answer: 'Practice.', evidence: 'P1' };
  const cached = { answer: 'Practice.', evidence: 'P1', question: 'What helps recall?' };
  assert.equal(recallSessionKey([question]), recallSessionKey([cached]));
  assert.notEqual(recallSessionKey([question]), recallSessionKey([{ ...cached, evidence: 'P2' }]));
});

test('summary display omits repeated sentences but retains meaningful numbers and case distinctions', () => {
  const summary = { overview: 'Cells divide.', ideas: ['Cells  divide', 'Use pH 7.'], takeaways: ['Use pH 7!', 'Use pH 8.', 'Use PH 7.'] };
  assert.deepEqual(summaryPoints(summary), { ideas: ['Use pH 7.'], takeaways: ['Use pH 8.', 'Use PH 7.'] });
  assert.equal(summary.takeaways.length, 3);
});
