import type { Practice, StudyRecord } from './study';
import type { Turn } from './retrieval';
import { isObject } from './ai/provider.ts';

export const knowledgeKey = 'pki.knowledge.v1';
export const verdicts = ['Correct', 'Partially Correct', 'Incorrect', 'Unable to Assess'] as const;
export type Verdict = (typeof verdicts)[number];
export type Card = Practice & { id: string; concepts: string[] };
export type Rating = { id: string; cardId: string; at: number; verdict: Verdict; replaces?: string };
export type Knowledge = { turns: Turn[]; cards: Card[]; ratings: Rating[] };
export function emptyKnowledge(): Knowledge {
  return { turns: [], cards: [], ratings: [] };
}
export function cardId(p: Practice) {
  return JSON.stringify([p.spaceId, p.url, p.question, p.expected, p.passage]);
}
const str = (v: unknown, max: number) => typeof v === 'string' && v.length > 0 && v.length <= max;
function web(v: unknown) {
  try {
    const u = new URL(String(v));
    return /^https?:$/.test(u.protocol) && !u.username && !u.password;
  } catch {
    return false;
  }
}
export function validKnowledge(v: unknown): v is Knowledge {
  if (!isObject(v) || !Array.isArray(v.cards) || !Array.isArray(v.turns) || !Array.isArray(v.ratings))
    return false;
  const ids = new Set<string>();
  for (const c of v.cards) {
    if (
      !isObject(c) ||
      !str(c.spaceId, 100) ||
      !web(c.url) ||
      !str(c.question, 200) ||
      !str(c.expected, 240) ||
      !str(c.passage, 400) ||
      !str(c.goal, 600) ||
      !str(c.model, 256) ||
      !Array.isArray(c.concepts) ||
      c.concepts.length > 5 ||
      !c.concepts.every((x) => str(x, 90)) ||
      c.id !== cardId(c as Card) ||
      ids.has(c.id)
    )
      return false;
    ids.add(c.id);
  }
  const rated = new Set<string>();
  for (const r of v.ratings) {
    if (
      !isObject(r) ||
      !str(r.id, 100) ||
      rated.has(String(r.id)) ||
      !ids.has(String(r.cardId)) ||
      !Number.isSafeInteger(r.at) ||
      !verdicts.includes(r.verdict as Verdict) ||
      (r.replaces !== undefined && !str(r.replaces, 100))
    )
      return false;
    rated.add(String(r.id));
  }
  const turns = new Set<string>();
  for (const t of v.turns) {
    if (
      !isObject(t) ||
      !str(t.id, 100) ||
      turns.has(String(t.id)) ||
      !str(t.spaceId, 100) ||
      !Number.isSafeInteger(t.at) ||
      !str(t.question, 600) ||
      !str(t.model, 256) ||
      !Array.isArray(t.sources) ||
      t.sources.length > 6 ||
      !Array.isArray(t.claims) ||
      t.claims.length > 5 ||
      typeof t.limitation !== 'string' ||
      t.limitation.length > 400
    )
      return false;
    if (
      !t.sources.every(
        (s) =>
          isObject(s) && typeof s.id === 'string' && /^[0-9a-f]{64}\/(?:[nh][^/]{1,400}\/)?\d+$/.test(s.id) && str(s.text, 700),
      )
    )
      return false;
    const refs = new Set(t.sources.map((s) => s.id));
    if (
      !t.claims.every(
        (c) =>
          isObject(c) &&
          str(c.point, 400) &&
          Array.isArray(c.refs) &&
          c.refs.length > 0 &&
          c.refs.length <= 3 &&
          c.refs.every((r) => refs.has(r)),
      )
    )
      return false;
    turns.add(String(t.id));
  }
  return true;
}

export function revisionQueue(data: Knowledge, records: StudyRecord[]) {
  const cards = new Map(data.cards.map((c) => [c.id, c]));
  const attempts = new Map<string, Rating[]>();
  const add = (r: Rating) => {
    const list = attempts.get(r.cardId) ?? [];
    list.push(r);
    attempts.set(r.cardId, list);
  };
  for (const r of records) {
    if (r.kind === 'study') continue;
    const id = cardId(r);
    if (!cards.has(id))
      cards.set(id, {
        id,
        spaceId: r.spaceId,
        url: r.url,
        model: r.model,
        goal: r.goal,
        question: r.question,
        expected: r.expected,
        passage: r.passage,
        concepts: r.kind === 'assessment' ? r.concepts : [],
      });
    if (r.kind === 'assessment') add({ id: r.id, cardId: id, at: r.at, verdict: r.feedback.verdict });
  }
  for (const r of data.ratings) add(r);
  return [...cards.values()]
    .map((card) => {
      const all = (attempts.get(card.id) ?? []).sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
      const overrides = new Map(all.filter((r) => r.replaces).map((r) => [r.replaces, r.verdict]));
      let due = 0,
        streak = 0,
        latest: Verdict | undefined;
      const history = all.filter((r) => !r.replaces);
      for (const r of history) {
        const verdict = overrides.get(r.id) ?? r.verdict;
        if (verdict === 'Unable to Assess') continue;
        latest = verdict;
        const days =
          verdict === 'Correct' ? [3, 7, 14, 30][Math.min(streak, 3)]! : verdict === 'Incorrect' ? 1 : 2;
        streak = verdict === 'Correct' ? streak + 1 : 0;
        const next = new Date(r.at);
        next.setDate(next.getDate() + days);
        next.setHours(0, 0, 0, 0);
        due = next.getTime();
      }
      return { card, due, latest, history, overrides };
    })
    .sort((a, b) => a.due - b.due || a.card.id.localeCompare(b.card.id));
}
