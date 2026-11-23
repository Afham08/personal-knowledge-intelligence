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

export function ArticleAnalysis({ article, goal, modelName }: {
  article: ExtractedArticle;
  goal: string;
  modelName: string;
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
    <section aria-label="AI article analysis">
      <h3>AI article analysis</h3>
      {!goal.trim() && <p>Add a learning goal to the selected Knowledge Space to analyze this article.</p>}
      {!modelName && <p>Choose an installed model in AI settings.</p>}
      {analyzing ? (
        <>
          <p role="status">{state.status === 'retrying'
            ? 'Ollama returned an invalid result. Retrying once…'
            : 'Analyzing with Ollama… This can take a few minutes.'}</p>
          <button type="button" onClick={cancel}>Cancel analysis</button>
        </>
      ) : (
        <button type="button" disabled={!goal.trim() || !modelName} onClick={() => void run()}>
          Analyze with AI
        </button>
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
      <p>
        Extracted {coverage.extractedCharacters.toLocaleString()} characters{coverage.extractionTruncated ? ' (extraction limit reached)' : ''}.
        {' '}Ollama received {passages.length} of {coverage.availablePassages} passages ({coverage.suppliedCharacters.toLocaleString()} characters).
        {' '}{partial ? 'This analysis covers only the supplied text.' : 'The supplied passages cover the extracted text.'}
      </p>
      <details>
        <summary>View passages sent to Ollama</summary>
        {passages.map((passage) => <SourceReference key={passage.id} passage={passage} />)}
      </details>
      <p>Source references show the article text supplied to Ollama. Compare AI claims and answers with the referenced passage.</p>
      <h4>Relevance · {relevance.level}</h4>
      <p><strong>Goal alignment</strong> {relevance.alignment}</p>
      {relevance.topics.length > 0 && <p><strong>Relevant topics</strong> {relevance.topics.join(', ')}</p>}
      {relevance.limitations.length > 0 && <><h5>Limitations</h5><TextList items={relevance.limitations} /></>}
      {relevance.evidence.map((evidence, index) => <SourceReference key={index} passage={sourceById.get(evidence)} />)}

      <h4>Summary</h4>
      <p>{summary.overview}</p>
      <h5>Main ideas</h5>
      <TextList items={summary.ideas} />
      <h5>Takeaways</h5>
      <TextList items={summary.takeaways} />

      <h4>Key concepts</h4>
      <ul>{concepts.map(({ term, explanation, evidence }, index) => (
        <li key={index}><strong>{term}</strong> {explanation}<SourceReference passage={sourceById.get(evidence)} /></li>
      ))}</ul>

      <RecallPractice key={recallSessionKey(recall)} questions={recall} modelName={modelName}
        sourceById={sourceById} analysisPending={analyzing} />
    </>
  );
}
