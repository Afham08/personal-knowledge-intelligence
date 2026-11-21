import type { ExtractedArticle } from '../article';
import { AiError, checkCancelled, type AiProvider, type AnalysisInput } from './provider.ts';
import { validateAnalysis, type Analysis } from './schema.ts';

// Bump when the prompt, input selection, generation settings, or response schema changes.
const ANALYSIS_VERSION = 1;
const MAX_PASSAGES = 5;

export interface AnalysisCache {
  get(key: string): Promise<unknown>;
  set(key: string, analysis: Analysis): Promise<void>;
}

export function prepareInput(article: ExtractedArticle, learningGoal: string) {
  const goal = learningGoal.trim().slice(0, 600);
  if (!goal) throw new AiError('invalid', 'Set a learning goal for the selected Knowledge Space first.');

  const normalized = article.text.replace(/\s+/g, ' ').trim();
  const chunks = normalized.match(/.{1,650}(?: |$)|.{1,650}/gu) ?? [];
  if (!chunks.length) throw new AiError('invalid', 'Extract a readable article first.');
  // Sample the beginning, middle, and end when the full text exceeds the request budget.
  const indexes = new Set(Array.from(
    { length: MAX_PASSAGES },
    (_, index) => Math.round(index * (chunks.length - 1) / (MAX_PASSAGES - 1)),
  ));
  const sampled = chunks.length <= MAX_PASSAGES ? chunks : chunks.filter((_, index) => indexes.has(index));
  const input: AnalysisInput = {
    title: article.title.slice(0, 300),
    goal,
    passages: sampled.map((text, index) => ({ id: 'P' + (index + 1), text: text.trim() })),
  };
  return { input, partial: article.truncated || sampled.length < chunks.length };
}

async function cacheKey(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const hashed = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(hashed, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function analyzeArticle({
  article, goal, modelName, provider, cache, signal,
}: {
  article: ExtractedArticle;
  goal: string;
  modelName: string;
  provider: AiProvider;
  cache: AnalysisCache;
  signal: AbortSignal;
}) {
  const { input, partial } = prepareInput(article, goal);
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
      return { analysis: validateAnalysis(stored, input.passages), cached: true, partial };
    } catch (error) {
      if (!(error instanceof AiError) || error.code !== 'invalid') throw error;
    }
  }

  const response = await provider.generate(model, input, signal);
  checkCancelled(signal);
  const analysis = validateAnalysis(response, input.passages);
  await cache.set(key, analysis).catch(() => undefined);
  checkCancelled(signal);
  return { analysis, cached: false, partial };
}
