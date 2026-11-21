import assert from 'node:assert/strict';
import { test } from 'node:test';

import { analyzeArticle, prepareInput } from '../lib/ai/analysis.ts';
import { AiError } from '../lib/ai/provider.ts';
import { createOllamaProvider } from '../lib/ai/ollama.ts';
import { validateAnalysis } from '../lib/ai/schema.ts';

const article = {
  title: 'Learning through recall',
  url: 'https://example.org/private?token=fixture',
  text: 'Retrieving ideas from memory reveals gaps. Repeat the process after reviewing the material.',
  truncated: false,
};
const goal = 'Understand active recall';
const model = { name: 'qwen2.5:1.5b', revision: 'digest-fixture' };
const evidence = 'P1';
const result = {
  relevance: { level: 'High', alignment: 'The text explains how recall exposes gaps.',
    topics: ['Recall'], limitations: ['No timing is given.'], evidence: [evidence] },
  summary: { overview: 'The article describes retrieval and review.',
    ideas: ['Recall helps identify gaps.'], takeaways: ['Review after attempting recall.'] },
  concepts: [{ term: 'Active recall', explanation: 'Retrieve ideas from memory.', evidence }],
  recall: [
    { question: 'What can recall reveal?', answer: 'Gaps in understanding.', evidence },
    { question: 'Where do you retrieve ideas from?', answer: 'Memory.', evidence },
    { question: 'What does repeating the process follow?', answer: 'Reviewing the material.',
      evidence },
  ],
};
const input = prepareInput(article, goal).input;
const response = (value, status = 200) => new Response(JSON.stringify(value), { status });
const ollamaReply = (value) => ({
  done: true, done_reason: 'stop', message: { content: JSON.stringify(value) },
});

test('discovers installed local models and excludes cloud entries', async () => {
  const provider = createOllamaProvider({
    fetcher: async (url, options) => {
      assert.equal(url, 'http://127.0.0.1:11434/api/tags');
      assert.equal(options.method, 'GET');
      return response({ models: [
        { name: model.name, digest: model.revision, size: 1 },
        { name: 'qwen:cloud', digest: 'irrelevant', size: 1 },
        { name: 'cloud-alias:latest', digest: 'irrelevant', size: 1 },
        { name: 'alias:latest', digest: 'irrelevant', size: 1, remote_host: 'https://ollama.com' },
        { name: 'bad:latest', digest: '', size: 0 },
      ] });
    },
  });
  assert.deepEqual(await provider.listModels(), [model]);
});

test('distinguishes an available provider with no models from an invalid model list', async () => {
  assert.deepEqual(await createOllamaProvider({
    fetcher: async () => response({ models: [] }),
  }).listModels(), []);
  await assert.rejects(createOllamaProvider({
    fetcher: async () => response({ models: false }),
  }).listModels(), { code: 'invalid' });
});

test('makes a structured single generation call without the article URL or credentials', async () => {
  const provider = createOllamaProvider({
    fetcher: async (url, options) => {
      assert.equal(url, 'http://127.0.0.1:11434/api/chat');
      assert.equal(options.method, 'POST');
      assert.equal(options.credentials, 'omit');
      assert.equal(options.redirect, 'error');
      assert.equal(options.referrerPolicy, 'no-referrer');
      assert.ok(!options.body.includes(article.url));
      const body = JSON.parse(options.body);
      assert.equal(body.stream, false);
      assert.equal(body.format.additionalProperties, false);
      assert.deepEqual(body.format.properties.recall.items.properties.evidence.enum, ['P1']);
      assert.deepEqual(body.format.properties.relevance.properties.evidence.items.enum, ['P1']);
      assert.equal(body.tools, undefined);
      assert.deepEqual(JSON.parse(body.messages[1].content), input);
      return response(ollamaReply(result));
    },
  });
  assert.deepEqual(await provider.generate(model, input, new AbortController().signal), result);
});

test('rejects malformed JSON envelopes, malformed model JSON, and incomplete output', async () => {
  const fixtures = [
    () => new Response('<html>invalid JSON</html>'),
    () => response({ done: true, message: { content: 'invalid JSON' } }),
    () => response({ ...ollamaReply(result), done_reason: 'length' }),
    () => response({ ...ollamaReply(result), remote_host: 'https://ollama.com' }),
  ];
  for (const fetcher of fixtures) {
    const provider = createOllamaProvider({ fetcher });
    await assert.rejects(provider.generate(model, input, new AbortController().signal), { code: 'invalid' });
  }
});

test('distinguishes connection, origin, busy, and unavailable model errors', async () => {
  const provider = createOllamaProvider({ fetcher: async () => { throw new TypeError('failed'); } });
  await assert.rejects(provider.listModels(), { code: 'connection' });
  for (const [status, code] of [[403, 'permission'], [404, 'model'], [429, 'busy'], [503, 'busy']]) {
    const unavailable = createOllamaProvider({ fetcher: async () => response({ error: 'fixture' }, status) });
    await assert.rejects(unavailable.generate(model, input, new AbortController().signal), { code });
  }
});

test('times out and cancels in-flight transport', async () => {
  const fetcher = async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  });
  const timed = createOllamaProvider({ fetcher, discoveryTimeout: 10 });
  await assert.rejects(timed.listModels(), { code: 'timeout' });
  const controller = new AbortController();
  const provider = createOllamaProvider({ fetcher });
  const pending = provider.generate(model, input, controller.signal);
  controller.abort();
  await assert.rejects(pending, { code: 'cancelled' });
  await assert.rejects(provider.listModels(controller.signal), { code: 'cancelled' });
});

test('caps the passages, indicates partial coverage, and requires a learning goal', () => {
  const prepared = prepareInput({ ...article, text: 'An original article. '.repeat(700) + 'Last sentence.' }, goal);
  assert.equal(prepared.partial, true);
  assert.equal(prepared.input.passages.length, 8);
  assert.ok(prepared.input.passages.every(({ text }) => text.length <= 400));
  assert.match(prepared.input.passages.at(-1).text, /Last sentence\.$/);
  assert.equal(prepareInput({ ...article, truncated: true }, goal).partial, true);
  assert.throws(() => prepareInput(article, '  '), { code: 'invalid' });
});

test('strictly validates shape, answer count, relevance category, and evidence', () => {
  assert.deepEqual(validateAnalysis(result, input.passages), result);
  for (const invalid of [
    { ...result, unrequested: true },
    { ...result, recall: result.recall.slice(0, 2) },
    { ...result, relevance: { ...result.relevance, level: 99 } },
    { ...result, recall: [result.recall[0], result.recall[0], result.recall[2]] },
    { ...result, concepts: [{ ...result.concepts[0], evidence: { passageId: 'P1', quote: 'A fabricated quote.' } }] },
    { ...result, recall: result.recall.map((item) => ({ ...item, quote: 'A fabricated quote.' })) },
  ]) {
    assert.throws(() => validateAnalysis(invalid, input.passages), { code: 'invalid' });
  }
});

function harness() {
  const entries = new Map();
  const provider = {
    id: 'ollama',
    listModels: async () => [model],
    calls: 0,
    async generate() {
      this.calls++;
      return result;
    },
  };
  return {
    entries, provider, article, goal, modelName: model.name, signal: new AbortController().signal,
    cache: {
      get: async (key) => entries.get(key),
      set: async (key, value) => { entries.set(key, value); },
    },
  };
}

test('reuses validated results and misses when article, goal, model, or provider changes', async () => {
  const args = harness();
  assert.equal((await analyzeArticle(args)).cached, false);
  assert.equal((await analyzeArticle(args)).cached, true);
  assert.equal(args.provider.calls, 1);
  assert.equal((await analyzeArticle({ ...args, goal: 'Plan a review' })).cached, false);
  assert.equal((await analyzeArticle({ ...args, article: { ...article, text: article.text + ' Additional source material.' } })).cached, false);
  args.provider.listModels = async () => [{ ...model, revision: 'next version' }];
  assert.equal((await analyzeArticle(args)).cached, false);
  args.provider.id = 'another-provider';
  assert.equal((await analyzeArticle(args)).cached, false);
  assert.equal(args.entries.size, 5);
  args.provider.listModels = async () => [];
  await assert.rejects(analyzeArticle(args), { code: 'model' });
});

test('bypasses corrupt cached entries and never caches invalid or cancelled responses', async () => {
  const args = harness();
  await analyzeArticle(args);
  const [key] = args.entries.keys();
  args.entries.set(key, { unexpected: true });
  assert.equal((await analyzeArticle(args)).cached, false);
  assert.deepEqual(args.entries.get(key), result);
  args.entries.clear();
  args.provider.generate = async () => ({ invalid: true });
  await assert.rejects(analyzeArticle(args), { code: 'invalid' });
  assert.equal(args.entries.size, 0);
  const controller = new AbortController();
  args.provider.generate = async () => {
    controller.abort();
    return result;
  };
  await assert.rejects(analyzeArticle({ ...args, signal: controller.signal }), { code: 'cancelled' });
  assert.equal(args.entries.size, 0);
});


test('normalizes harmless formatting in IDs and rejects absent or fabricated references', () => {
  const formatted = {
    ...result,
    relevance: { ...result.relevance, evidence: ['  p1\n'] },
    concepts: result.concepts.map((concept) => ({ ...concept, evidence: 'p1' })),
    recall: result.recall.map((item) => ({ ...item, evidence: '\tP1 ' })),
  };
  assert.deepEqual(validateAnalysis(formatted, input.passages), result);
  for (const id of ['P2', 'P9', 'P01', 'P 1', 'P1/P2', 'A made-up']) {
    const invalid = { ...result, recall: result.recall.map((item) => ({ ...item, evidence: id })) };
    assert.throws(() => validateAnalysis(invalid, input.passages), { code: 'evidence' });
  }
  assert.throws(() => validateAnalysis({
    ...result, relevance: { ...result.relevance, evidence: [] },
  }, input.passages), { code: 'evidence' });
});

test('keeps normalized passages contiguous, including overlong sentences with Unicode', () => {
  const text = 'The author’s claim.\n\n' + '🙂'.repeat(205) + ' Final words.';
  const { input: prepared, partial } = prepareInput({ ...article, text }, goal);
  const normalized = text.replace(/\s+/gu, ' ');
  assert.equal(partial, false);
  assert.ok(prepared.passages.length > 1);
  for (const { text: passage } of prepared.passages) {
    assert.ok(passage.length <= 400);
    assert.ok(passage.isWellFormed());
    assert.ok(normalized.includes(passage));
  }
  assert.match(prepared.passages[0].text, /author’s/);
});

test('repairs invalid evidence once and caches only the validated reply', async () => {
  const args = harness();
  const attempts = [];
  args.provider.generate = async (_model, _input, _signal, retry) => {
    attempts.push(retry);
    if (retry) return result;
    return { ...result, recall: result.recall.map((item) => ({ ...item, evidence: 'P9' })) };
  };
  let retries = 0;
  const output = await analyzeArticle({ ...args, onRetry: () => { retries++; } });
  assert.deepEqual(attempts, [undefined, 'evidence']);
  assert.equal(retries, 1);
  assert.equal(output.cached, false);
  assert.deepEqual(output.analysis, result);
  assert.deepEqual(output.passages, input.passages);
  assert.equal(args.entries.size, 1);
  assert.equal((await analyzeArticle(args)).cached, true);
  assert.equal(attempts.length, 2);
});

test('stops after the retry and explains persistent reference errors without caching them', async () => {
  const args = harness();
  const attempts = [];
  args.provider.generate = async (_model, _input, _signal, retry) => {
    attempts.push(retry);
    return { ...result, relevance: { ...result.relevance, evidence: ['P8'] } };
  };
  await assert.rejects(analyzeArticle(args), { code: 'evidence', message: /source references after two attempts/ });
  assert.deepEqual(attempts, [undefined, 'evidence']);
  assert.equal(args.entries.size, 0);
});

test('never retries a timeout or starts a retry after cancellation', async () => {
  const args = harness();
  let calls = 0;
  args.provider.generate = async () => {
    calls++;
    throw new AiError('timeout', 'Ollama timed out.');
  };
  await assert.rejects(analyzeArticle(args), { code: 'timeout' });
  assert.equal(calls, 1);
  const controller = new AbortController();
  args.provider.generate = async () => {
    calls++;
    return { ...result, relevance: { ...result.relevance, evidence: ['P8'] } };
  };
  await assert.rejects(analyzeArticle({
    ...args, signal: controller.signal, onRetry: () => controller.abort(),
  }), { code: 'cancelled' });
  assert.equal(calls, 2);
  assert.equal(args.entries.size, 0);
});
