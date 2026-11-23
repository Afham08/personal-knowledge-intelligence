import { useEffect, useReducer, useRef } from 'react';
import { browser } from 'wxt/browser';

import { analyzeArticle } from '../../lib/ai/analysis';
import { localAnalysisCache } from '../../lib/ai/local-store';
import { OLLAMA_ORIGIN_PERMISSION, ollamaProvider } from '../../lib/ai/ollama';
import { AiError } from '../../lib/ai/provider';
import { RecallPractice } from './RecallPractice';
import { SourceReference } from './SourceReference';
import { recallSessionKey, updateAnalysis, type AnalysisResult } from './panel-state';
import type { ExtractedArticle } from '../../lib/article';

export function ArticleAnalysis({ article, goal, modelName, onSpaces, onSettings }: {
  article: ExtractedArticle;
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

  async function run() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setState({ status: 'running' });
    try {
      const allowed = await browser.permissions.contains({ origins: [OLLAMA_ORIGIN_PERMISSION] });
      if (!allowed) throw new AiError('permission', 'Open AI settings and test the connection to grant Ollama access.');
      const result = await analyzeArticle({
        article, goal, modelName, cache: localAnalysisCache, provider: ollamaProvider, signal: controller.signal,
        onRetry: () => {
          if (request.current === controller) setState({ status: 'retrying' });
        },
      });
      if (request.current === controller) setState({ status: 'ready', result });
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

  return (
    <section className="card analysis-card" aria-label="AI article analysis">
      <h2>Article analysis</h2>
      {!goal.trim() && <p>Add a learning goal to guide this analysis. <button className="text-button"
        type="button" onClick={onSpaces}>Open Spaces</button></p>}
      {!modelName && <p>Choose an installed model to begin. <button className="text-button"
        type="button" onClick={onSettings}>Open Settings</button></p>}
      {analyzing ? (
        <>
          <p role="status">{state.status === 'retrying'
            ? 'Ollama returned an invalid result. Retrying once…'
            : 'Analyzing with Ollama… This can take a few minutes.'}</p>
          <button type="button" onClick={cancel}>Cancel analysis</button>
        </>
      ) : (
        <div className="button-row"><button className="button-primary" type="button"
          disabled={!goal.trim() || !modelName} onClick={() => void run()}>
          {state.result ? 'Analyze again' : 'Analyze with AI'}
        </button></div>
      )}
      {state.status === 'cancelled' && (
        <p role="status">{state.result ? 'Analysis cancelled. You can continue with your previous result.' : 'Analysis cancelled.'}</p>
      )}
      {state.status === 'error' && (
        <p role="alert">{state.message}{state.result && ' You can continue with your previous result.'}</p>
      )}
      {state.result && <AnalysisResult {...state.result} modelName={modelName} analyzing={analyzing} />}
    </section>
  );
}

function TextList({ items }: { items: string[] }) {
  return items.length > 0 && <ul>{items.map((item, index) => <li key={index}>{item}</li>)}</ul>;
}

function AnalysisResult({ analysis, passages, cached, partial, coverage, modelName, analyzing }: AnalysisResult & {
  modelName: string;
  analyzing: boolean;
}) {
  const { relevance, summary, concepts, recall } = analysis;
  const sourceById = new Map(passages.map((passage) => [passage.id, passage]));
  return (
    <>
      {cached && <p role="status">Using a cached analysis.</p>}
      <section className="analysis-block" aria-labelledby="relevance-heading">
        <div className="section-heading"><h3 id="relevance-heading">Relevance</h3>
          <span className="badge" data-tone={relevance.level === 'High' ? 'positive' : relevance.level === 'Medium' ? 'partial' : undefined}>
            {relevance.level} relevance
          </span></div>
        <p>{relevance.alignment}</p>
        {relevance.topics.length > 0 && <p className="metadata"><strong>Topics</strong> {relevance.topics.join(' · ')}</p>}
        {relevance.limitations.length > 0 && <><h4>Limitations</h4><TextList items={relevance.limitations} /></>}
        <div>{relevance.evidence.map((evidence, index) => <SourceReference key={index} passage={sourceById.get(evidence)} />)}</div>
      </section>

      <section className="analysis-block" aria-labelledby="summary-heading">
        <h3 id="summary-heading">Summary</h3>
        <p>{summary.overview}</p>
        <details className="disclosure">
          <summary>Main ideas and takeaways</summary>
          <div className="analysis-section-content">
            <h4>Main ideas</h4><TextList items={summary.ideas} />
            <h4>Takeaways</h4><TextList items={summary.takeaways} />
          </div>
        </details>
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

      <RecallPractice key={recallSessionKey(recall)} questions={recall} modelName={modelName}
        sourceById={sourceById} analysisPending={analyzing} />
    </>
  );
}
