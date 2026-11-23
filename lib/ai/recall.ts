import { AiError, checkCancelled, type AiModel, type Passage } from './provider.ts';
import { matchesSchema, object, text, type Schema } from './schema.ts';

export const MAX_RECALL_ANSWER_LENGTH = 1200;
const verdicts = ['Correct', 'Partially Correct', 'Incorrect', 'Unable to Assess'] as const;

export type RecallInput = {
  source: Passage[];
  question: string;
  expectedAnswer: string;
  learnerAnswer: string;
};

export type RecallFeedback = {
  verdict: typeof verdicts[number];
  explanation: string;
  understood: string;
  issues: string;
  improvement: string;
  evidence: Passage | undefined;
};

export interface LocalRecallProvider {
  id: 'ollama';
  listModels(signal?: AbortSignal): Promise<AiModel[]>;
  evaluate(model: AiModel, input: RecallInput, signal: AbortSignal): Promise<unknown>;
}

function feedbackSchema(sourceId: Schema, learnerQuote: Schema) {
  return object({
    learnerQuote,
    understood: text(180),
    issues: text(180),
    explanation: text(300),
    improvement: text(180),
    sourceId,
    verdict: { type: 'string', enum: verdicts },
  });
}

const sentences = new Intl.Segmenter(undefined, { granularity: 'sentence' });
const MAX_QUOTE_LENGTH = 160;

export function createRecallSchema(source: Passage[], learnerAnswer: string) {
  // Constrain the model to draft text selected by PKI, so it cannot rewrite its quote.
  const quotes = new Set<string>();
  for (const { segment } of sentences.segment(learnerAnswer)) {
    const quote = segment.trim().slice(0, MAX_QUOTE_LENGTH).replace(/[\uD800-\uDBFF]$/u, '').trimEnd();
    if (quote) quotes.add(quote);
    if (quotes.size === 4) break;
  }

  return feedbackSchema(
    { type: 'string', enum: source.map(({ id }) => id) },
    { type: 'string', enum: [...quotes] },
  );
}

type ModelFeedback = Omit<RecallFeedback, 'evidence'> & { learnerQuote: string; sourceId: string };

function normalized(text: string): string {
  return text.trim().replace(/\s+/gu, ' ').toLowerCase();
}

function parseOptionalText(text: string): string {
  return /^none\.?$/i.test(text.trim()) ? '' : text.trim();
}

export function validateRecallFeedback(value: unknown, source: Passage[], learnerAnswer: string): RecallFeedback {
  if (!matchesSchema(value, feedbackSchema(text(8), text(MAX_QUOTE_LENGTH)))) {
    throw new AiError('invalid', 'Ollama returned invalid answer feedback. Your draft is still available.');
  }
  const response = value as ModelFeedback;
  const evidence = source.find(({ id }) => id === response.sourceId.trim().toUpperCase());
  if (!evidence) {
    throw new AiError('evidence', 'Ollama referenced text outside the supplied passage. Your draft is still available.');
  }
  if (!normalized(learnerAnswer).includes(normalized(response.learnerQuote))) {
    throw new AiError('evidence', 'Ollama quoted words that could not be found in your draft. Your answer is still available.');
  }

  // Small models can acknowledge uncertainty in feedback while choosing a conclusive label.
  const reportsInsufficientSource =
    /\b(?:not|cannot be) (?:directly |explicitly )?(?:verified|confirmed|supported) (?:by|in|from) (?:the )?(?:source|passage|excerpt)\b/i
      .test(response.explanation + ' ' + response.issues);
  const verdict = reportsInsufficientSource ? 'Unable to Assess' : response.verdict;
  const understood = verdict === 'Incorrect' ? '' : parseOptionalText(response.understood);
  const issues = parseOptionalText(response.issues);
  if (verdict === 'Correct' && issues) {
    throw new AiError('invalid', 'Ollama marked the answer correct while reporting an issue. Your draft is still available.');
  }
  return {
    verdict,
    explanation: response.explanation,
    understood: understood || (verdict === 'Correct' ? response.explanation : ''),
    issues: issues || (verdict === 'Correct' ? '' : response.explanation),
    improvement: parseOptionalText(response.improvement) || 'Give one example that illustrates an idea supported by the source.',
    evidence,
  };
}

export async function checkRecallAnswer({
  question, expectedAnswer, answer, passage, modelName, provider, signal,
}: {
  question: string;
  expectedAnswer: string;
  answer: string;
  passage: Passage | undefined;
  modelName: string;
  provider: LocalRecallProvider;
  signal: AbortSignal;
}): Promise<RecallFeedback> {
  checkCancelled(signal);
  const learnerAnswer = answer.trim();
  if (!learnerAnswer || learnerAnswer.length > MAX_RECALL_ANSWER_LENGTH) {
    throw new AiError('invalid', 'Write an answer of 1 to ' + MAX_RECALL_ANSWER_LENGTH + ' characters first.');
  }

  const source = Array.from(sentences.segment(passage?.text.trim() ?? ''), ({ segment }, index) => ({
    id: 'S' + (index + 1),
    text: segment.trim(),
  })).filter(({ text }) => text);
  if (!source.length || !expectedAnswer.trim()) {
    return {
      verdict: 'Unable to Assess',
      explanation: 'This question has too little source material for an answer check.',
      understood: '',
      issues: '',
      improvement: 'Review the article and try another question with a source reference.',
      evidence: undefined,
    };
  }

  const model = (await provider.listModels(signal)).find(({ name }) => name === modelName);
  checkCancelled(signal);
  if (!model) throw new AiError('model', 'The selected model is unavailable. Choose an installed model in AI settings.');

  const response = await provider.evaluate(model, { source, question, expectedAnswer, learnerAnswer }, signal);
  checkCancelled(signal);
  return validateRecallFeedback(response, source, learnerAnswer);
}
