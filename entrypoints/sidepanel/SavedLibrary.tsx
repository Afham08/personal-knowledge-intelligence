import { useState } from 'react';

import type { ExtractedArticle } from '../../lib/article';
import { saveArticle, updateNote } from '../../lib/library';
import { MAX_NOTE, type KnowledgeSpace, type SpaceArticle } from '../../lib/library-model';
import type { AiSettings } from '../../lib/ai/local-store';
import { ArticleAnalysis } from './ArticleAnalysis';
import { Icon } from './Icon';
import { SaveStatus } from './SaveStatus';
import { articleHost, filterLibrary, studySpace, type LibraryEntry, type Route } from './navigation';
import { useDraft } from './useDraft';
import { useAction } from './useAction';

export function SaveArticle({ article, space, spaces, onSelect }: {
  article: ExtractedArticle; space: KnowledgeSpace; spaces: KnowledgeSpace[]; onSelect: (id: string) => void;
}) {
  const draft = useDraft('capture', article.url, space.id);
  const note = draft.value ?? '';
  const save = useAction();

  return (
    <form className="capture-save" onSubmit={(event) => {
      event.preventDefault();
      void save.run(async () => {
        const added = await saveArticle(space.id, article, note);
        if (added) draft.saved(note);
        return added ? 'Article saved to ' + space.name + '.'
          : 'This article is already in ' + space.name + '. You can edit its note in the library.';
      });
    }}>
      <label>Save to Knowledge Space
        <select value={space.id} onChange={(event) => onSelect(event.target.value)}>
          {spaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      <details className="disclosure capture-note">
        <summary>Add a note (optional)</summary>
        <label>Note
          <textarea value={note} maxLength={MAX_NOTE} placeholder="Add a thought to revisit later"
            onChange={(event) => draft.edit(event.target.value)} />
        </label>
      </details>
      <button className="button-primary" disabled={save.state.status === 'pending'}>Save article</button>
      <SaveStatus state={save.state} />
    </form>
  );
}

export function ArticleRow({ entry, onOpen, resume }: { entry: LibraryEntry; resume?: boolean; onOpen: () => void }) {
  const { article, memberships } = entry;
  return (
    <button className="list-row" data-article-id={article.id} type="button" onClick={onOpen}>
      <span className="row-icon"><Icon name="page" /></span>
      <span className="row-copy">
        <strong>{article.title}</strong>
        <small>{resume && 'Resume reading \u00b7 '}{articleHost(article.url) || 'Web article'}</small>
        <small className="row-spaces">{memberships.map(({ space }) => space.name).join(' · ')}</small>
      </span>
      <Icon name="arrow" />
    </button>
  );
}

type StudyOptions = {
  ai?: AiSettings;
  preferredSpace?: string;
  onSettings: () => void;
  onSpaces: (id: string) => void;
};

export function SavedLibrary({ entries, spaces, spaceFilter, onFilter, route, onOpen, onBack, onList, ...study }: StudyOptions & {
  entries: LibraryEntry[]; spaces: KnowledgeSpace[]; spaceFilter: string; onFilter: (id: string) => void;
  route: Route; onOpen: (id: string) => void; onList: () => void; onBack: () => void;
}) {
  const [query, setQuery] = useState('');
  if ('articleId' in route) {
    const entry = entries.find(({ article }) => article.id === route.articleId);
    return <ArticleDetail {...study} key={route.articleId} entry={entry} backTo={route.from} onBack={onBack} onList={onList} />;
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

function ArticleDetail({ entry, backTo, onBack, onList, ai, preferredSpace, onSettings, onSpaces }: StudyOptions & { entry: LibraryEntry | undefined; backTo: 'home' | 'library'; onList: () => void; onBack: () => void }) {
  const article = entry?.article;
  const [spaceId, setSpaceId] = useState(preferredSpace);
  const space = entry && studySpace(entry, spaceId);
  return (
    <>
      <div className="page-heading">
        <div className="section-heading"><button className="text-button back-button" type="button" onClick={onBack}>
          <Icon name="back" /> {backTo === 'home' ? 'Back to Home' : 'Back to Library'}
        </button>
          {backTo === 'home' && <button type="button" className="text-button" onClick={onList}>Library list</button>}
        </div>
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
          <details className="disclosure"><summary>Read saved text</summary><p className="article-text">{article.text}</p></details>
        </section>
        {ai?.enabled && space && <>
          {entry.memberships.length > 1 && <label>Study in Knowledge Space
            <select value={space.id} onChange={(event) => setSpaceId(event.target.value)}>
              {entry.memberships.map(({ space: member }) => <option key={member.id} value={member.id}>{member.name}</option>)}
            </select>
          </label>}
          <ArticleAnalysis key={JSON.stringify([space.id, space.learningGoal, ai.modelName])}
            article={article} goal={space.learningGoal} modelName={ai.modelName}
            onSpaces={() => onSpaces(space.id)} onSettings={onSettings} />
        </>}
        {ai && !ai.enabled && <button type="button" onClick={onSettings}>Set up local AI for recall practice</button>}
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
  const draft = useDraft('note', link.articleId, link.spaceId);
  const save = useAction();
  const note = draft.value ?? link.note;

  return (
    <form onSubmit={(event) => {
      event.preventDefault();
      void save.run(async () => {
        await updateNote(link.spaceId, link.articleId, note);
        draft.saved(note);
        return 'Note saved.';
      });
    }}>
      <label>Note for {spaceName}
        <textarea value={note} maxLength={MAX_NOTE} onChange={(event) => draft.edit(event.target.value)} />
      </label>
      <button disabled={save.state.status === 'pending' || note.trim() === link.note}>Save note</button>
      <SaveStatus state={save.state} />
    </form>
  );
}
