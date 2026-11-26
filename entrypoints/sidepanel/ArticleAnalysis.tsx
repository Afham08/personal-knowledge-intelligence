import {tutorialAction} from '../../lib/tutorial';
import { useEffect, useId, useReducer, useRef, useState } from 'react';
import { browser } from 'wxt/browser';

import { analyzeArticle, articleFingerprint, reopenReview, type Review } from '../../lib/ai/analysis';
import { localAnalysisCache, reviewsFor } from '../../lib/ai/local-store';
import { OLLAMA_ORIGIN_PERMISSION, ollamaProvider } from '../../lib/ai/ollama';
import { AiError } from '../../lib/ai/provider';
import { changeKnowledge } from '../../lib/knowledge-store';
import { cardId } from '../../lib/revision';
import { normalizeArticleUrl } from '../../lib/library-model';
import { Icon } from './Icon';
import { saveStudy } from './useStudy';
import type { StudyContext } from '../../lib/study';
import { RecallPractice } from './RecallPractice';
import { SourceReference } from './SourceReference';
import { recallSessionKey, summaryPoints, updateAnalysis, type AnalysisResult } from './panel-state';
import type { ExtractedArticle } from '../../lib/article';

export function ArticleAnalysis({ article, goal, modelName, spaceId, enabled, onSpaces, onSettings }: {
  article: ExtractedArticle;
  spaceId: string;
  enabled: boolean;
  goal: string;
  modelName: string;
  onSpaces: () => void;
  onSettings: () => void;
}) {
  const [state, setState] = useReducer(updateAnalysis, { status: 'idle' });
  const request = useRef<AbortController>(undefined);
  useEffect(() => () => {
    request.current?.abort();
    request.current = undefined;
  }, []);
  const analyzing = state.status === 'running' || state.status === 'retrying';

  const [openingSaved, setOpeningSaved] = useState(false);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [storageError, setStorageError] = useState('');
  useEffect(() => {
    let active = true;
    let generation = 0;
    function refresh() {
      const current = ++generation;
      void articleFingerprint(article).then(reviewsFor).then(items => {
        if (active && current === generation) { setReviews(items); setReviewIndex(0); }
      }).catch(() => { if (active) setStorageError('Saved analyses could not be loaded.'); });
    }
    refresh();
    const changed: Parameters<typeof browser.storage.onChanged.addListener>[0] = (changes, area) => {
      if (area === 'local' && 'pki.ai.cache.v1' in changes) refresh();
    };
    browser.storage.onChanged.addListener(changed);
    return () => { active = false; browser.storage.onChanged.removeListener(changed); };
  }, [article.title, article.text, article.truncated]);

  async function run(review?: Review) {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setOpeningSaved(Boolean(review));
    setStorageError('');
    setState({ status: 'running' });
    try {
      if (!review && (!enabled || !await browser.permissions.contains({ origins: [OLLAMA_ORIGIN_PERMISSION] }))) throw new AiError('permission', 'Open AI settings and test the connection to grant Ollama access.');
      const result = review ? await reopenReview(article, review) : await analyzeArticle({
        article, goal, modelName, cache: localAnalysisCache, provider: ollamaProvider, signal: controller.signal,
        onRetry: () => {
          if (request.current === controller) setState({ status: 'retrying' });
        },
      });
      if (request.current === controller) {
        setState({ status: 'ready', result });tutorialAction('analysis');
        if ('saveFailed' in result && result.saveFailed) setStorageError('Analysis is available in this panel, but could not be saved for offline review.');
        void changeKnowledge(data=>{
          for(const q of result.analysis.recall){
            const passage=result.passages.find(p=>p.id===q.evidence)!;
            const practice={spaceId,url:normalizeArticleUrl(article.url),model:result.model.name,goal:result.goal,question:q.question,expected:q.answer,passage:passage.text};
            const id=cardId(practice);
            if(!data.cards.some(c=>c.id===id))data.cards.push({...practice,id,concepts:result.analysis.concepts.filter(c=>c.evidence===q.evidence).map(c=>c.term)});
          }
        }).catch(()=>setStorageError('Could not save questions for offline revision.'));
        void saveStudy({ kind: 'study', spaceId, url: normalizeArticleUrl(article.url), model: result.model.name, goal: result.goal })
          .catch(() => setStorageError('Study progress could not be saved. Check browser storage.'));
      }
    } catch (error) {
      if (request.current === controller) {
        setState({
          status: 'error',
          message: error instanceof AiError ? error.message : 'Analysis failed. Try again.',
        });
      }
    } finally {
      if (request.current === controller) request.current = undefined;
    }
  }

  function cancel() {
    request.current?.abort();
    request.current = undefined;
    setState({ status: 'cancelled' });
  }

  if (!enabled && !reviews.length && !storageError) return null;
  return (
    <section className="card analysis-card" aria-label="AI article analysis" data-tour="analysis">
      <h2>Article analysis</h2>
      {reviews.length > 0 && <div className="analysis-block">
        <label>Saved analyses<select value={reviewIndex} onChange={e => setReviewIndex(Number(e.target.value))}>
          {reviews.map((r, i) => <option key={i} value={i}>{r.model.name} · {r.goal} · {new Date(r.savedAt).toLocaleDateString()}</option>)}
        </select></label>
        <button type="button" disabled={analyzing} onClick={() => void run(reviews[reviewIndex])}>Open saved analysis</button>
      </div>}
      {storageError && <p role="alert">{storageError}</p>}
      {enabled && goal.trim() && <p className="metadata"><strong>Learning goal</strong> {goal}</p>}
      {enabled && !goal.trim() && <p>Add a learning goal to guide this analysis. <button className="text-button"
        type="button" onClick={onSpaces}>Open Spaces</button></p>}
      {enabled && !modelName && <p>Choose an installed model to begin. <button className="text-button"
        type="button" onClick={onSettings}>Open Settings</button></p>}
      {analyzing ? (
        <>
          <p role="status">{state.status === 'retrying'
            ? 'Ollama returned an invalid result. Retrying once…'
            : openingSaved ? 'Opening saved analysis…' : 'Analyzing with Ollama… This can take a few minutes.'}</p>
          <button type="button" onClick={cancel}>Cancel analysis</button>
        </>
      ) : (
        enabled && <div className="button-row"><button className="button-primary" type="button"
          disabled={!goal.trim() || !modelName} onClick={() => void run()}>
          {state.result ? 'Analyze again' : 'Analyze with AI'}
        </button></div>
      )}
      {state.status === 'cancelled' && (
        <p role="status">{state.result ? 'Analysis cancelled. You can continue with your previous result.' : 'Analysis cancelled.'}</p>
      )}
      {state.status === 'error' && (
        <p role="alert">{state.message} <button type="button" className="text-button" onClick={onSettings}>Open Settings</button>{state.result && ' You can continue with your previous result.'}</p>
      )}
      {state.result && <AnalysisResult {...state.result} context={{ spaceId, url: normalizeArticleUrl(article.url), model: state.result.model.name, goal: state.result.goal }}
        canCheck={enabled && state.result.model.name === modelName} analyzing={analyzing} />}
    </section>
  );
}

function TextList({ items }: { items: string[] }) {
  return items.length > 0 && <ul>{items.map((item, index) => <li key={index}>{item}</li>)}</ul>;
}

function AnalysisResult({ analysis, passages, cached, partial, coverage, canCheck, analyzing, context }: AnalysisResult & {
  context: StudyContext;
  canCheck: boolean;
  analyzing: boolean;
}) {
  const id = useId();
  const practice = useRef<HTMLDivElement>(null);
  const { relevance, summary, concepts, recall } = analysis;
  const { ideas, takeaways } = summaryPoints(summary);
  const sourceById = new Map(passages.map((passage) => [passage.id, passage]));
  return (
    <>
      <div className="section-heading">
        <p role="status">{cached ? 'Using a cached analysis.' : 'Analysis ready.'}</p>
        <button type="button" className="text-button" onClick={() => {
          const heading = practice.current?.querySelector<HTMLElement>('h3');
          heading?.focus();
          heading?.scrollIntoView({ block: 'start' });
        }}>Go to recall <Icon name="arrow" /></button>
      </div>
      <p className="metadata">{context.model} · {context.goal}</p>
      <section className="analysis-block" aria-labelledby={id + '-summary'}>
        <h3 id={id + '-summary'}>Summary</h3>
        <p>{summary.overview}</p>
        {partial && <p className="metadata">Based on {passages.length} selected excerpts from the extracted text.</p>}
        {(ideas.length > 0 || takeaways.length > 0) && <details className="disclosure">
          <summary>Main ideas and takeaways</summary>
          <div className="analysis-section-content">
            {ideas.length > 0 && <><h4>Main ideas</h4><TextList items={ideas} /></>}
            {takeaways.length > 0 && <><h4>Takeaways</h4><TextList items={takeaways} /></>}
          </div>
        </details>}
      </section>

      <section className="analysis-block" aria-labelledby={id + '-relevance'}>
        <div className="section-heading"><h3 id={id + '-relevance'}>Relevance</h3>
          <span className="badge" data-tone={relevance.level === 'High' ? 'positive' : relevance.level === 'Medium' ? 'partial' : undefined}>
            {relevance.level} relevance
          </span></div>
        <p>{relevance.alignment}</p>
        {relevance.topics.length > 0 && <p className="metadata"><strong>Topics</strong> {relevance.topics.join(' · ')}</p>}
        {relevance.limitations.length > 0 && <><h4>Limitations</h4><TextList items={relevance.limitations} /></>}
        <div>{[...new Set(relevance.evidence)].map((evidence) => <SourceReference key={evidence} passage={sourceById.get(evidence)} />)}</div>
      </section>

      <details className="disclosure">
        <summary>Key concepts</summary>
        <ul className="analysis-block">{concepts.map(({ term, explanation, evidence }, index) => (
          <li key={index}><strong>{term}</strong> {explanation}<SourceReference passage={sourceById.get(evidence)} /></li>
        ))}</ul>
      </details>

      <details className="disclosure">
        <summary>View passages sent to Ollama</summary>
        <p className="metadata">
          Extracted {coverage.extractedCharacters.toLocaleString()} characters{coverage.extractionTruncated ? ' (extraction limit reached)' : ''}.
          {' '}Ollama received {passages.length} of {coverage.availablePassages} passages ({coverage.suppliedCharacters.toLocaleString()} characters).
          {' '}{partial ? 'The analysis covers only these excerpts.' : 'These passages cover the extracted text.'}
        </p>
        <p className="metadata">Compare AI claims and answers with the referenced text.</p>
        {passages.map((passage) => <SourceReference key={passage.id} passage={passage} />)}
      </details>

      <div ref={practice}><RecallPractice key={recallSessionKey(recall)} context={context} questions={recall} concepts={concepts} canCheck={canCheck} modelName={context.model}
        sourceById={sourceById} analysisPending={analyzing} /></div>
    </>
  );
}
