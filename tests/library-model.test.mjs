import assert from 'node:assert/strict';
import { test } from 'node:test';

import { attachArticle, emptyLibrary, identifyArticle } from '../lib/library-model.ts';

const extracted = {
  url: 'https://example.org/article?id=12#heading',
  title: 'Article title',
  text: 'Plain text article',
  truncated: false,
};

test('stable article IDs ignore section anchors and preserve distinct page routes', async () => {
  const article = await identifyArticle(extracted);
  const same = await identifyArticle({ ...extracted, url: 'https://example.org/article?id=12#another' });
  const different = await identifyArticle({ ...extracted, url: 'https://example.org/article?id=13' });
  const hashRoute = await identifyArticle({ ...extracted, url: 'https://example.org/article?id=12#/another' });
  assert.equal(article.id, same.id);
  assert.notEqual(article.id, different.id);
  assert.notEqual(article.id, hashRoute.id);
  assert.equal(article.url, 'https://example.org/article?id=12');
  await assert.rejects(identifyArticle({ ...extracted, url: 'javascript:alert(1)' }));
  await assert.rejects(identifyArticle({ ...extracted, url: 'https://user:password@example.org/' }));
});

test('duplicate saves preserve the original text and note and reuse content across spaces', async () => {
  const article = await identifyArticle(extracted);
  const initial = {
    ...emptyLibrary,
    spaces: [
      { id: 'one', name: 'Space one', learningGoal: 'First goal' },
      { id: 'two', name: 'Space two', learningGoal: 'Second goal' },
    ],
  };
  const saved = attachArticle(initial, article, 'one', 'First note');
  const editedPage = { ...article, text: 'Updated page text' };
  assert.equal(attachArticle(saved, editedPage, 'one', 'Different note'), saved);
  const shared = attachArticle(saved, editedPage, 'two', 'Second note');
  assert.deepEqual(shared.articles, [article]);
  assert.deepEqual(shared.links.map(({ spaceId, note }) => [spaceId, note]), [
    ['one', 'First note'],
    ['two', 'Second note'],
  ]);
  assert.throws(() => attachArticle(saved, article, 'missing', ''));
});
