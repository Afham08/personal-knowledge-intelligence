import { useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';

import { analyzeArticle } from '../../lib/ai/analysis';
import { localAnalysisCache } from '../../lib/ai/local-store';
import { OLLAMA_ORIGIN_PERMISSION, ollamaProvider } from '../../lib/ai/ollama';
import { AiError } from '../../lib/ai/provider';
import type { Analysis } from '../../lib/ai/schema';
import type { ExtractedArticle } from '../../lib/article';

type AnalysisState =
  | { status: 'idle' | 'running' | 'cancelled' }
  | { status: 'error'; message: string }
  | { status: 'ready'; result: Awaited<ReturnType<typeof analyzeArticle>> };

export function ArticleAnalysis({ article, goal, modelName }: {
  article: ExtractedArticle;
  goal: string;
  modelName: string;
}) {
  const [state, setState] = useState<AnalysisState>({ status: 'idle' });
  const request = useRef<AbortController>(undefined);
  useEffect(() => () => request.current?.abort(), []);

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
      {state.status === 'running' ? (
        <>
          <p role="status">Analyzing with Ollama… This can take a few minutes.</p>
          <button type="button" onClick={cancel}>Cancel analysis</button>
        </>
      ) : (
        <button type="button" disabled={!goal.trim() || !modelName} onClick={() => void run()}>
          Analyze with AI
        </button>
      )}
      {state.status === 'cancelled' && <p role="status">Analysis cancelled.</p>}
      {state.status === 'error' && <p role="alert">{state.message}</p>}
      {state.status === 'ready' && <AnalysisResult {...state.result} />}
    </section>
  );
}

function TextList({ items }: { items: string[] }) {
  return items.length > 0 && <ul>{items.map((item, index) => <li key={index}>{item}</li>)}</ul>;
}

function Citation({ evidence }: { evidence: Analysis['recall'][number]['evidence'] }) {
  return <p><strong>Passage {evidence.passageId}</strong> <q>{evidence.quote}</q></p>;
}

function AnalysisResult({ analysis, cached, partial }: {
  analysis: Analysis;
  cached: boolean;
  partial: boolean;
}) {
  const { relevance, summary, concepts, recall } = analysis;
  return (
    <>
      {cached && <p role="status">Using a cached analysis.</p>}
      {partial && <p>Analysis is based on excerpts from this article.</p>}
      <h4>Relevance · {relevance.level}</h4>
      <p><strong>Goal alignment</strong> {relevance.alignment}</p>
      {relevance.topics.length > 0 && <p><strong>Relevant topics</strong> {relevance.topics.join(', ')}</p>}
      {relevance.limitations.length > 0 && <><h5>Limitations</h5><TextList items={relevance.limitations} /></>}
      {relevance.evidence.map((evidence, index) => <Citation key={index} evidence={evidence} />)}

      <h4>Summary</h4>
      <p>{summary.overview}</p>
      <h5>Main ideas</h5>
      <TextList items={summary.ideas} />
      <h5>Takeaways</h5>
      <TextList items={summary.takeaways} />

      <h4>Key concepts</h4>
      <ul>{concepts.map(({ term, explanation, evidence }, index) => (
        <li key={index}><strong>{term}</strong> {explanation}<Citation evidence={evidence} /></li>
      ))}</ul>

      <h4>Active recall</h4>
      <p>Answer from memory, then compare your response with the expected answer.</p>
      <ol>{recall.map((item, index) => <li key={index}><RecallQuestion item={item} /></li>)}</ol>
    </>
  );
}

function RecallQuestion({ item }: { item: Analysis['recall'][number] }) {
  const [revealed, setRevealed] = useState(false);

  return (
    <>
      <label>{item.question}<textarea placeholder="Your answer" /></label>
      <button type="button" aria-expanded={revealed} onClick={() => setRevealed(!revealed)}>
        {revealed ? 'Hide expected answer' : 'Reveal expected answer'}
      </button>
      {revealed && <><p><strong>Expected answer</strong> {item.answer}</p><Citation evidence={item.evidence} /></>}
    </>
  );
}
