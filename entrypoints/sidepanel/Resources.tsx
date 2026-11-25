import { useEffect, useRef, useState } from 'react';
import type { Library } from '../../lib/library-model';
import { saveArticle, updateLibrary } from '../../lib/library';
import { annotateCurrent } from '../../lib/annotation-actions';
import { colors, type Annotation } from '../../lib/anchors';
import { chunksFor, type Chunk } from '../../lib/retrieval';
import { search, readKnowledge } from '../../lib/knowledge-store';
import { getActiveTab } from '../../lib/active-tab';
import { extractFromTab } from '../../lib/extract-from-tab';
import { useAction } from './useAction';
import { SaveStatus } from './SaveStatus';
type Props = { library: Library; space: string; open: (id: string) => void };
export function PageTools({ library, space, open }: Props) {
  const action = useAction();
  const busy = action.state.status === 'pending';
  const [color, setColor] = useState<Annotation['color']>('gold'),
    [note, setNote] = useState('');
  const [related, setRelated] = useState<Chunk[]>([]),
    [concepts, setConcepts] = useState<string[]>([]);
  const name = library.spaces.find((s) => s.id === space)?.name;
  return (
    <details className="card">
      <summary>Highlights and related knowledge</summary>
      <p>Selected space: {name ?? 'Choose a space first'}. Page access lasts for the current tab grant.</p>
      <label>
        Highlight color
        <select value={color} onChange={(e) => setColor(e.target.value as Annotation['color'])}>
          {colors.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <label>
        Annotation
        <textarea value={note} maxLength={4000} onChange={(e) => setNote(e.target.value)} />
      </label>
      <button
        disabled={!space || busy}
        onClick={() =>
          void action.run(async () => {
            await annotateCurrent(space, color, note, true);
            setNote('');
            return 'Saved. ' + (await annotateCurrent(space, color, '', false));
          })
        }
      >
        Save selected text
      </button>
      <button disabled={busy} onClick={() => void action.run(() => annotateCurrent(space, color, '', false))}>
        Restore highlights on this page
      </button>
      <button
        disabled={busy}
        onClick={() =>
          void action.run(async () => {
            const tab = await getActiveTab();
            if (!tab) throw new Error('Open a readable page and click PKI.');
            const page = await extractFromTab(tab);
            const result = await search(
              chunksFor(library).filter((c) => c.url !== page.url),
              page.title + ' ' + page.text.slice(0, 450),
              new AbortController().signal,
            );
            setRelated(result.hits);
            const urls = new Set(result.hits.map((c) => c.url));
            setConcepts([
              ...new Set(
                (await readKnowledge()).cards.filter((c) => urls.has(c.url)).flatMap((c) => c.concepts),
              ),
            ]);
            return result.mode + ' · ' + result.hits.length + ' related passages.';
          })
        }
      >
        Find related knowledge
      </button>
      {related.map((c) => (
        <details key={c.id}>
          <summary>{c.title}</summary>
          <p>{c.text}</p>
          <small>
            {library.links
              .filter((l) => l.articleId === c.articleId)
              .map((l) => library.spaces.find((s) => s.id === l.spaceId)?.name)
              .join(' · ')}
          </small>
          <button onClick={() => open(c.articleId)}>Open resource</button>
        </details>
      ))}
      {!!concepts.length && <p>Studied concepts: {concepts.join(', ')}</p>}
      <SaveStatus state={action.state} />
    </details>
  );
}
export function ImportPdf({ space, library, open }: Props) {
  const action = useAction();
  const request = useRef<AbortController>(undefined);
  useEffect(() => () => request.current?.abort(), []);
  return (
    <details className="card">
      <summary>Import local PDF</summary>
      <p>
        Save selectable text in {library.spaces.find((s) => s.id === space)?.name ?? 'a Knowledge Space'}. The
        original file stays on your device. Limits: 20 MiB, 500 pages and 100,000 extracted characters.
      </p>
      <label>
        Choose PDF
        <input
          type="file"
          accept=".pdf,application/pdf"
          disabled={!space || action.state.status === 'pending'}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            void action.run(async () => {
              const controller = new AbortController();
              request.current = controller;
              try {
                const { extractPdf } = await import('../../lib/import-pdf');
                const a = await extractPdf(file, controller.signal);
                controller.signal.throwIfAborted();
                const result = await saveArticle(space, a, '');
                open(result.articleId);
                return 'Document saved.';
              } finally {
                request.current = undefined;
              }
            });
          }}
        />
      </label>
      {action.state.status === 'pending' && (
        <button onClick={() => request.current?.abort()}>Cancel import</button>
      )}
      <SaveStatus state={action.state} />
    </details>
  );
}
function HighlightEditor({ h }: { h: Annotation }) {
  const [note, setNote] = useState(h.note),
    [color, setColor] = useState(h.color);
  const action = useAction();
  return (
    <>
      <label>
        Color
        <select value={color} onChange={(e) => setColor(e.target.value as Annotation['color'])}>
          {colors.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <label>
        Personal note
        <textarea value={note} maxLength={4000} onChange={(e) => setNote(e.target.value)} />
      </label>
      <button
        onClick={() =>
          void action.run(async () => {
            await updateLibrary((l) => ({
              ...l,
              highlights: l.highlights?.map((x) => (x.id === h.id ? { ...x, note, color } : x)),
            }));
            return 'Updated. Restore on the page to repaint.';
          })
        }
      >
        Save highlight edits
      </button>
      <button
        onClick={() => {
          if (confirm('Delete this highlight and its note?'))
            void action.run(async () => {
              await updateLibrary((l) => ({ ...l, highlights: l.highlights?.filter((x) => x.id !== h.id) }));
              return 'Deleted.';
            });
        }}
      >
        Delete highlight
      </button>
      <SaveStatus state={action.state} />
    </>
  );
}
export function HighlightList({ library, space }: Props) {
  const rows = (library.highlights ?? []).filter((h) => !space || h.spaceId === space);
  return (
    <details className="card">
      <summary>Saved highlights ({rows.length})</summary>
      {!rows.length && <p>Select text on a webpage and save it from Home.</p>}
      {rows.map((h) => {
        const a = library.articles.find((a) => a.id === h.articleId);
        return (
          <details key={h.id}>
            <summary>{h.quote.slice(0, 90)}</summary>
            <blockquote>{h.quote}</blockquote>
            <p>{library.spaces.find((s) => s.id === h.spaceId)?.name}</p>
            {a && (
              <a href={a.url} target="_blank" rel="noopener noreferrer">
                {a.title}
              </a>
            )}
            <HighlightEditor h={h} />
          </details>
        );
      })}
    </details>
  );
}
