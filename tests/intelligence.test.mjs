import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chunksFor, retrieve, pack, pruneIndex, validateAnswer } from '../lib/retrieval.ts';
import { emptyKnowledge, revisionQueue, cardId, knowledgeKey, validKnowledge } from '../lib/revision.ts';
import { emptyLibrary, identifyArticle, attachArticle } from '../lib/library-model.ts';
import { fromStorage, mergeBackup, parseBackup } from '../lib/backup.ts';
import { createOllamaProvider } from '../lib/ai/ollama.ts';

let library = {
  ...emptyLibrary,
  spaces: ['plants', 'chess'].map((id) => ({ id, name: id, learningGoal: 'Study ' + id })),
};
const articles = [];
for (const [space, title, text] of [
  ['plants', 'Orchard', 'Researchers recorded bee visits. '.repeat(60)],
  ['plants', 'Fruit set', 'Counting tagged blossoms gives a denominator for fruit set.'],
  ['chess', 'London', 'Chess players develop the bishop.'],
]) {
  const a = await identifyArticle({
    title,
    text,
    url: 'https://example.org/' + space + articles.length,
    truncated: false,
  });
  library = attachArticle(library, a, space, '');
  articles.push(a);
}
const chunks = chunksFor(library, 'plants'),
  first = chunks[0];
test('stable bounded chunks reproduce source text with offsets and isolate selected space', () => {
  assert.deepEqual(chunks, chunksFor(library, 'plants'));
  assert.equal(
    chunks
      .filter((c) => c.articleId === articles[0].id)
      .map((c) => c.text)
      .join(''),
    articles[0].text,
  );
  for (const c of chunks) {
    assert.ok(c.text.length <= 700);
    assert.ok(articles.find((a) => a.id === c.articleId).text.startsWith(c.text, c.start));
  }
  assert.equal(retrieve(chunks, 'bishop').length, 0);
  assert.equal(retrieve(chunks, 'tagged blossoms')[0].articleId, articles[1].id);
  assert.equal(new Set(retrieve(chunks, 'bee visits fruit set').map((c) => c.articleId)).size, 2);
});
test('semantic retrieval can match without words; absent vectors fall back; deletion, edit and model change invalidate vectors', () => {
  const index = { revision: 'v1', rows: { [first.id]: { text: first.text, vector: pack([1, 0]) } } };
  assert.equal(retrieve(chunks, 'pollinators', index, [1, 0])[0].id, first.id);
  assert.equal(retrieve(chunks, 'pollinators').length, 0);
  assert.deepEqual(pruneIndex(index, chunks, 'v1'), index);
  assert.deepEqual(pruneIndex(index, [], 'v1').rows, {});
  assert.deepEqual(pruneIndex(index, [{ ...first, text: 'edited' }], 'v1').rows, {});
  assert.deepEqual(pruneIndex(index, chunks, 'v2').rows, {});
});
test('chat validates all passage IDs and requires a reason to abstain', () => {
  assert.throws(() => validateAnswer({ claims: [{ point: 'fake', refs: ['P99'] }], limitation: '' }, chunks));
  assert.throws(() => validateAnswer('bad', chunks));
  assert.equal(
    validateAnswer(
      { claims: [{ point: 'The observed value was 90%.', refs: ['P1'] }], limitation: '' },
      chunks,
      'What exact percentage was observed?',
    ).claims.length,
    0,
  );
  assert.throws(() => validateAnswer({ claims: [], limitation: '' }, chunks));
  assert.deepEqual(validateAnswer({ claims: [], limitation: 'Insufficient evidence.' }, chunks).claims, []);
  assert.deepEqual(
    validateAnswer({ claims: [{ point: 'Visits were recorded.', refs: ['P1'] }], limitation: '' }, chunks)
      .claims[0].refs,
    [first.id],
  );
});
const practice = {
  spaceId: 'plants',
  url: articles[0].url,
  model: 'qwen3:4b',
  goal: 'Study plants',
  question: 'What did they count?',
  expected: 'Bee visits.',
  passage: 'Researchers recorded bee visits.',
};
const card = { ...practice, id: cardId(practice), concepts: ['Pollination'] };
const day = 86400000,
  today = new Date(2026, 0, 10).getTime();
function rating(n, verdict) {
  return { at: today + n * day, id: 'attempt' + n, verdict, cardId: card.id };
}
test('offline schedules replay deterministically, accept overrides and retain the original attempt', () => {
  const data = { ...emptyKnowledge(), cards: [card] };
  for (const [i, interval] of [3, 7, 14, 30, 30].entries()) {
    data.ratings.push(rating(i, 'Correct'));
    assert.equal(revisionQueue(data, [])[0].due, today + (i + interval) * day);
  }
  const before = revisionQueue(data, [])[0].due;
  data.ratings.push(rating(5, 'Unable to Assess'));
  assert.equal(revisionQueue(data, [])[0].due, before);
  data.ratings.push({ ...rating(6, 'Partially Correct'), replaces: 'attempt4' });
  assert.equal(revisionQueue(data, [])[0].due, today + 6 * day);
  data.ratings.push(rating(7, 'Incorrect'));
  assert.equal(revisionQueue(data, [])[0].due, today + 8 * day);
  assert.equal(
    revisionQueue(structuredClone(data), [{ ...practice, kind: 'draft', answer: 'Bee visits' }]).length,
    1,
  );
  assert.equal(revisionQueue(data, [])[0].history.length, 7);
});
test('new backup restores history and revision schedules once and migrates original v1 backups without data loss', async () => {
  const turn = {
    id: 'chat',
    at: today,
    question: 'What was counted?',
    spaceId: 'plants',
    model: 'qwen3:4b',
    sources: [{ id: first.id, text: first.text }],
    claims: [{ point: 'Bee visits.', refs: [first.id] }],
    limitation: '',
  };
  const knowledge = { turns: [turn], cards: [card], ratings: [rating(0, 'Correct')] };
  const saved = fromStorage({ 'pki.library': library, [knowledgeKey]: knowledge });
  const backup = await parseBackup(JSON.stringify(saved)),
    restored = fromStorage(mergeBackup(fromStorage({}), backup).data);
  assert.deepEqual(restored, saved);
  assert.equal(mergeBackup(restored, backup).added, 0);
  const { knowledge: unused, ...v1 } = saved;
  const migrated = await parseBackup(JSON.stringify({ ...v1, version: 1 }));
  assert.deepEqual(migrated.library, library);
  assert.deepEqual(migrated.knowledge, emptyKnowledge());
  assert.equal(
    validKnowledge({ ...knowledge, ratings: [{ ...rating(0, 'Correct'), cardId: 'unknown' }] }),
    false,
  );
});
test('embedding and chat use local-only routes, structured output, and fail closed on malformed output', async () => {
  const calls = [];
  const provider = createOllamaProvider({
    fetcher: async (url, options) => {
      calls.push([url, JSON.parse(options.body)]);
      return Response.json(
        url.endsWith('/embed') ? { embeddings: [[1, 0]] } : { done: true, message: { content: 'invalid' } },
      );
    },
  });
  const s = new AbortController().signal;
  assert.deepEqual(await provider.embed(['test'], s), [[1, 0]]);
  await assert.rejects(provider.ask('qwen3:4b', 'test', ['text'], [], s), { code: 'json' });
  assert.equal(calls[0][0], 'http://127.0.0.1:11434/api/embed');
  assert.match(calls[0][1].model, /:local$/);
  assert.equal(calls[1][1].think, false);
  assert.equal(calls[1][1].format.type, 'object');
});
