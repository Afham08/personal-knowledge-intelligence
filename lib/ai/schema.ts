import { AiError, isObject, type Passage } from './provider.ts';

const relevanceLevels = ['High', 'Medium', 'Low'] as const;

export type Analysis = {
  relevance: {
    level: typeof relevanceLevels[number];
    alignment: string;
    topics: string[];
    limitations: string[];
    evidence: string[];
  };
  summary: { overview: string; ideas: string[]; takeaways: string[] };
  concepts: { term: string; explanation: string; evidence: string }[];
  recall: { question: string; answer: string; evidence: string }[];
};

export type Schema =
  | { type: 'string'; minLength: number; maxLength: number }
  | { type: 'string'; enum: readonly string[] }
  | { type: 'array'; items: Schema; minItems: number; maxItems: number }
  | { type: 'object'; properties: Record<string, Schema>; required: string[]; additionalProperties: false };

export function text(maxLength: number): Schema {
  return { type: 'string', minLength: 1, maxLength };
}
function list(items: Schema, minItems: number, maxItems: number): Schema {
  return { type: 'array', items, minItems, maxItems };
}
export function object(properties: Record<string, Schema>): Schema {
  return { type: 'object', properties, required: Object.keys(properties), additionalProperties: false };
}

export function createAnalysisSchema(passageIds?: readonly string[]) {
  const evidence: Schema = passageIds ? { type: 'string', enum: passageIds } : text(12);
  return object({
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
}

const responseShape = createAnalysisSchema();

export function matchesSchema(value: unknown, schema: Schema): boolean {
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
  if (!matchesSchema(value, responseShape)) {
    throw new AiError('invalid', 'The model returned an invalid analysis.');
  }

  const analysis = value as Analysis;
  const ids = new Set(passages.map(({ id }) => id));
  function reference(value: string): string {
    const id = value.trim().toUpperCase();
    if (!ids.has(id)) throw new AiError('evidence', 'The model referenced a passage that was not supplied.');
    return id;
  }

  if (analysis.relevance.level !== 'Low' && !analysis.relevance.evidence.length) {
    throw new AiError('evidence', 'The model omitted the source reference for its relevance assessment.');
  }

  const questions = analysis.recall.map(({ question }) => question.trim().replace(/\s+/g, ' ').toLowerCase());
  if (new Set(questions).size !== questions.length) {
    throw new AiError('invalid', 'The model repeated recall questions.');
  }

  return {
    relevance: { ...analysis.relevance, evidence: analysis.relevance.evidence.map(reference) },
    summary: analysis.summary,
    concepts: analysis.concepts.map((concept) => ({ ...concept, evidence: reference(concept.evidence) })),
    recall: analysis.recall.map((item) => ({ ...item, evidence: reference(item.evidence) })),
  };
}
