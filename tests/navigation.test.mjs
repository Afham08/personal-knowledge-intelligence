import assert from 'node:assert/strict';
import { test } from 'node:test';

import { articleHost, backFromArticle, destinations, filterLibrary, homeReading, libraryEntries, routeKey, studySpace } from '../entrypoints/sidepanel/navigation.ts';

const library = {
  version: 1,
  spaces: [
    { id: 'a', name: 'Learning Science', learningGoal: 'Build a recall habit' },
    { id: 'b', name: 'Computer Science', learningGoal: '' },
  ],
  articles: [
    { id: '1', title: 'Retrieval practice', url: 'https://www.example.org/recall', text: 'Fixture', truncated: false },
    { id: '2', title: 'The basics of indexing', url: 'https://docs.example.com/index', text: 'Fixture', truncated: false },
  ],
  links: [
    { spaceId: 'a', articleId: '1', note: 'First note' },
    { spaceId: 'b', articleId: '2', note: '' },
    { spaceId: 'b', articleId: '1', note: 'Different note' },
    { spaceId: 'unknown', articleId: '2', note: '' },
  ],
};

test('the four destinations remain stable and reading returns to the originating view', () => {
  assert.deepEqual(destinations, ['home', 'spaces', 'library', 'settings']);
  assert.deepEqual(backFromArticle({ view: 'library', articleId: '1', from: 'home' }), { view: 'home' });
  assert.deepEqual(backFromArticle({ view: 'library', articleId: '1', from: 'library' }), { view: 'library' });
});

test('recent view deduplicates articles without losing their separate space notes', () => {
  const entries = libraryEntries(library);
  assert.deepEqual(entries.map(({ article }) => article.id), ['1', '2']);
  assert.deepEqual(entries[0].memberships.map(({ space, link }) => [space.id, link.note]),
    [['b', 'Different note'], ['a', 'First note']]);
  assert.deepEqual(entries[1].memberships.map(({ space }) => space.id), ['b']);
  assert.equal(library.links[0].spaceId, 'a');
});

test('library search combines title, host or space with the selected space filter', () => {
  const entries = libraryEntries(library);
  const ids = (query, spaceId = '') => filterLibrary(entries, query, spaceId).map(({ article }) => article.id);
  assert.deepEqual(ids('  RETRIEVAL  '), ['1']);
  assert.deepEqual(ids('docs.example.com'), ['2']);
  assert.deepEqual(ids('computer science'), ['1', '2']);
  assert.deepEqual(ids('indexing', 'a'), []);
  assert.deepEqual(ids('', 'a'), ['1']);
  assert.equal(articleHost(library.articles[0].url), 'example.org');
  assert.equal(articleHost('invalid'), '');
});

test('saved study uses a linked goal even when the active space is unrelated', () => {
  const [entry] = libraryEntries(library);
  assert.equal(studySpace(entry, 'a').learningGoal, 'Build a recall habit');
  assert.equal(studySpace(entry, 'unrelated').id, 'b');
  assert.equal(studySpace({ ...entry, memberships: [] }), undefined);
});

test('reading positions distinguish the list and each article across entry points', () => {
  const reader = { view: 'library', articleId: '1', from: 'home' };
  assert.equal(routeKey(reader), routeKey({ ...reader, from: 'library' }));
  assert.notEqual(routeKey(reader), routeKey({ view: 'library' }));
  assert.notEqual(routeKey(reader), routeKey({ ...reader, articleId: '2' }));
});

test('Home offers the open reader once even when it is older than the recent saves', () => {
  const entries = ['1', '2', '3', '4'].map(id => ({ article: { id }, memberships: [] }));
  assert.deepEqual(homeReading(entries, '4'), [entries[3], entries[0], entries[1]]);
  assert.deepEqual(homeReading(entries, '1'), entries.slice(0, 3));
  assert.deepEqual(homeReading(entries, 'missing'), entries.slice(0, 3));
});
