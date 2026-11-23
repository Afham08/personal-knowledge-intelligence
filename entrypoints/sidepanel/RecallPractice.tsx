import { useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';

import { OLLAMA_ORIGIN_PERMISSION, ollamaProvider } from '../../lib/ai/ollama';
import { AiError, type Passage } from '../../lib/ai/provider';
import { checkRecallAnswer, MAX_RECALL_ANSWER_LENGTH } from '../../lib/ai/recall';
import type { Analysis } from '../../lib/ai/schema';
import { SourceReference } from './SourceReference';

type CheckResult = Awaited<ReturnType<typeof checkRecallAnswer>>;
type CheckState =
  | { status: 'idle' | 'checking' | 'cancelled' }
  | { status: 'error'; message: string }
  | { status: 'ready'; result: CheckResult };

type Draft = { answer: string; revealed: boolean; check: CheckState };
const emptyDraft: Draft = { answer: '', revealed: false, check: { status: 'idle' } };

export function RecallPractice({ questions, sourceById, modelName, analysisPending }: {
  questions: Analysis['recall'];
  sourceById: ReadonlyMap<string, Passage>;
  modelName: string;
  analysisPending: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const request = useRef<AbortController>(undefined);
  useEffect(() => () => {
    request.current?.abort();
    request.current = undefined;
  }, []);

  const question = questions[index];
  const draft = drafts[index] ?? emptyDraft;
  if (!question) return null;
  const passage = sourceById.get(question.evidence);

  function update(changes: Partial<Draft>) {
    setDrafts((current) => ({
      ...current,
      [index]: { ...(current[index] ?? emptyDraft), ...changes },
    }));
  }

  function cancel() {
    if (!request.current) return;
    request.current.abort();
    request.current = undefined;
    update({ check: { status: 'cancelled' } });
  }

  function navigate(next: number) {
    cancel();
    setIndex(next);
  }

  async function check() {
    if (request.current || analysisPending || !question || !draft.answer.trim()) return;
    const controller = new AbortController();
    request.current = controller;
    update({ check: { status: 'checking' } });
    try {
      const allowed = await browser.permissions.contains({ origins: [OLLAMA_ORIGIN_PERMISSION] });
      if (!allowed) throw new AiError('permission', 'Open AI settings and test the Ollama connection to grant access.');
      const result = await checkRecallAnswer({
        question: question.question,
        expectedAnswer: question.answer,
        answer: draft.answer,
        passage,
        modelName,
        provider: ollamaProvider,
        signal: controller.signal,
      });
      if (request.current === controller) update({ check: { status: 'ready', result } });
    } catch (error) {
      if (request.current === controller) {
        update({
          check: {
            status: 'error',
            message: error instanceof AiError ? error.message : 'Could not check your answer. Try again.',
          },
        });
      }
    } finally {
      if (request.current === controller) request.current = undefined;
    }
  }

  const checking = draft.check.status === 'checking';
  return (
    <section aria-labelledby="active-recall">
      <h4 id="active-recall">Active recall</h4>
      <p aria-live="polite">Question {index + 1} of {questions.length}</p>
      <label>
        {question.question}
        <textarea value={draft.answer} placeholder="Your answer" maxLength={MAX_RECALL_ANSWER_LENGTH}
          disabled={checking} onChange={(event) => update({ answer: event.target.value, check: { status: 'idle' } })} />
      </label>
      <div className="ai-actions">
        <button type="button" disabled={checking || analysisPending || !draft.answer.trim()} onClick={() => void check()}>
          Check my answer
        </button>
        {checking && <button type="button" onClick={cancel}>Cancel answer check</button>}
      </div>
      <p>{analysisPending ? 'You can check answers when the article analysis finishes.'
        : 'Answer checks use local Ollama and provide formative feedback.'}</p>
      {checking && <p role="status">Checking your answer…</p>}
      {draft.check.status === 'cancelled' && <p role="status">Answer check cancelled. Your draft is still here.</p>}
      {draft.check.status === 'error' && <p role="alert">{draft.check.message}</p>}
      {draft.check.status === 'ready' && <Feedback result={draft.check.result} />}
      <div className="ai-actions">
        <button type="button" aria-expanded={draft.revealed} onClick={() => update({ revealed: !draft.revealed })}>
          {draft.revealed ? 'Hide expected answer' : 'Reveal expected answer'}
        </button>
        <button type="button" disabled={index === 0} onClick={() => navigate(index - 1)}>Previous question</button>
        <button type="button" disabled={index === questions.length - 1} onClick={() => navigate(index + 1)}>Next question</button>
      </div>
      {draft.revealed && <><p><strong>Expected answer</strong> {question.answer}</p><SourceReference passage={passage} /></>}
    </section>
  );
}

function Feedback({ result: feedback }: { result: CheckResult }) {
  return (
    <section aria-label="Answer feedback">
      <h5 aria-live="polite">AI feedback · {feedback.verdict}</h5>
      {feedback.explanation !== feedback.understood && feedback.explanation !== feedback.issues && <p>{feedback.explanation}</p>}
      {feedback.understood && <p><strong>What you understood</strong> {feedback.understood}</p>}
      {feedback.issues && <p><strong>Missing, inaccurate, or unsupported ideas</strong> {feedback.issues}</p>}
      <p><strong>Try this</strong> {feedback.improvement}</p>
      {feedback.evidence && (
        <details>
          <summary>Sentence referenced by the feedback</summary>
          <p>{feedback.evidence.text}</p>
        </details>
      )}
    </section>
  );
}
