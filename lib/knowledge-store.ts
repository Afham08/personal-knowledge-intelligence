import { browser } from 'wxt/browser';
import { emptyKnowledge, knowledgeKey, validKnowledge, type Knowledge } from './revision';
import {
  chunksFor,
  EMBED_MODEL,
  pack,
  pruneIndex,
  retrieve,
  VECTOR_LIMIT,
  type VectorIndex,
  type Chunk,
} from './retrieval';
import { ollamaProvider, OLLAMA_ORIGIN_PERMISSION } from './ai/ollama';
import { readAiSettings } from './ai/local-store';
import { readLibrary } from './library';

export async function readKnowledge() {
  const value = (await browser.storage.local.get(knowledgeKey))[knowledgeKey] ?? emptyKnowledge();
  if (!validKnowledge(value)) throw new Error('Study data could not be read.');
  return value;
}
export function changeKnowledge(change: (state: Knowledge) => void) {
  return navigator.locks.request(knowledgeKey, async () => {
    const data = await readKnowledge();
    change(data);
    await browser.storage.local.set({ [knowledgeKey]: data });
  });
}
const indexKey = 'pki.vector.v1';
async function readIndex(): Promise<VectorIndex> {
  return ((await browser.storage.local.get(indexKey))[indexKey] as VectorIndex) ?? { revision: '', rows: {} };
}
export async function allowed() {
  return (
    (await readAiSettings()).enabled &&
    (await browser.permissions.contains({ origins: [OLLAMA_ORIGIN_PERMISSION] }))
  );
}
async function embeddingRevision(signal: AbortSignal) {
  const model = (await ollamaProvider.listModels(signal)).find(
    (m) => m.name === EMBED_MODEL || m.name === 'nomic-embed-text',
  );
  if (!model) throw new Error('Install nomic-embed-text to build the optional index.');
  return model.revision;
}
export function cleanIndex() {
  return navigator.locks.request(indexKey, async () => {
    const old = await readIndex();
    const clean = pruneIndex(old, chunksFor(await readLibrary()), old.revision);
    if (Object.keys(clean.rows).length !== Object.keys(old.rows).length)
      await browser.storage.local.set({ [indexKey]: clean });
  });
}
export function clearIndex() {
  return navigator.locks.request(indexKey, () => browser.storage.local.remove(indexKey));
}
export async function indexStatus() {
  const index = await readIndex();
  return Object.keys(index.rows).length;
}
export function buildIndex(signal: AbortSignal, onProgress: (n: number) => void) {
  return navigator.locks.request(indexKey, { signal }, async () => {
    if (!(await allowed())) throw new Error('Enable local AI in Settings first.');
    const revision = await embeddingRevision(signal);
    const chunks = chunksFor(await readLibrary());
    const index = pruneIndex(await readIndex(), chunks, revision);
    const missing = chunks
      .filter((c) => !index.rows[c.id])
      .slice(0, VECTOR_LIMIT - Object.keys(index.rows).length);
    await browser.storage.local.set({ [indexKey]: index });
    for (let i = 0; i < missing.length; i += 4) {
      signal.throwIfAborted();
      const batch = missing.slice(i, i + 4);
      const vectors = await ollamaProvider.embed(
        batch.map((c) => 'search_document: ' + c.text),
        signal,
      );
      signal.throwIfAborted();
      batch.forEach((c, j) => {
        index.rows[c.id] = { text: c.text, vector: pack(vectors[j]!) };
      });
      await browser.storage.local.set({ [indexKey]: index });
      onProgress(Object.keys(index.rows).length);
    }
    return Object.keys(index.rows).length;
  });
}
export async function search(chunks: Chunk[], query: string, signal: AbortSignal, overview = false) {
  let index: VectorIndex | undefined, vector: number[] | undefined;
  if (await allowed())
    try {
      index = await readIndex();
      if (
        chunks.some((c) => index!.rows[c.id]?.text === c.text) &&
        index.revision === (await embeddingRevision(signal))
      ) {
        [vector] = await ollamaProvider.embed(['search_query: ' + query], signal);
      }
    } catch {
      signal.throwIfAborted();
    }
  signal.throwIfAborted();
  return {
    hits: retrieve(chunks, query, index, vector, overview),
    mode: vector ? 'Semantic and keyword' : 'Keyword',
  };
}
