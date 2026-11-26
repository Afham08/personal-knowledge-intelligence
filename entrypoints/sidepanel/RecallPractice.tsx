import {tutorialAction} from '../../lib/tutorial';
import { useEffect, useId, useRef, useState } from 'react';
import { browser } from 'wxt/browser';

import { OLLAMA_ORIGIN_PERMISSION, ollamaProvider } from '../../lib/ai/ollama';
import { AiError, type Passage } from '../../lib/ai/provider';
import { checkRecallAnswer, MAX_RECALL_ANSWER_LENGTH } from '../../lib/ai/recall';
import type { Analysis } from '../../lib/ai/schema';
import { saveStudy, useStudy } from './useStudy';
import { sameQuestion, studyKey, type StudyContext, type StudyRecord } from '../../lib/study';
import { useDraft } from './useDraft';
import { SourceReference } from './SourceReference';

type CheckResult = Awaited<ReturnType<typeof checkRecallAnswer>>;
type CheckState =
  | { status: 'idle' | 'checking' | 'cancelled' }
  | { status: 'error'; message: string }
  | { status: 'ready'; result: CheckResult; answer: string };

type Draft = { revealed: boolean; check: CheckState };
const emptyDraft: Draft = { revealed: false, check: { status: 'idle' } };

export function RecallPractice({ context, concepts, canCheck, questions, sourceById, modelName, analysisPending }: {
  context: StudyContext;
  concepts: Analysis['concepts'];
  canCheck: boolean;
  questions: Analysis['recall'];
  sourceById: ReadonlyMap<string, Passage>;
  modelName: string;
  analysisPending: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const input = useRef<HTMLTextAreaElement>(null);
  const request = useRef<AbortController>(undefined);
  useEffect(() => () => {
    request.current?.abort();
    request.current = undefined;
  }, []);

  const question = questions[index];
  const draft = drafts[index] ?? emptyDraft;
  const passage = question && sourceById.get(question.evidence);
  const heading = useId();
  const { records, loaded, loadError } = useStudy();
  const [saveError, setSaveError] = useState('');
  const practice = { ...context, question: question?.question ?? '', expected: question?.answer ?? '', passage: passage?.text ?? '' };
  const key = studyKey({ ...practice, kind: 'draft', answer: '' });
  const saved = records[key];
  const answerDraft = useDraft('recall', key);
  const answer = answerDraft.value ?? (saved?.kind === 'draft' ? saved.answer : '');
  const prior = Object.values(records).filter((r): r is Extract<StudyRecord, {kind: 'assessment'}> =>
    r.kind === 'assessment' && r.answer === answer && sameQuestion(r, practice)).sort((a, b) => b.at - a.at)[0];
  useEffect(() => {
    if (saved?.kind === 'draft' && answerDraft.value === saved.answer) answerDraft.saved(saved.answer);
  }, [saved, answerDraft.value]);
  if (!question) return null;

  const feedback = draft.check.status === 'ready' && draft.check.answer === answer ? draft.check.result : prior?.feedback;
  const checked = Boolean(feedback);

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
    requestAnimationFrame(() => input.current?.focus());
  }

  async function check() {
    if (!canCheck || checked || request.current || analysisPending || !question || !answer.trim()) return;
    const controller = new AbortController();
    request.current = controller;
    update({ check: { status: 'checking' } });
    try {
      const allowed = await browser.permissions.contains({ origins: [OLLAMA_ORIGIN_PERMISSION] });
      if (!allowed) throw new AiError('permission', 'Open AI settings and test the Ollama connection to grant access.');
      const result = await checkRecallAnswer({
        question: question.question,
        expectedAnswer: question.answer,
        answer,
        passage,
        modelName,
        provider: ollamaProvider,
        signal: controller.signal,
      });
      if (request.current === controller) {
        update({ check: { status: 'ready', result, answer } });
        tutorialAction('recall');await saveStudy({ ...practice, kind: 'assessment', id: crypto.randomUUID(), at: Date.now(), answer,
          feedback: result, concepts: concepts.filter(c => c.evidence === question.evidence).map(c => c.term) })
          .catch(() => setSaveError('Feedback is available here, but its history could not be saved.'));
      }
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
    <section className="practice-card" data-tour="recall" aria-labelledby={heading}>
      <div className="section-heading"><h3 id={heading} tabIndex={-1}>Active recall</h3>
        <p className="metadata" aria-live="polite">Question {index + 1} of {questions.length}</p></div>
      <progress value={index + 1} max={questions.length} aria-label="Recall progress" />
      <label>
        {question.question}
        <textarea ref={input} value={answer} placeholder="Your answer" maxLength={MAX_RECALL_ANSWER_LENGTH}
          disabled={checking || !loaded} onChange={(event) => {
            const next = event.target.value;
            answerDraft.edit(next);
            setSaveError('');
            void saveStudy({ ...practice, kind: 'draft', answer: next }).catch(() =>
              setSaveError('This answer could not be saved. Copy it before closing the panel.'));
            update({ check: { status: 'idle' } });
          }} />
      </label>
      <div className="button-row">
        <button className="button-primary" type="button" disabled={!canCheck || checked || checking || analysisPending || !answer.trim()} onClick={() => void check()}>
          {checked ? 'Answer checked' : 'Check my answer'}
        </button>
        {checking && <button type="button" onClick={cancel}>Cancel answer check</button>}
      </div>
      <p className="metadata">{analysisPending ? 'You can check answers when the article analysis finishes.'
        : checked ? 'Edit your answer to check a revision.' : 'Check your reasoning against the passage with local Ollama.'}</p>
      {!canCheck && <p className="metadata">Enable local AI and select {modelName} to check this answer. You can reveal it offline.</p>}
      {(saveError || loadError) && <p role="alert">{saveError || loadError}</p>}
      {checking && <p role="status">Checking your answer…</p>}
      {draft.check.status === 'cancelled' && <p role="status">Answer check cancelled. Your draft is still here.</p>}
      {draft.check.status === 'error' && <p role="alert">{draft.check.message}</p>}
      {feedback && <Feedback result={feedback} />}
      <div><button className="text-button" type="button" aria-expanded={draft.revealed}
        onClick={() => {if(!draft.revealed&&answer.trim())tutorialAction('recall');update({ revealed: !draft.revealed });}}>
        {draft.revealed ? 'Hide expected answer' : 'Reveal expected answer'}
      </button></div>
      {draft.revealed && <><p><strong>Expected answer</strong> {question.answer}</p><SourceReference passage={passage} /></>}
      <div className="practice-nav">
        <button type="button" disabled={index === 0} onClick={() => navigate(index - 1)}>Previous question</button>
        <button type="button" disabled={index === questions.length - 1} onClick={() => navigate(index + 1)}>Next question</button>
      </div>
    </section>
  );
}

function Feedback({ result: feedback }: { result: CheckResult }) {
  return (
    <section className="feedback-card" aria-label="Answer feedback">
      <div className="section-heading"><h4>Answer feedback</h4>
        <span className="badge" aria-live="polite" data-tone={feedback.verdict === 'Correct' ? 'positive'
          : feedback.verdict === 'Partially Correct' ? 'partial' : feedback.verdict === 'Incorrect' ? 'negative' : undefined}>
          {feedback.verdict}
        </span></div>
      {feedback.explanation !== feedback.understood && feedback.explanation !== feedback.issues && <p>{feedback.explanation}</p>}
      {feedback.understood && <p><strong>What you understood</strong> {feedback.understood}</p>}
      {feedback.issues && <p><strong>Missing, inaccurate, or unsupported ideas</strong> {feedback.issues}</p>}
      <p><strong>Try this</strong> {feedback.improvement}</p>
      {feedback.evidence && (
        <details className="source-reference">
          <summary>Sentence referenced by the feedback</summary>
          <p>{feedback.evidence.text}</p>
        </details>
      )}
    </section>
  );
}
