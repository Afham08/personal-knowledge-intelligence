import type { ExtractedArticle } from '../article';
import { AiError, checkCancelled, type AiProvider, type AnalysisInput, type AnalysisRetry } from './provider.ts';
import { validateAnalysis, type Analysis } from './schema.ts';

// Bump when the prompt, input selection, generation settings, or response schema changes.
const ANALYSIS_VERSION = 3;
const MAX_PASSAGES = 8;
const LEAD_PASSAGES = 2;
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

const commonWords = new Set(['about', 'also', 'and', 'article', 'could', 'does', 'explain', 'from', 'have',
  'into', 'learn', 'more', 'overview', 'that', 'their', 'the', 'this', 'understand', 'what', 'which', 'with', 'would']);

function terms(text: string): Set<string> {
  return new Set((text.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []).filter((word) => !commonWords.has(word)));
}

function selectPassages(chunks: string[], goal: string, title: string): string[] {
  if (chunks.length <= MAX_PASSAGES) return chunks;
  const goalTerms = terms(goal);
  const titleTerms = terms(title);
  const seen = new Set<string>();
  const unique = chunks.filter((chunk) => {
    const key = chunk.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (unique.length <= MAX_PASSAGES) return unique;

  const body = unique.slice(LEAD_PASSAGES);
  const bands = MAX_PASSAGES - LEAD_PASSAGES;
  const representatives = Array.from({ length: bands }, (_, band) => {
    const start = Math.floor(band * body.length / bands);
    const end = Math.floor((band + 1) * body.length / bands);
    const midpoint = (start + end - 1) / 2;
    return body.slice(start, end).map((text, offset) => {
      let score = 0;
      for (const word of terms(text)) {
        score += goalTerms.has(word) ? 3 : Number(titleTerms.has(word));
      }
      const bibliography = /^(?:references|external links|bibliography)\b|\b(?:ISBN|doi:|retrieved from)\b|https?:\/\//i.test(text);
      return { text, score: Math.min(score, 24) - (bibliography ? 10 : 0), distance: Math.abs(start + offset - midpoint) };
    }).sort((first, second) => second.score - first.score || first.distance - second.distance)[0]?.text;
  });
  return [...unique.slice(0, LEAD_PASSAGES), ...representatives.filter((text): text is string => text !== undefined)];
}

export function prepareInput(article: ExtractedArticle, learningGoal: string) {
  const goal = learningGoal.trim().slice(0, 600);
  if (!goal) throw new AiError('invalid', 'Set a learning goal for the selected Knowledge Space first.');

  const chunks = splitPassages(article.text);
  if (!chunks.length) throw new AiError('invalid', 'Extract a readable article first.');

  const sampled = selectPassages(chunks, goal, article.title);
  const input: AnalysisInput = {
    title: article.title.slice(0, 300),
    goal,
    passages: sampled.map((text, index) => ({ id: 'P' + (index + 1), text })),
  };
  return {
    input,
    partial: article.truncated || sampled.length < chunks.length,
    coverage: {
      extractedCharacters: article.text.length,
      extractionTruncated: article.truncated,
      availablePassages: chunks.length,
      suppliedCharacters: sampled.reduce((size, text) => size + text.length, 0),
    },
  };
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
  const { input, partial, coverage } = prepareInput(article, goal);
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
      return { analysis: validateAnalysis(stored, passages), passages, cached: true, partial, coverage };
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
  return { analysis, passages, cached: false, partial, coverage };
}
