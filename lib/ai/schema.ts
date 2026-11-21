import { AiError, isObject, type Passage } from './provider.ts';

const relevanceLevels = ['High', 'Medium', 'Low'] as const;

type Evidence = { passageId: string; quote: string };
export type Analysis = {
  relevance: {
    level: typeof relevanceLevels[number];
    alignment: string;
    topics: string[];
    limitations: string[];
    evidence: Evidence[];
  };
  summary: { overview: string; ideas: string[]; takeaways: string[] };
  concepts: { term: string; explanation: string; evidence: Evidence }[];
  recall: { question: string; answer: string; evidence: Evidence }[];
};

type Schema =
  | { type: 'string'; minLength: number; maxLength: number }
  | { type: 'string'; enum: readonly string[] }
  | { type: 'array'; items: Schema; minItems: number; maxItems: number }
  | { type: 'object'; properties: Record<string, Schema>; required: string[]; additionalProperties: false };

function text(maxLength: number, minLength = 1): Schema {
  return { type: 'string', minLength, maxLength };
}
function list(items: Schema, minItems: number, maxItems: number): Schema {
  return { type: 'array', items, minItems, maxItems };
}
function object(properties: Record<string, Schema>): Schema {
  return { type: 'object', properties, required: Object.keys(properties), additionalProperties: false };
}

const evidence = object({ passageId: text(8), quote: text(180, 12) });
export const analysisSchema = object({
  relevance: object({
    level: { type: 'string', enum: relevanceLevels },
    alignment: text(500),
    topics: list(text(100), 0, 5),
    limitations: list(text(240), 0, 3),
    evidence: list(evidence, 0, 3),
  }),
  summary: object({
    overview: text(600),
    ideas: list(text(200), 1, 4),
    takeaways: list(text(200), 1, 4),
  }),
  concepts: list(object({ term: text(90), explanation: text(240), evidence }), 1, 5),
  recall: list(object({ question: text(200), answer: text(240), evidence }), 3, 5),
});

function matchesSchema(value: unknown, schema: Schema): boolean {
  switch (schema.type) {
    case 'string':
      if (typeof value !== 'string') return false;
      if ('enum' in schema) return schema.enum.includes(value);
      return value.trim().length >= schema.minLength && value.length <= schema.maxLength;
    case 'array':
      return Array.isArray(value) && value.length >= schema.minItems && value.length <= schema.maxItems &&
        value.every((item) => matchesSchema(item, schema.items));
    case 'object':
      return isObject(value) && Object.keys(value).length === schema.required.length &&
        Object.entries(schema.properties).every(([key, field]) => Object.hasOwn(value, key) && matchesSchema(value[key], field));
  }
}

export function validateAnalysis(value: unknown, passages: Passage[]): Analysis {
  if (!matchesSchema(value, analysisSchema)) {
    throw new AiError('invalid', 'The model returned an invalid analysis. Try again or select a different model.');
  }

  const analysis = value as Analysis;
  const byId = new Map(passages.map(({ id, text }) => [id, text]));
  const citations = [
    ...analysis.relevance.evidence,
    ...analysis.concepts.map((concept) => concept.evidence),
    ...analysis.recall.map((item) => item.evidence),
  ];

  if ((analysis.relevance.level !== 'Low' && !analysis.relevance.evidence.length) ||
      citations.some(({ passageId, quote }) => !byId.get(passageId)?.includes(quote.trim()))) {
    throw new AiError('invalid', 'The model cited a passage or quote that could not be verified. Try again.');
  }

  const questions = analysis.recall.map(({ question }) => question.trim().replace(/\s+/g, ' ').toLowerCase());
  if (new Set(questions).size !== questions.length) {
    throw new AiError('invalid', 'The model repeated recall questions. Try again.');
  }
  return analysis;
}
