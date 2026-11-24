import { spaceProgress } from '../../lib/study';
import { useStudy } from './useStudy';

export function StudyProgress({ spaceId }: { spaceId: string }) {
  const { records, loaded, loadError } = useStudy();
  const progress = spaceProgress(Object.values(records), spaceId);
  return <details className="disclosure">
    <summary>Learning progress</summary>
    {loadError ? <p role="alert">{loadError}</p> : !loaded ? <p role="status">Loading progress…</p> : <>
      <dl className="study-counts"><div><dt>Articles studied</dt><dd>{progress.articles}</dd></div>
        <div><dt>Questions attempted</dt><dd>{progress.attempts}</dd></div><div><dt>Answer checks</dt><dd>{progress.history.length}</dd></div></dl>
      {progress.revision.length > 0 && <p><strong>Related concepts to revisit</strong> {progress.revision.join(' · ')}</p>}
      {progress.history.length ? <ol className="analysis-block">{progress.history.map(r => <li key={r.id}>
        <details><summary>{new Date(r.at).toLocaleDateString()} · {r.feedback.verdict} · {r.question}</summary>
          <p><strong>Your answer</strong> {r.answer}</p><p>{r.feedback.explanation}</p><p>{r.feedback.improvement}</p>
          <small>{r.model} · {r.goal}</small>
        </details>
      </li>)}</ol> : <p>Study an article and try a recall question. Your local activity will appear here.</p>}
    </>}
  </details>;
}
