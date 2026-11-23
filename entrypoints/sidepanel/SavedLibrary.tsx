import { useState } from 'react';

import type { ExtractedArticle } from '../../lib/article';
import { saveArticle, updateNote } from '../../lib/library';
import { MAX_NOTE, type KnowledgeSpace, type SpaceArticle } from '../../lib/library-model';
import { Icon } from './Icon';
import { SaveStatus } from './SaveStatus';
import { articleHost, filterLibrary, type LibraryEntry, type Route } from './navigation';
import { releaseSavedDraft } from './panel-state';
import { useAction } from './useAction';

export function SaveArticle({ article, space, onSpaces }: {
  article: ExtractedArticle; space: KnowledgeSpace; onSpaces: () => void;
}) {
  const [note, setNote] = useState('');
  const save = useAction();

  return (
    <form className="capture-save" onSubmit={(event) => {
      event.preventDefault();
      void save.run(async () => {
        const added = await saveArticle(space.id, article, note);
        return added ? 'Article saved to ' + space.name + '.'
          : 'This article is already in ' + space.name + '. You can edit its note in the library.';
      });
    }}>
      <div className="section-heading">
        <p className="save-destination">Save to <strong>{space.name}</strong></p>
        <button className="text-button" type="button" onClick={onSpaces}>Change space</button>
      </div>
      <details className="disclosure capture-note">
        <summary>Add a note (optional)</summary>
        <label>Note
          <textarea value={note} maxLength={MAX_NOTE} placeholder="Add a thought to revisit later"
            onChange={(event) => setNote(event.target.value)} />
        </label>
      </details>
      <button className="button-primary" disabled={save.state.status === 'pending'}>Save article</button>
      <SaveStatus state={save.state} />
    </form>
  );
}

export function ArticleRow({ entry, onOpen }: { entry: LibraryEntry; onOpen: () => void }) {
  const { article, memberships } = entry;
  return (
    <button className="list-row" type="button" onClick={onOpen}>
      <span className="row-icon"><Icon name="page" /></span>
      <span className="row-copy">
        <strong>{article.title}</strong>
        <small>{articleHost(article.url) || 'Web article'}</small>
        <small className="row-spaces">{memberships.map(({ space }) => space.name).join(' · ')}</small>
      </span>
      <Icon name="arrow" />
    </button>
  );
}

export function SavedLibrary({ entries, spaces, spaceFilter, onFilter, route, onOpen, onBack }: {
  entries: LibraryEntry[]; spaces: KnowledgeSpace[]; spaceFilter: string; onFilter: (id: string) => void;
  route: Route; onOpen: (id: string) => void; onBack: () => void;
}) {
  const [query, setQuery] = useState('');
  if ('articleId' in route) {
    const entry = entries.find(({ article }) => article.id === route.articleId);
    return <ArticleDetail key={route.articleId} entry={entry} backTo={route.from} onBack={onBack} />;
  }

  const filtered = filterLibrary(entries, query, spaceFilter);
  return (
    <>
      <div className="page-heading">
        <h1 data-page-heading tabIndex={-1}>Library</h1>
        <p>Read saved articles and revisit the notes you left.</p>
      </div>
      {entries.length > 0 && (
        <section className="card library-filters" aria-label="Filter saved articles">
          <label>Search articles
            <input type="search" placeholder="Title, site, or space" value={query}
              onChange={(event) => setQuery(event.target.value)} />
          </label>
          <label>Knowledge Space
            <select value={spaceFilter} onChange={(event) => onFilter(event.target.value)}>
              <option value="">All spaces</option>
              {spaces.map((space) => <option key={space.id} value={space.id}>{space.name}</option>)}
            </select>
          </label>
        </section>
      )}
      <section className="card" aria-labelledby="saved-articles">
        <div className="section-heading"><h2 id="saved-articles">Saved articles</h2>
          <span className="metadata" aria-live="polite">{filtered.length} {filtered.length === 1 ? 'article' : 'articles'}</span></div>
        {filtered.length > 0 ? (
          <ul className="row-list">{filtered.map((entry) => (
            <li key={entry.article.id}><ArticleRow entry={entry} onOpen={() => onOpen(entry.article.id)} /></li>
          ))}</ul>
        ) : <p className="empty-copy">{entries.length
          ? 'No articles match these filters. Try another search or choose All spaces.'
          : 'Save your first article from Home. It will appear here with any notes you add.'}</p>}
      </section>
    </>
  );
}

function ArticleDetail({ entry, backTo, onBack }: { entry: LibraryEntry | undefined; backTo: 'home' | 'library'; onBack: () => void }) {
  const article = entry?.article;
  return (
    <>
      <div className="page-heading">
        <button className="text-button back-button" type="button" onClick={onBack}>
          <Icon name="back" /> {backTo === 'home' ? 'Back to Home' : 'Back to Library'}
        </button>
        <h1 data-page-heading tabIndex={-1}>{article?.title ?? 'Article unavailable'}</h1>
        {article && <p>{articleHost(article.url)} · {article.text.length.toLocaleString()} characters saved</p>}
      </div>
      {article && entry && <>
        <section className="card" aria-labelledby="saved-reading">
          <div className="section-heading"><h2 id="saved-reading">Reading</h2>
            <a className="text-button" href={article.url} target="_blank" rel="noopener noreferrer">
              Open original <Icon name="external" />
            </a></div>
          {article.truncated && <p>The saved text contains the first 100,000 characters.</p>}
          <details className="disclosure" open><summary>Read saved text</summary><p className="article-text">{article.text}</p></details>
        </section>
        <section className="card" aria-labelledby="saved-notes">
          <h2 id="saved-notes">Notes by space</h2>
          {entry.memberships.map(({ link, space }) => (
            <details className="disclosure" key={space.id} open={entry.memberships.length === 1 || undefined}>
              <summary>{space.name}</summary>
              <NoteEditor link={link} spaceName={space.name} />
            </details>
          ))}
        </section>
      </>}
    </>
  );
}

function NoteEditor({ link, spaceName }: { link: SpaceArticle; spaceName: string }) {
  const [draft, setDraft] = useState<string>();
  const save = useAction();
  const note = draft ?? link.note;

  return (
    <form onSubmit={(event) => {
      event.preventDefault();
      void save.run(async () => {
        await updateNote(link.spaceId, link.articleId, note);
        setDraft((current) => releaseSavedDraft(current, note));
        return 'Note saved.';
      });
    }}>
      <label>Note for {spaceName}
        <textarea value={note} maxLength={MAX_NOTE} onChange={(event) => setDraft(event.target.value)} />
      </label>
      <button disabled={save.state.status === 'pending' || note.trim() === link.note}>Save note</button>
      <SaveStatus state={save.state} />
    </form>
  );
}
