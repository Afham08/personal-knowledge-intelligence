import assert from 'node:assert/strict';
import { test } from 'node:test';
import { locate } from '../lib/anchors.ts';
import { assemblePages } from '../lib/documents.ts';
import { knowledgeGraph } from '../lib/graph.ts';
import { emptyLibrary, identifyArticle, attachArticle } from '../lib/library-model.ts';
import { chunksFor } from '../lib/retrieval.ts';
import { prepareInput } from '../lib/ai/analysis.ts';
import { fromStorage, parseBackup, mergeBackup } from '../lib/backup.ts';
import { markdownFiles, usage } from '../lib/portable.ts';
const pdf = await identifyArticle({
  url: 'https://pki.invalid/pdf/' + 'f'.repeat(64),
  title: 'Field report',
  ...assemblePages([
    { page: 1, text: 'Visits increased.' },
    { page: 3, text: 'Later fruit counts decreased.' },
  ]),
});
const web = await identifyArticle({
  url: 'https://example.org/notes',
  title: 'Orchard',
  text: 'Different blossoms open on different days.',
  truncated: false,
});
let lib = {
  ...emptyLibrary,
  spaces: ['a', 'b'].map((id) => ({ id, name: id, learningGoal: 'Learn botany' })),
};
lib = attachArticle(
  attachArticle(attachArticle(lib, pdf, 'a', 'compare counts'), web, 'a', 'field observations'),
  web,
  'b',
  'private alternative',
);
const h = {
  id: crypto.randomUUID(),
  articleId: web.id,
  spaceId: 'a',
  quote: 'blossoms',
  prefix: 'Different ',
  suffix: ' open',
  start: 10,
  note: 'phenology',
  color: 'mint',
};
lib.highlights = [h];
const backup = fromStorage({ 'pki.library': lib });
test('quote anchors recover moved text and reject ambiguous or missing locations', () => {
  assert.equal(locate('Extra. Different blossoms open today.', h), 17);
  assert.equal(locate('blossoms closed. Different blossoms open today.', h), 27);
  assert.equal(locate('Different blossoms open; Different blossoms open', h), undefined);
  assert.equal(locate('No exact quote.', h), undefined);
});
test('PDF page boundaries, scans and extraction caps', () => {
  assert.throws(() => assemblePages([{ page: 1, text: ' ' }]), /OCR/);
  assert.equal(assemblePages([{ page: 1, text: 'x'.repeat(100001) }]).text.length, 100000);
  assert.ok(prepareInput(pdf, 'Count fruit').input.passages.some((p) => p.text.startsWith('[Page 3]')));
  const chunks = chunksFor(lib, 'a');
  assert.ok(chunks.some((c) => c.title.includes('page 3') && c.text.includes('decreased')));
  assert.ok(chunks.some((c) => c.text.includes('phenology')));
  assert.ok(!chunks.some((c) => c.text.includes('private alternative')));
  assert.ok(!chunksFor(lib, 'b').some((c) => c.text.includes('phenology')));
});
test('annotation and page metadata survive backup merges; malformed anchors and page offsets are rejected', async () => {
  const incoming = await parseBackup(JSON.stringify(backup));
  assert.deepEqual(fromStorage(mergeBackup(fromStorage({}), incoming).data), incoming);
  assert.equal(mergeBackup(incoming, incoming).added, 0);
  for (const edit of [
    (b) => (b.library.articles[0].pages[0].start = 99),
    (b) => (b.library.highlights[0].spaceId = 'missing'),
  ]) {
    const bad = structuredClone(backup);
    edit(bad);
    await assert.rejects(parseBackup(JSON.stringify(bad)));
  }
});
test('graph distinguishes explicit and inferred edges; Markdown links resolve and scoped exports exclude other notes', async () => {
  const graph = knowledgeGraph(
    lib,
    [{ spaceId: 'a', url: pdf.url, concepts: ['Fruit set'], passage: 'Later fruit counts decreased.' }],
    'a',
  );
  assert.ok(graph.nodes.some((n) => n.kind === 'PDF'));
  assert.ok(graph.nodes.some((n) => n.kind === 'Highlight'));
  assert.ok(graph.edges.some((e) => e.inferred));
  assert.ok(graph.edges.some((e) => !e.inferred));
  const files = await markdownFiles(backup, 'a');
  assert.match(files['resources/' + pdf.id + '.md'], /Page 3/);
  assert.match(files['resources/' + web.id + '.md'], /phenology/);
  assert.doesNotMatch(Object.values(files).join(''), /private alternative/);
  assert.ok(files['spaces/space-1.md'].includes(pdf.id));
  assert.ok(usage(backup, {})['Articles and documents'] > 0);
});
