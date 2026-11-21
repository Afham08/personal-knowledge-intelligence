import type { ExtractedArticle } from '../article';
import { AiError, checkCancelled, type AiProvider, type AnalysisInput, type AnalysisRetry } from './provider.ts';
import { validateAnalysis, type Analysis } from './schema.ts';

// Bump when the prompt, input selection, generation settings, or response schema changes.
const ANALYSIS_VERSION = 2;
const MAX_PASSAGES = 8;
const LEAD_PASSAGES = 3;
const PASSAGE_LENGTH = 400;
const sentences = new Intl.Segmenter(undefined, { granularity: 'sentence' });

export interface AnalysisCache {
  get(key: string): Promise<unknown>;
  set(key: string, analysis: Analysis): Promise<void>;
}

function splitPassages(text: string): string[] {
  const normalized = text.replace(/\s+/gu, ' ').trim();
  const chunks: string[] = [];
  let start = 0;
  for (const { index, segment } of sentences.segment(normalized)) {
    const end = index + segment.length;
    if (end - start > PASSAGE_LENGTH && index > start) {
      chunks.push(normalized.slice(start, index).trim());
      start = index;
    }
    // An individual sentence can exceed the budget. Prefer its last full word.
    while (end - start > PASSAGE_LENGTH) {
      const limit = start + PASSAGE_LENGTH;
      const wordBoundary = normalized.lastIndexOf(' ', limit);
      const lastCodeUnit = normalized.charCodeAt(limit - 1);
      const splitsSurrogate = lastCodeUnit >= 0xd800 && lastCodeUnit <= 0xdbff;
      const stop = wordBoundary > start ? wordBoundary : limit - Number(splitsSurrogate);
      chunks.push(normalized.slice(start, stop));
      start = stop + Number(normalized[stop] === ' ');
    }
  }
  if (start < normalized.length) chunks.push(normalized.slice(start));
  return chunks;
}

export function prepareInput(article: ExtractedArticle, learningGoal: string) {
  const goal = learningGoal.trim().slice(0, 600);
  if (!goal) throw new AiError('invalid', 'Set a learning goal for the selected Knowledge Space first.');

  const chunks = splitPassages(article.text);
  if (!chunks.length) throw new AiError('invalid', 'Extract a readable article first.');

  // Keep the lead, then sample later sections to cover more than the introduction.
  const laterPassages = MAX_PASSAGES - LEAD_PASSAGES;
  const indexes = new Set(Array.from(
    { length: laterPassages },
    (_, index) => LEAD_PASSAGES + Math.round(index * (chunks.length - 1 - LEAD_PASSAGES) / (laterPassages - 1)),
  ));
  const sampled = chunks.length <= MAX_PASSAGES ? chunks : chunks.filter(
    (_, index) => index < LEAD_PASSAGES || indexes.has(index),
  );
  const input: AnalysisInput = {
    title: article.title.slice(0, 300),
    goal,
    passages: sampled.map((text, index) => ({ id: 'P' + (index + 1), text })),
  };
  return { input, partial: article.truncated || sampled.length < chunks.length };
}

async function cacheKey(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const hashed = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(hashed, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function retryReason(error: unknown): AnalysisRetry | undefined {
  if (!(error instanceof AiError)) return undefined;
  if (error.code === 'evidence') return 'evidence';
  if (error.code === 'invalid') return 'format';
  return undefined;
}

export async function analyzeArticle({
  article, goal, modelName, provider, cache, signal, onRetry,
}: {
  article: ExtractedArticle;
  goal: string;
  modelName: string;
  provider: AiProvider;
  cache: AnalysisCache;
  signal: AbortSignal;
  onRetry?: () => void;
}) {
  const { input, partial } = prepareInput(article, goal);
  const { passages } = input;
  checkCancelled(signal);
  const model = (await provider.listModels(signal)).find(({ name }) => name === modelName);
  checkCancelled(signal);
  if (!model) throw new AiError('model', 'The selected model is unavailable. Test the connection and select an installed model.');

  // Include the full article text locally so edits outside the sampled passages also invalidate a result.
  const key = await cacheKey([ANALYSIS_VERSION, provider.id, model, input, article.text, article.truncated]);
  const stored = await cache.get(key).catch(() => undefined);
  checkCancelled(signal);
  if (stored !== undefined) {
    try {
      return { analysis: validateAnalysis(stored, passages), passages, cached: true, partial };
    } catch (error) {
      if (!retryReason(error)) throw error;
    }
  }

  const generate = async (retry?: AnalysisRetry) => {
    checkCancelled(signal);
    const response = await provider.generate(model, input, signal, retry);
    checkCancelled(signal);
    return validateAnalysis(response, passages);
  };

  let analysis: Analysis;
  try {
    analysis = await generate();
  } catch (error) {
    checkCancelled(signal);
    const reason = retryReason(error);
    if (!reason) throw error;
    onRetry?.();
    try {
      analysis = await generate(reason);
    } catch (retryError) {
      checkCancelled(signal);
      const failure = retryReason(retryError);
      if (!failure) throw retryError;
      const problem = failure === 'evidence' ? 'valid source references' : 'a valid structured analysis';
      throw new AiError(failure === 'evidence' ? 'evidence' : 'invalid',
        'Ollama could not produce ' + problem + ' after two attempts. Try a shorter article or a different installed model.');
    }
  }

  await cache.set(key, analysis).catch(() => undefined);
  checkCancelled(signal);
  return { analysis, passages, cached: false, partial };
}
