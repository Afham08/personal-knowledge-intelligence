import type { Library } from './library-model';
import { isObject } from './ai/provider.ts';

export type Chunk = {
  id: string;
  articleId: string;
  title: string;
  url: string;
  start: number;
  text: string;
};
export const EMBED_MODEL = 'nomic-embed-text:latest';
export const VECTOR_LIMIT = 512;
export type VectorIndex = { revision: string; rows: Record<string, { text: string; vector: string }> };
export function chunksFor(library: Library, space?: string): Chunk[] {
  const allowed = new Set(
    library.links
      .filter((link) => space === undefined || link.spaceId === space)
      .map((link) => link.articleId),
  );
  const chunks: Chunk[] = [];
  for (const a of library.articles) {
    if (!allowed.has(a.id)) continue;
    let start = 0;
    while (start < a.text.length) {
      const window = a.text.slice(start, start + 700);
      let length = window.length;
      if (start + length < a.text.length) {
        const breaks = [...window.matchAll(/[.!?]\s+|\n+/gu)];
        const boundary = breaks.at(-1);
        const pos = boundary ? boundary.index + boundary[0].length : 0;
        const space = window.lastIndexOf(' ') + 1;
        length = pos >= 260 ? pos : space > 0 ? space : length;
      }
      const text = a.text.slice(start, start + length);
      if (text.trim())
        chunks.push({ id: a.id + '/' + start, articleId: a.id, title: a.title, url: a.url, start, text });
      start += length;
    }
  }
  return chunks;
}

export function pack(vector: number[]) {
  const scale = Math.max(...vector.map(Math.abs));
  if (!scale || !Number.isFinite(scale) || vector.length > 2048) throw new Error('Invalid embedding.');
  return btoa(String.fromCharCode(...vector.map((x) => Math.round((127 * x) / scale) + 128)));
}

function cosine(packed: string, query: number[]) {
  const bytes = atob(packed);
  if (bytes.length !== query.length) return 0;
  let dot = 0,
    norm = 0,
    qnorm = 0;
  for (let i = 0; i < bytes.length; i++) {
    const x = bytes.charCodeAt(i) - 128,
      y = query[i]!;
    dot += x * y;
    norm += x * x;
    qnorm += y * y;
  }
  return dot / (Math.sqrt(norm * qnorm) || 1);
}

export function pruneIndex(index: VectorIndex, chunks: Chunk[], revision: string): VectorIndex {
  const rows: VectorIndex['rows'] = {};
  if (revision === index.revision)
    for (const c of chunks) {
      const row = index.rows[c.id];
      if (row?.text === c.text) rows[c.id] = row;
    }
  return { revision, rows };
}

const stop = new Set(
  'the a of is what in are an how does that and with for to this me from which why can two about my these articles space have'.split(
    ' ',
  ),
);
function terms(text: string) {
  return new Set((text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => !stop.has(w)));
}
export function retrieve(
  chunks: Chunk[],
  query: string,
  index?: VectorIndex,
  vector?: number[],
  overview = false,
) {
  const words = terms(query);
  const scored = chunks
    .map((chunk, i) => {
      const tokens = terms(chunk.title + ' ' + chunk.text);
      const lexical = [...words].filter((w) => tokens.has(w)).length / Math.max(1, words.size);
      const row = index?.rows[chunk.id];
      const semantic = vector && row?.text === chunk.text ? cosine(row.vector, vector) : 0;
      return { chunk, score: lexical + (semantic >= 0.48 ? semantic : 0), i };
    })
    .filter((r) => r.score > 0 || overview)
    .sort((a, b) => b.score - a.score || a.i - b.i);
  const selected: Chunk[] = [];
  const seen = new Set<string>();
  for (const { chunk } of scored)
    if (!seen.has(chunk.articleId) && selected.length < 5) {
      selected.push(chunk);
      seen.add(chunk.articleId);
    }
  for (const { chunk } of scored) if (selected.length < 6 && !selected.includes(chunk)) selected.push(chunk);
  return selected;
}

export type Claim = { point: string; refs: string[] };
export type Turn = {
  id: string;
  spaceId: string;
  at: number;
  question: string;
  model: string;
  claims: Claim[];
  limitation: string;
  sources: { id: string; text: string }[];
};
export function validateAnswer(raw: unknown, sources: Chunk[], question = '') {
  if (
    !isObject(raw) ||
    !Array.isArray(raw.claims) ||
    raw.claims.length > 5 ||
    typeof raw.limitation !== 'string' ||
    raw.limitation.length > 400
  )
    throw new Error('Invalid answer structure. Retry your question.');
  const claims = raw.claims.map((c) => {
    if (
      !isObject(c) ||
      typeof c.point !== 'string' ||
      !c.point.trim() ||
      c.point.length > 400 ||
      !Array.isArray(c.refs) ||
      !c.refs.length ||
      c.refs.length > 3
    )
      throw new Error('A claim lacked evidence. Retry your question.');
    const refs = c.refs.map((ref) => {
      const i = typeof ref === 'string' && /^P[1-6]$/.test(ref) ? Number(ref.slice(1)) - 1 : -1;
      if (!sources[i]) throw new Error('A passage reference could not be verified. Retry your question.');
      return sources[i].id;
    });
    return { point: c.point, refs: [...new Set(refs)] };
  });
  if (!claims.length && !raw.limitation.trim())
    throw new Error('Missing explanation of insufficient evidence.');
  // A numerical result cannot be grounded in excerpts containing no amounts.
  const asksAmount =
    /\b(exact|numerical|measured|observed)\b.*\b(percentage|percent|number|rate|amount|value)\b/i.test(
      question,
    );
  if (
    asksAmount &&
    !sources.some((s) =>
      /\d|\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|half|quarter)\b/i.test(s.text),
    )
  ) {
    return {
      claims: [],
      limitation: 'The retrieved excerpts do not give a numerical answer to this question.',
    };
  }
  return { claims, limitation: raw.limitation };
}
