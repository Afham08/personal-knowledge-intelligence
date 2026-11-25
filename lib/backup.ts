import {isDocument} from './documents.ts';
import { colors, type Annotation } from './anchors.ts';
import { emptyKnowledge, knowledgeKey, validKnowledge, type Knowledge } from './revision.ts';
import { emptyLibrary, identifyArticle, type Library } from './library-model.ts';
import { createAnalysisSchema, matchesSchema } from './ai/schema.ts';
import { isObject } from './ai/provider.ts';
import { studyKey, type StudyRecord } from './study.ts';

export const BACKUP_LIMIT = 12 * 1024 * 1024;
export const libraryKey = 'pki.library';
export const cacheKey = 'pki.ai.cache.v1';
type Dict = Record<string, unknown>;
export type Backup = { format: 'PKI'; version: 2; knowledge: Knowledge; index: {model: 'nomic-embed-text:latest'; rebuild: true}; library: Library; study: StudyRecord[]; cache: Dict };

function requireValue(condition: unknown): asserts condition {
  if (!condition) throw new Error('Invalid or incompatible PKI data. The restore was cancelled.');
}
function string(v: unknown, max: number, empty = false): v is string {
  return typeof v === 'string' && v.length <= max && (empty || v.trim().length > 0);
}
function webUrl(v: unknown): v is string {
  if (!string(v, BACKUP_LIMIT)) return false;
  try { const url = new URL(v); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password; }
  catch { return false; }
}
function unique<T>(rows: T[], key: (r: T) => string) {
  requireValue(new Set(rows.map(key)).size === rows.length);
}
export function validateLibrary(v: unknown): Library {
  requireValue(isObject(v) && v.version === 1 && Array.isArray(v.spaces) && Array.isArray(v.articles) && Array.isArray(v.links));
  const spaces = v.spaces.map(s => {
    requireValue(isObject(s) && string(s.id, 100) && string(s.name, 80) && string(s.learningGoal, 600, true));
    return { id: s.id, name: s.name, learningGoal: s.learningGoal };
  });
  const articles = v.articles.map(a => {
    requireValue(isObject(a) && string(a.id, 64) && webUrl(a.url) && string(a.title, 300) && string(a.text, 100000) && typeof a.truncated === 'boolean');
    const value={ id:a.id,url:a.url,title:a.title,text:a.text,truncated:a.truncated };
    if(a.pages===undefined)return value;
    requireValue(isDocument(a.url)&&Array.isArray(a.pages)&&a.pages.length>0&&a.pages.length<=500);
    let last=-1,lastPage=0;
    const pages=a.pages.map(p=>{
      requireValue(isObject(p)&&Number.isInteger(p.page)&&Number(p.page)>lastPage&&Number(p.page)<=500&&Number.isInteger(p.start)&&Number(p.start)>last&&Number(p.start)<value.text.length);
      last=Number(p.start);lastPage=Number(p.page);return {page:lastPage,start:last};
    });
    requireValue(pages[0]?.start===0);return {...value,pages};
  });
  const spaceIds = new Set(spaces.map(s => s.id));
  const articleIds = new Set(articles.map(a => a.id));
  const links = v.links.map(l => {
    requireValue(isObject(l) && typeof l.spaceId === 'string' && spaceIds.has(l.spaceId) && typeof l.articleId === 'string' && articleIds.has(l.articleId) && string(l.note, 4000, true));
    return { spaceId: l.spaceId, articleId: l.articleId, note: l.note };
  });
  unique(spaces, s => s.id); unique(articles, a => a.id); unique(links, linkKey);
  let highlights: Annotation[]|undefined;
  if(v.highlights!==undefined){
    requireValue(Array.isArray(v.highlights));
    highlights=v.highlights.map(h=>{
      requireValue(isObject(h)&&typeof h.id==='string'&&/^[a-f0-9-]{36}$/.test(h.id)&&typeof h.spaceId==='string'&&typeof h.articleId==='string'&&links.some(l=>l.spaceId===h.spaceId&&l.articleId===h.articleId)&&string(h.quote,4000)&&string(h.note,4000,true)&&string(h.prefix,48,true)&&string(h.suffix,48,true)&&Number.isSafeInteger(h.start)&&Number(h.start)>=0&&colors.includes(h.color as Annotation['color']));
      return {id:h.id,articleId:h.articleId,spaceId:h.spaceId,quote:h.quote,start:Number(h.start),prefix:h.prefix,suffix:h.suffix,color:h.color as Annotation['color'],note:h.note};
    });
    unique(highlights,h=>h.id);
  }
  return { version: 1, spaces, articles, links,...(highlights?{highlights}:{}) };
}
function linkKey(l: Library['links'][number]) { return JSON.stringify([l.spaceId, l.articleId]); }
export function validStudy(r: unknown): r is StudyRecord {
  if (!isObject(r) || !string(r.spaceId, 100) || !webUrl(r.url) || !string(r.model, 256) || !string(r.goal, 600)) return false;
  if (r.kind === 'study') return true;
  if (!string(r.question, 200) || !string(r.expected, 240) || !string(r.passage, 400) || !string(r.answer, 1200, true)) return false;
  if (r.kind === 'draft') return true;
  const f = r.feedback;
  return r.kind === 'assessment' && string(r.id, 100) && Number.isSafeInteger(r.at) && Number.isFinite(new Date(Number(r.at)).getTime()) &&
    Array.isArray(r.concepts) && r.concepts.length <= 5 && r.concepts.every(c => string(c, 90)) &&
    isObject(f) && typeof f.verdict === 'string' && ['Correct','Partially Correct','Incorrect','Unable to Assess'].includes(String(f.verdict)) &&
    string(f.explanation, 300) && string(f.understood, 300, true) && string(f.issues, 300, true) && string(f.improvement, 180) &&
    (f.evidence == null || (isObject(f.evidence) && string(f.evidence.id, 8) && string(f.evidence.text, 400) && r.passage.includes(f.evidence.text)));
}

export function fromStorage(data: Dict): Backup {
  const knowledge=data[knowledgeKey]??emptyKnowledge();
  requireValue(validKnowledge(knowledge));
  return { format: 'PKI', version: 2, index: {model:'nomic-embed-text:latest',rebuild:true}, knowledge, library: validateLibrary(data[libraryKey] ?? emptyLibrary),
    study: Object.entries(data).filter(([k]) => k.startsWith('pki.study.')).map(([,r]) => {
      requireValue(validStudy(r)); return r;
    }), cache: (data[cacheKey] ?? {}) as Dict };
}
export async function parseBackup(raw: string): Promise<Backup> {
  requireValue(raw.length <= BACKUP_LIMIT);
  const v: unknown = JSON.parse(raw);
  requireValue(isObject(v) && v.format === 'PKI' && (v.version === 1 || v.version === 2) && Array.isArray(v.study) && isObject(v.cache));
  const library = validateLibrary(v.library);
  for (const article of library.articles) requireValue((await identifyArticle(article)).id === article.id);
  const study = v.study;
  requireValue(study.every(validStudy));
  unique(study, studyKey);
  const spaces = new Set(library.spaces.map(s => s.id));
  requireValue(study.every(r => spaces.has(r.spaceId)));
  requireValue(Object.keys(v.cache).length <= 30);
  for (const [key, item] of Object.entries(v.cache)) {
    requireValue(/^[a-f0-9]{64}$/.test(key) && isObject(item));
    if ('analysis' in item) {
      requireValue(string(item.fingerprint, 64) && /^[a-f0-9]{64}$/.test(item.fingerprint) && isObject(item.model) &&
        string(item.model.name, 256) && string(item.model.revision, 256) && string(item.goal, 600) &&
        [4, 5].includes(Number(item.version)) && typeof item.version === 'number' && Number.isSafeInteger(item.savedAt));
    }
    requireValue(matchesSchema(item.analysis ?? item, createAnalysisSchema()));
  }
  const knowledge=v.version===1 ? emptyKnowledge() : v.knowledge;
  requireValue(validKnowledge(knowledge) && knowledge.cards.every(c=>spaces.has(c.spaceId)) && knowledge.turns.every(t=>spaces.has(t.spaceId)));
  return { format: 'PKI', version: 2, index: {model:'nomic-embed-text:latest',rebuild:true}, knowledge, library, study, cache: v.cache };
}

export function mergeBackup(local: Backup, incoming: Backup) {
  let added = 0, kept = 0;
  function merge<T>(existing: T[], extra: T[], key: (row: T) => string, limit = Infinity) {
    const rows = new Map(existing.map(row => [key(row), row]));
    for (const row of extra) {
      if (rows.has(key(row)) || rows.size >= limit) { kept++; continue; }
      rows.set(key(row), row); added++;
    }
    return [...rows.values()];
  }
  const library: Library = { version: 1,
    spaces: merge(local.library.spaces, incoming.library.spaces, s => s.id),
    articles: merge(local.library.articles, incoming.library.articles, a => a.id),
    links: merge(local.library.links, incoming.library.links, linkKey) };
  if(local.library.highlights||incoming.library.highlights)library.highlights=merge(local.library.highlights??[],incoming.library.highlights??[],h=>h.id);
  const study = merge(local.study, incoming.study, studyKey);
  const cache = Object.fromEntries(merge(Object.entries(local.cache), Object.entries(incoming.cache), ([key]) => key, 30));
  const knowledge:Knowledge={
    turns:merge(local.knowledge.turns,incoming.knowledge.turns,t=>t.id),
    cards:merge(local.knowledge.cards,incoming.knowledge.cards,c=>c.id),
    ratings:merge(local.knowledge.ratings,incoming.knowledge.ratings,r=>r.id),
  };
  return { added, kept, data: { [knowledgeKey]:knowledge, [libraryKey]: library, [cacheKey]: cache, ...Object.fromEntries(study.map(r => [studyKey(r), r])) } };
}
