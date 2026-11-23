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
      assert.equal(body.format.properties.concepts.maxItems, 2);
      assert.equal(body.format.properties.recall.maxItems, 3);
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
    [() => new Response('<html>invalid JSON</html>'), 'json'],
    [() => response({ done: true, message: { content: 'invalid JSON' } }), 'json'],
    [() => response({ ...ollamaReply(result), done_reason: 'length' }), 'truncated'],
    [() => response({ ...ollamaReply(result), done: false }), 'truncated'],
    [() => response({ ...ollamaReply(result), remote_host: 'https://ollama.com' }), 'model'],
  ];
  for (const [fetcher, code] of fixtures) {
    const provider = createOllamaProvider({ fetcher });
    await assert.rejects(provider.generate(model, input, new AbortController().signal), { code });
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
  const prepared = prepareInput({ ...article, text: Array.from({ length: 250 }, (_, index) => 'Section ' + index + ' describes a different idea and how it was used. ').join('') }, goal);
  assert.equal(prepared.partial, true);
  assert.equal(prepared.input.passages.length, 8);
  assert.ok(prepared.input.passages.every(({ text }) => text.length <= 400));
  assert.match(prepared.input.passages[0].text, /Section 0/);
  assert.match(prepared.input.passages.at(-1).text, /Section 2\d\d/);
  assert.equal(prepared.coverage.availablePassages > prepared.input.passages.length, true);
  assert.equal(prepared.coverage.suppliedCharacters,
    prepared.input.passages.reduce((length, passage) => length + passage.text.length, 0));
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

test('Qwen3 retries a reasoning-only length stop with more room and validates only final content', async () => {
  const args = harness();
  const requests = [];
  args.modelName = 'qwen3:4b';
  args.provider = createOllamaProvider({ fetcher: async (url, options) => {
    if (url.endsWith('/tags')) return response({ models: [{ name: args.modelName, size: 1, digest: 'fixture' }] });
    requests.push(JSON.parse(options.body));
    if (requests.length === 1) {
      return response({ done: true, done_reason: 'length', message: { thinking: JSON.stringify(result), content: '' } });
    }
    return response({ ...ollamaReply(result), message: { thinking: 'Not answer JSON.', content: JSON.stringify(result) } });
  } });
  assert.deepEqual((await analyzeArticle(args)).analysis, result);
  assert.equal(requests.length, 2);
  assert.ok(requests.every(body => body.think === false && body.format.type === 'object'));
  assert.ok(requests[1].options.num_predict > requests[0].options.num_predict);
  assert.equal(args.entries.size, 1);
});

test('exhausted analysis preserves the final diagnostic and does not cache partial output', async () => {
  for (const [reply, code, detail] of [
    [{ done: true, message: { content: '{' } }, 'json', /malformed JSON/],
    [ollamaReply({}), 'invalid', /schema/],
    [{ ...ollamaReply(result), done_reason: 'length' }, 'truncated', /token limit/],
    [{ done: true, message: { thinking: JSON.stringify(result), content: '' } }, 'invalid', /no final answer/],
  ]) {
    const args = harness();
    let calls = 0;
    args.provider = createOllamaProvider({ fetcher: async url => {
      if (url.endsWith('/tags')) return response({ models: [{ name: model.name, size: 1, digest: 'fixture' }] });
      calls++;
      return response(reply);
    } });
    await assert.rejects(analyzeArticle(args), { code, message: detail });
    assert.equal(calls, 2);
    assert.equal(args.entries.size, 0);
  }
});

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
  await assert.rejects(analyzeArticle(args), { code: 'evidence', message: /after two attempts.*passage/i });
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

test('prefers goal-related prose within long article sections without using the entire input budget for the lead', () => {
  const sentences = Array.from({ length: 22 }, (_, index) => {
    const ending = index === 15 ? 'Retrieval practice and retention provide useful evidence'
      : index === 16 ? 'Bibliography citation ISBN 1, retrieval practice and retention https://example.org'
      : 'The section describes its own separate background';
    return 'Section ' + index + ' ' + ('additional context about unique material and observations '.repeat(5)) + ending + '.';
  });
  const analysis = prepareInput({ ...article, title: 'Reference article', text: sentences.join(' ') }, 'Explore retrieval practice and retention');
  assert.equal(analysis.input.passages.length, 8);
  assert.ok(analysis.input.passages.some(({ text }) => text.includes('useful evidence')));
  assert.ok(analysis.input.passages.every(({ text }) => !text.includes('https://example.org')));
  assert.ok(analysis.input.passages.some(({ text }) => /Section (18|19|20|21)/.test(text)));
});
