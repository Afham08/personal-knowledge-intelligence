import type { RecallFeedback } from './ai/recall';

export const STUDY_PREFIX = 'pki.study.';
export type StudyContext = { spaceId: string; url: string; model: string; goal: string };
export type Practice = StudyContext & { question: string; expected: string; passage: string };
export type StudyRecord =
  | (StudyContext & { kind: 'study' })
  | (Practice & { kind: 'draft'; answer: string })
  | (Practice & { kind: 'assessment'; id: string; at: number; answer: string; feedback: RecallFeedback; concepts: string[] });

export function studyKey(r: StudyRecord) {
  if (r.kind === 'assessment') return STUDY_PREFIX + 'assessment.' + r.id;
  const identity = [r.kind, r.spaceId, r.url, r.model, r.goal];
  if (r.kind === 'draft') identity.push(r.question, r.expected, r.passage);
  return STUDY_PREFIX + JSON.stringify(identity);
}

export function sameQuestion(a: Practice, b: Practice) {
  return a.spaceId === b.spaceId && a.url === b.url && a.model === b.model && a.goal === b.goal &&
    a.question === b.question && a.expected === b.expected && a.passage === b.passage;
}

export function spaceProgress(records: StudyRecord[], spaceId: string) {
  const local = records.filter(r => r.spaceId === spaceId);
  const attempts = new Set<string>();
  const articles = new Set<string>();
  const history = local.filter(r => r.kind === 'assessment').sort((a, b) => b.at - a.at);
  const revision = new Set<string>();
  const reviewed = new Set<string>();
  for (const r of local) {
    articles.add(r.url);
    if (r.kind === 'study') continue;
    const key = studyKey({ ...r, kind: 'draft' });
    attempts.add(key);
  }
  for (const r of history) {
    const key = studyKey({ ...r, kind: 'draft' });
    if (reviewed.has(key)) continue;
    reviewed.add(key);
    if (r.feedback.verdict === 'Partially Correct' || r.feedback.verdict === 'Incorrect') {
      for (const concept of r.concepts) revision.add(concept);
    }
  }
  return { articles: articles.size, attempts: attempts.size, history, revision: [...revision] };
}
