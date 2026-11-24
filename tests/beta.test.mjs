import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fromStorage, mergeBackup, parseBackup } from '../lib/backup.ts';
import { identifyArticle, attachArticle, emptyLibrary } from '../lib/library-model.ts';
import { spaceProgress, studyKey } from '../lib/study.ts';
import { analyzeArticle, reopenReview, prepareInput } from '../lib/ai/analysis.ts';

const article = await identifyArticle({ title: 'Orchard study', url: 'https://example.org/orchard',
  text: 'Observers counted bee visits. Fruit set differed among branches.', truncated: false });
const ctx = { spaceId: 'orchard', model: 'qwen3:4b', goal: 'Understand fruit set', url: article.url };
const library = attachArticle({ ...emptyLibrary, spaces: [{ id: ctx.spaceId, name: 'Orchard', learningGoal: ctx.goal }] }, article, ctx.spaceId, 'Compare branches');
const analysis = {
  relevance: { level: 'High', topics: [], limitations: [], alignment: 'Compares fruit set.', evidence: ['P1'] },
  summary: { overview: 'Branches varied.', ideas: ['Count visits.'], takeaways: ['Compare branches.'] },
  concepts: [{term: 'Fruit set', explanation: 'The observed outcome.', evidence: 'P1'}],
  recall: ['What was counted?', 'What was compared?', 'What differed?'].map((question,i) => ({ question, answer: ['Bee visits.','Branches.','Fruit set.'][i], evidence: 'P1' })),
};
const draft = { ...ctx, kind: 'draft', question: analysis.recall[0].question, expected: 'Bee visits.', passage: article.text, answer: 'Visits.' };
const assessment = { ...draft, kind: 'assessment', at: 12345, id: 'assessment-1', concepts: ['Fruit set'],
  feedback: { verdict: 'Partially Correct', understood: 'Visits', issues: 'Identify bees.', explanation: 'Identify the visitors.', improvement: 'Name the insect.', evidence: {id:'S1',text:'Observers counted bee visits.'} } };
test('previous-format cache can be adopted with the original model digest and reopened offline', async () => {
  const model = {name: ctx.model, revision: 'original-digest'};
  const {input} = prepareInput(article, ctx.goal, 4);
  const bytes = new TextEncoder().encode(JSON.stringify([4, 'ollama', model, input, article.text, article.truncated]));
  const key = Buffer.from(await crypto.subtle.digest('SHA-256', bytes)).toString('hex');
  let promoted;
  const result = await analyzeArticle({article, goal: ctx.goal, modelName: ctx.model, signal: new AbortController().signal,
    provider: {id:'ollama', listModels:async()=>[model], generate:async()=>assert.fail('unexpected inference')},
    cache: {get:async k=>k===key ? analysis : undefined, set:async(k,_a,r)=>{assert.equal(k,key); promoted=r;}}});
  assert.equal(result.cached,true);
  assert.equal(promoted.version,4);
  assert.deepEqual((await reopenReview(article,promoted)).passages,input.passages);
});

const empty = fromStorage({});
const backup = { ...empty, library, study: [{ ...ctx, kind: 'study' }, draft, assessment] };

test('backup round trip restores the original library, drafts and assessments; repeated import is idempotent', async () => {
  const incoming = await parseBackup(JSON.stringify(backup));
  const first = mergeBackup(empty, incoming);
  const restored = fromStorage(first.data);
  assert.deepEqual(restored, backup);
  assert.equal(mergeBackup(restored, incoming).added, 0);
  restored.library.links[0].note = 'Edited after backup';
  assert.equal(mergeBackup(restored, incoming).data['pki.library'].links[0].note, 'Edited after backup');
  assert.equal(first.data[studyKey(draft)].answer, 'Visits.');
  const p = spaceProgress(restored.study, ctx.spaceId);
  assert.deepEqual([p.articles, p.attempts, p.history.length, p.revision], [1, 1, 1, ['Fruit set']]);
  const corrected = { ...assessment, at: 12500, id: 'next', feedback: {...assessment.feedback, verdict: 'Correct'} };
  assert.deepEqual(spaceProgress([...restored.study, corrected], ctx.spaceId).revision, []);
  assert.equal(spaceProgress(restored.study, 'another').articles, 0);
});

test('rejects unsafe URLs, changed IDs, missing assignments, malformed feedback and incompatible imports', async () => {
  for (const mutate of [
    b => { b.version = 2; }, b => { b.library.articles[0].url = 'javascript:void(0)'; },
    b => { b.library.articles[0].url += '/other'; }, b => { b.library.links[0].spaceId = 'unknown'; },
    b => { b.study[2].feedback.evidence.text = 'Fabricated.'; }, b => { b.cache = { '__bad': {} }; },
  ]) {
    const b = structuredClone(backup); mutate(b); await assert.rejects(parseBackup(JSON.stringify(b)));
  }
});

test('validated review opens offline and checks the original content and references after restore', async () => {
  let review;
  const args = { article, goal: ctx.goal, modelName: ctx.model, signal: new AbortController().signal,
    provider: { id:'ollama', listModels: async () => [{name:ctx.model,revision:'digest'}], generate:async()=>analysis },
    cache: {get:async()=>undefined, set:async(_k,_a,r)=>{ review=r; }} };
  await analyzeArticle(args);
  const restored = await parseBackup(JSON.stringify({...backup,cache:{['0'.repeat(64)]:review}}));
  const result = await reopenReview(article, Object.values(restored.cache)[0]);
  assert.deepEqual(result.analysis, analysis);
  assert.deepEqual(result.passages, prepareInput(article,ctx.goal).input.passages);
  assert.equal(result.model.name, ctx.model); assert.equal(result.goal, ctx.goal);
  await assert.rejects(reopenReview({...article,text:'Other text.'},review));
  const wrong = structuredClone(review); wrong.analysis.recall[0].evidence='P99';
  await assert.rejects(reopenReview(article,wrong),{code:'evidence'});
});

test('duplicate explanations are collapsed after validating every source reference', async () => {
  let attempts=0;
  const repeated = {...analysis, concepts:[analysis.concepts[0],{...analysis.concepts[0],term:'Another'}]};
  const args = {article,goal:ctx.goal,modelName:ctx.model,signal:new AbortController().signal,
    provider:{id:'ollama',listModels:async()=>[{name:ctx.model,revision:'1'}],generate:async()=>{attempts++;return repeated;}},
    cache:{get:async()=>undefined,set:async()=>{}}};
  assert.equal((await analyzeArticle(args)).analysis.concepts.length,1);
  assert.equal(attempts,1);
  repeated.concepts[1].evidence='P97';
  await assert.rejects(analyzeArticle(args), {code:'evidence'});
  assert.equal(attempts,3);
});
