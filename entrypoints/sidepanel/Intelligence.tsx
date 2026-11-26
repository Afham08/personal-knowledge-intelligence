import {tutorialAction} from '../../lib/tutorial';
import { useEffect, useMemo, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import type { Library } from '../../lib/library-model';
import { readLibrary } from '../../lib/library';
import {
  allowed,
  buildIndex,
  clearIndex,
  changeKnowledge,
  indexStatus,
  readKnowledge,
  search,
} from '../../lib/knowledge-store';
import { chunksFor, validateAnswer, type Chunk, type Turn } from '../../lib/retrieval';
import { ollamaProvider } from '../../lib/ai/ollama';
import { emptyKnowledge, knowledgeKey, revisionQueue, verdicts, type Verdict } from '../../lib/revision';
import { useStudy } from './useStudy';

export function useKnowledge() {
  const [data, setData] = useState(emptyKnowledge);
  const [error, setError] = useState('');
  useEffect(() => {
    let version = 0;
    function refresh() {
      const id = ++version;
      void readKnowledge()
        .then((v) => {
          if (id === version) setData(v);
        })
        .catch(() => {
          if (id === version) setError('Stored knowledge could not be loaded.');
        });
    }
    const changed = (changes: Record<string, unknown>, area: string) => {
      if (area === 'local' && knowledgeKey in changes) refresh();
    };
    browser.storage.onChanged.addListener(changed);
    refresh();
    return () => {
      version++;
      browser.storage.onChanged.removeListener(changed);
    };
  }, []);
  return { data, error };
}
function useTask() {
  const request = useRef<AbortController>(undefined);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  useEffect(
    () => () => {
      request.current?.abort();
      request.current = undefined;
    },
    [],
  );
  async function run(action: (signal: AbortSignal) => Promise<string>) {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setMessage('');
    try {
      const text = await action(controller.signal);
      if (request.current === controller) setMessage(text);
    } catch (e) {
      if (request.current === controller)
        setMessage(
          controller.signal.aborted
            ? 'Cancelled. You can retry.'
            : e instanceof Error
              ? e.message
              : 'Operation failed. Try again.',
        );
    } finally {
      if (request.current === controller) {
        request.current = undefined;
        setBusy(false);
      }
    }
  }
  return { busy, message, run, cancel: () => request.current?.abort() };
}
function Source({ chunk, open }: { chunk: Chunk; open: (id: string) => void }) {
  return (
    <details className="source-reference">
      <summary>
        {chunk.title} · character {chunk.start + 1}
      </summary>
      <p>{chunk.text}</p>
      <button onClick={() => open(chunk.articleId)}>Open saved article</button>{' '}
      {!chunk.url.startsWith('https://pki.invalid/pdf/') && <a href={chunk.url} target="_blank" rel="noopener noreferrer">
        Original page
      </a>}
    </details>
  );
}
const insights = {
  'Recurring concepts': 'Identify recurring concepts across these articles.',
  'Related articles': 'Which articles address a related topic, and how?',
  'Complementary explanations': 'Which two explanations complement each other?',
  'Potential contradictions':
    'Do two articles make conflicting claims under the same conditions? Explain uncertainty.',
  'Further study': 'Suggest a topic for further study based on a gap in these excerpts.',
};
export function SpaceChat({
  library,
  space,
  model,
  open,
}: {
  library: Library;
  space: string;
  model: string;
  open: (id: string) => void;
}) {
  const { data, error } = useKnowledge(),
    task = useTask();
  const [question, setQuestion] = useState(''),
    [insight, setInsight] = useState<keyof typeof insights>('Recurring concepts');
  const chunks = useMemo(() => chunksFor(library, space), [library, space]);
  const history = data.turns.filter((t) => t.spaceId === space).sort((a, b) => b.at - a.at);
  async function ask(q: string, overview: boolean, signal: AbortSignal) {
    if (!(await allowed()) || !model)
      throw new Error('Enable local AI and select a generation model in Settings.');
    const { hits, mode } = await search(
      chunks,
      q,
      signal,
      overview || /summari[sz]e|collected|most important|learn next|simple language/i.test(q),
    );
    let answer: { claims: Turn['claims']; limitation: string } = {
      claims: [],
      limitation: 'The saved material did not yield a relevant passage.',
    };
    if (hits.length) {
      const raw = await ollamaProvider.ask(
        model,
        q,
        hits.map((c) => c.title + '\n' + c.text),
        history
          .slice(0, 2)
          .reverse()
          .map((t) => t.question),
        signal,
      );
      answer = validateAnswer(raw, hits, q);
      if (overview && insight !== 'Further study') {
        answer.claims = answer.claims.filter(
          (c) => new Set(c.refs.map((r) => hits.find((h) => h.id === r)?.articleId)).size >= 2,
        );
        if (!answer.claims.length)
          answer.limitation = 'The response did not establish a connection using two different articles.';
      }
    }
    signal.throwIfAborted();
    const current = chunksFor(await readLibrary(), space);
    if (hits.some((h) => !current.some((c) => c.id === h.id && c.text === h.text)))
      throw new Error('The source material changed. Retry your question.');
    await changeKnowledge((d) => {
      signal.throwIfAborted();
      const previous = d.turns.filter((t) => t.spaceId === space).sort((a, b) => a.at - b.at);
      if (previous.length >= 30) d.turns = d.turns.filter((t) => t.id !== previous[0]!.id);
      d.turns.push({
        ...answer,
        id: crypto.randomUUID(),
        at: Date.now(),
        question: q,
        spaceId: space,
        model,
        sources: hits.map(({ id, text }) => ({ id, text })),
      });
    });
    if(!overview) tutorialAction('chat');return mode + ' retrieval · ' + hits.length + ' excerpts considered.';
  }
  return (
    <section className="card" data-tour="chat">
      <h2>Study this space</h2><p>Ask about the resources saved in this space. Open a cited passage to check the answer.</p>
      <label>
        Ask about your articles
        <textarea maxLength={600} value={question} onChange={(e) => setQuestion(e.target.value)} />
      </label>
      <button
        disabled={task.busy || !question.trim() || !chunks.length}
        onClick={() => void task.run((s) => ask(question.trim(), false, s))}
      >
        Ask space
      </button>
      <details>
        <summary>Cross-article insights</summary>
        <label>
          Explore
          <select value={insight} onChange={(e) => setInsight(e.target.value as keyof typeof insights)}>
            {Object.keys(insights).map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </label>
        <button
          disabled={task.busy || new Set(chunks.map((c) => c.articleId)).size < 2}
          onClick={() =>
            void task.run((s) =>
              ask(insights[insight] + ' Cite two different articles for each relationship.', true, s),
            )
          }
        >
          Explore connections
        </button>
      </details>
      {!chunks.length && <p>Save an article to this space to begin.</p>}
      {task.busy && <button onClick={task.cancel}>Cancel request</button>}
      <p role="status">
        {error || (task.busy ? 'Searching this space and preparing a response…' : task.message)}
      </p>
      {history.map((t) => (
        <details key={t.id} open={t.id === history[0]?.id || undefined}>
          <summary>{t.question}</summary>
          {t.claims.map((c, i) => {
            const refs = c.refs.map((id) =>
              chunks.find((h) => h.id === id && t.sources.some((s) => s.id === id && s.text === h.text)),
            );
            return refs.every((r) => r !== undefined) ? (
              <div key={i}>
                <p>{c.point}</p>
                {refs.map((r) => (
                  <Source key={r.id} chunk={r} open={open} />
                ))}
              </div>
            ) : (
              <p key={i}>The original evidence is no longer available in this space.</p>
            );
          })}
          {t.limitation && <p>{t.limitation}</p>}
          {!t.claims.length && !!t.sources.length && <details><summary>Inspect retrieved material</summary>{t.sources.map(s=>{const c=chunks.find(c=>c.id===s.id&&c.text===s.text);return c&&<Source key={s.id} chunk={c} open={open}/>;})}</details>}
          <small>{t.model} · Inspect the cited text to check the interpretation.</small>
        </details>
      ))}
      {history.length > 0 && (
        <button
          disabled={task.busy}
          onClick={() => {
            if (window.confirm('Clear all chat and insight history for this space?'))
              void task.run(async () => {
                await changeKnowledge((d) => {
                  d.turns = d.turns.filter((t) => t.spaceId !== space);
                });
                return 'History cleared.';
              });
          }}
        >
          Clear space history
        </button>
      )}
    </section>
  );
}

export function PassageSearch({
  library,
  space,
  open,
}: {
  library: Library;
  space: string;
  open: (id: string) => void;
}) {
  const [query, setQuery] = useState(''),
    [results, setResults] = useState<Chunk[]>([]);
  const task = useTask();
  const chunks = useMemo(() => chunksFor(library, space || undefined), [library, space]);
  return (
    <details className="card" data-tour="search">
      <summary>Search saved passages</summary><p>Search words offline, or match meaning with a local embedding index.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void task.run(async (signal) => {
            const r = await search(chunks, query, signal);
            setResults(r.hits);tutorialAction('search');
            return r.mode + ' search · ' + r.hits.length + ' passages.';
          });
        }}
      >
        <label>
          Find a concept
          <input
            value={query}
            maxLength={600}
            onChange={(e) => {
              setQuery(e.target.value);
              setResults([]);
            }}
            disabled={task.busy}
          />
        </label>
        <button disabled={!query.trim() || task.busy}>Search passages</button>
      </form>
      {task.busy && <button onClick={task.cancel}>Cancel search</button>}
      <p role="status">{task.busy ? 'Searching…' : task.message}</p>
      {results
        .filter((r) => chunks.some((c) => c.id === r.id && c.text === r.text))
        .map((c) => (
          <Source key={c.id} chunk={c} open={open} />
        ))}
    </details>
  );
}

export function IndexSettings() {
  const task = useTask(),
    [count, setCount] = useState(0);
  useEffect(() => {
    void indexStatus()
      .then(setCount)
      .catch(() => undefined);
  }, []);
  return (
    <section className="card">
      <h2>Passage index</h2>
      <p>
        Install the optional embedding model to find passages by meaning. Keyword search works offline.
        Building the index sends saved passages only to your local Ollama.
      </p>
      <p>{count} of 512 possible passage vectors stored. Unchanged passages are reused.</p>
      <button
        disabled={task.busy || !count}
        onClick={() =>
          void task.run(async () => {
            await clearIndex();
            setCount(0);
            return 'Derived vectors removed.';
          })
        }
      >
        Clear index
      </button>
      <button
        disabled={task.busy}
        onClick={() =>
          void task.run(async (s) => {
            const n = await buildIndex(s, setCount);
            setCount(n);
            return 'Index updated.';
          })
        }
      >
        Update index
      </button>
      {task.busy && <button onClick={task.cancel}>Cancel indexing</button>}
      <p role="status">{task.busy ? 'Indexing locally…' : task.message}</p>
    </section>
  );
}

export function DailyReview({ space }: { space?: string }) {
  const { records } = useStudy(),
    { data, error } = useKnowledge(),
    task = useTask();
  const [session, setSession] = useState<string[]>([]),
    [revealed, setRevealed] = useState(false),
    [adjust, setAdjust] = useState('');
  const queue = revisionQueue(data, Object.values(records)).filter((r) => !space || r.card.spaceId === space);
  const due = queue.filter((r) => r.due <= Date.now()),
    next = queue.filter((r) => r.due > Date.now());
  const current = queue.find((r) => r.card.id === session[0]);
  const revision = [
    ...new Set(
      queue
        .filter((r) => r.latest === 'Incorrect' || r.latest === 'Partially Correct')
        .flatMap((r) => r.card.concepts),
    ),
  ];
  function rate(id: string, v: Verdict, replaces?: string) {
    const row = queue.find((r) => r.card.id === id)!;
    void task.run(async () => {
      await changeKnowledge((d) => {
        if (!d.cards.some((c) => c.id === id)) d.cards.push(row.card);
        d.ratings.push({ id: crypto.randomUUID(), cardId: id, at: Date.now(), verdict: v, replaces });
      });
      if (!replaces) {
        setSession((list) => list.slice(1));
        setRevealed(false);
      }
      setAdjust('');
      if(!replaces)tutorialAction('review');return 'Review saved.';
    });
  }
  return (
    <section className="card" data-tour="review">
      <h2>{space ? 'Space revision' : 'Daily review'}</h2>
      <p>
        {due.length} due · {next.length} upcoming
        {next[0] ? ' · Next ' + new Date(next[0].due).toLocaleDateString() : ''}
      </p>
      {revision.length > 0 && <p>Revisit {revision.slice(0, 5).join(', ')}</p>}
      {!current && (
        <button
          disabled={!due.length}
          onClick={() => {
            setSession(due.map((r) => r.card.id));
            setRevealed(false);
          }}
        >
          Start review
        </button>
      )}
      {current && (
        <div>
          <p>{session.length} remaining</p>
          <strong>{current.card.question}</strong>
          {revealed ? (
            <>
              <p>{current.card.expected}</p>
              <blockquote>{current.card.passage}</blockquote>
              <p>How did you do?</p>
              {verdicts.map((v) => (
                <button disabled={task.busy} key={v} onClick={() => rate(current.card.id, v)}>
                  {v}
                </button>
              ))}
            </>
          ) : (
            <button onClick={() => setRevealed(true)}>Reveal and self-assess</button>
          )}
          <button onClick={() => setSession([])}>End session</button>
        </div>
      )}
      {queue.some((r) => r.history.length > 0) && (
        <details>
          <summary>Review schedules and past attempts</summary>
          {queue
            .filter((r) => r.history.length)
            .map((r) => (
              <details key={r.card.id}>
                <summary>
                  {r.card.question} · {r.due ? new Date(r.due).toLocaleDateString() : 'Due now'}
                </summary>
                {r.history.map((h) => (
                  <div key={h.id}>
                    <p>
                      {new Date(h.at).toLocaleDateString()} · {r.overrides.get(h.id) ?? h.verdict}
                    </p>
                    <button onClick={() => setAdjust(h.id)}>Adjust rating</button>
                    {adjust === h.id &&
                      verdicts.map((v) => (
                        <button disabled={task.busy} key={v} onClick={() => rate(r.card.id, v, h.id)}>
                          {v}
                        </button>
                      ))}
                  </div>
                ))}
              </details>
            ))}
        </details>
      )}
      <p role="status">{error || task.message}</p>
    </section>
  );
}
