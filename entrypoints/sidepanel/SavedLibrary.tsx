import { useState } from 'react';

import { saveArticle, updateNote } from '../../lib/library';
import { MAX_NOTE, type KnowledgeSpace, type Library, type SavedArticle, type SpaceArticle } from '../../lib/library-model';
import type { ExtractedArticle } from '../../lib/article';
import { SaveStatus } from './SaveStatus';
import { useAction } from './useAction';
import { releaseSavedDraft } from './panel-state';

export function SaveArticle({ article, space }: { article: ExtractedArticle; space: KnowledgeSpace }) {
  const [note, setNote] = useState('');
  const save = useAction();

  return (
    <form onSubmit={(event) => {
      event.preventDefault();
      void save.run(async () => {
        const added = await saveArticle(space.id, article, note);
        return added
          ? 'Article saved to ' + space.name + '.'
          : 'This article is already in ' + space.name + '. You can edit its note in the library.';
      });
    }}>
      <label>
        Note for {space.name} (optional)
        <textarea value={note} maxLength={MAX_NOTE} onChange={(event) => setNote(event.target.value)} />
      </label>
      <button disabled={save.state.status === 'pending'}>Save article</button>
      <SaveStatus state={save.state} />
    </form>
  );
}

export function SavedLibrary({ library, space }: { library: Library; space: KnowledgeSpace | undefined }) {
  const links = library.links.filter((link) => link.spaceId === space?.id);
  const byId = new Map(library.articles.map((article) => [article.id, article]));

  return (
    <section aria-labelledby="library">
      <h2 id="library">Saved articles</h2>
      {!space && <p>Create a Knowledge Space to start a library.</p>}
      {space && links.length === 0 && <p>No articles saved in {space.name} yet.</p>}
      {links.length !== 0 && (
        <ul>
          {links.map((link) => {
            const article = byId.get(link.articleId);
            return article && (
              <li key={article.id}><SavedArticleItem article={article} link={link} /></li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function SavedArticleItem({ article, link }: { article: SavedArticle; link: SpaceArticle }) {
  const [draft, setDraft] = useState<string>();
  const save = useAction();
  const note = draft ?? link.note;

  return (
    <details>
      <summary>{article.title}</summary>
      <p><a href={article.url} target="_blank" rel="noopener noreferrer">Open original article</a></p>
      {article.truncated && <p>The saved text contains the first 100,000 characters.</p>}
      <p className="article-text">{article.text}</p>
      <form onSubmit={(event) => {
        event.preventDefault();
        void save.run(async () => {
          await updateNote(link.spaceId, link.articleId, note);
        setDraft((current) => releaseSavedDraft(current, note));
          return 'Note saved.';
        });
      }}>
        <label>
          Note
          <textarea value={note} maxLength={MAX_NOTE} onChange={(event) => setDraft(event.target.value)} />
        </label>
        <button disabled={save.state.status === 'pending' || note.trim() === link.note}>Save note</button>
        <SaveStatus state={save.state} />
      </form>
    </details>
  );
}
