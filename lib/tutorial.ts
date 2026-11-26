export type View = 'home' | 'spaces' | 'library' | 'settings';
type Step = {
  id: string;
  title: string;
  why: string;
  how: string;
  example: string;
  view: View;
  target: string;
};
const step = (
  id: string,
  title: string,
  why: string,
  how: string,
  example: string,
  view: View,
  target = id,
): Step => ({ id, title, why, how, example, view, target });
export const modules = [
  {
    name: 'Getting started',
    steps: [
      step(
        'space',
        'Create a Knowledge Space',
        'A space keeps sources together around one question you want to answer.',
        'Open Spaces. Enter a name and a learning goal under New Knowledge Space, then choose Create space.',
        'Python fundamentals · Learn when to use a list.',
        'spaces',
      ),
      step(
        'save',
        'Capture and save an article',
        'Saving keeps a readable copy and a space-specific note, even if the original page changes.',
        'Open a public article in a browser tab and click the PKI toolbar icon there. In Home, capture it, select your space and save. Browser settings pages cannot be captured.',
        'Save a Python list tutorial to your Python space.',
        'home',
      ),
    ],
  },
  {
    name: 'Capture and organize',
    steps: [
      step(
        'highlight',
        'Highlight and annotate',
        'A highlight preserves the wording that mattered and your reason for saving it.',
        'Select ordinary text on the article page. On Home, open Highlights and related knowledge, enter an annotation, choose a color and save the selection.',
        'Mark a definition and add “Use this for ordered tasks.”',
        'home',
        'page-tools',
      ),
      step(
        'restore',
        'Restore a highlight',
        'PKI can locate saved words again after you revisit the original page.',
        'Reopen the same article, click PKI on its toolbar, then choose Restore highlights on this page. If a passage moved ambiguously, read the saved quote in Library.',
        'Revisit the list definition you marked.',
        'home',
        'page-tools',
      ),
      step(
        'pdf',
        'Import a local PDF',
        'Selectable text becomes searchable and retains its page numbers.',
        'In Library, open Import local PDF, check the destination space and choose an unlocked text PDF. Scans need OCR before import.',
        'Import a page of lecture notes and locate its page label.',
        'library',
      ),
    ],
  },
  {
    name: 'Connect and discover',
    steps: [
      step(
        'search',
        'Search saved passages',
        'Find the paragraph you remember across your saved resources.',
        'In Library, open Search saved passages, enter a phrase and run the search. Keyword search works offline. Optional indexed embeddings also match meaning.',
        'Search for “ordered” and inspect a matching excerpt.',
        'library',
      ),
      step(
        'related',
        'Rediscover related knowledge',
        'Bring earlier reading into the context of a new page.',
        'On a different public article, click the PKI toolbar icon. From Home choose Find related knowledge, then inspect a result. An empty result means no match was found.',
        'Read about loops and look for an earlier note about lists.',
        'home',
        'page-tools',
      ),
      step(
        'graph',
        'Inspect a graph connection',
        'See which resources belong together and inspect concepts linked by earlier analyses.',
        'In Spaces open Knowledge graph. Choose a node in the list or click it in the diagram. Solid links show saved relationships; dashed links show inferred concepts.',
        'Choose your Python space and follow a resource link.',
        'spaces',
      ),
    ],
  },
  {
    name: 'AI setup',
    steps: [
      step(
        'ai',
        'Choose a local generation model',
        'Local AI can summarize passages, compare sources and give formative feedback. Saving, search by keyword and self-review work without it.',
        'In Settings expand Set up Ollama. Start the server with the displayed extension origin, install a generation model, enable local AI, test the connection and select a model. Skip this module to stay offline.',
        'Use qwen2.5:1.5b on a smaller machine. The optional nomic-embed-text model is for retrieval.',
        'settings',
      ),
    ],
  },
  {
    name: 'Learn and remember',
    steps: [
      step(
        'analysis',
        'Analyze a saved resource',
        'Compare a source with your learning goal and inspect the passages behind the explanation.',
        'Open a saved resource with a learning goal. Choose Analyze with AI, or Open saved analysis to revisit a validated result offline.',
        'Ask how an article helps explain list iteration.',
        'library',
      ),
      step(
        'chat',
        'Ask your Knowledge Space',
        'Compare material collected across the selected space. Answers include references you can inspect.',
        'With a local generation model enabled, select a space in Spaces. Under Study this space enter a question and choose Ask space.',
        'How do the examples connect lists and loops?',
        'spaces',
      ),
      step(
        'recall',
        'Practice active recall',
        'Writing from memory makes gaps easier to notice than rereading.',
        'In a saved analysis, go to recall, write your answer and reveal the expected answer or request an optional local check. Compare it with the passage.',
        'Describe what a loop does with each item.',
        'library',
      ),
      step(
        'review',
        'Review a scheduled question',
        'Spaced repetition brings a question back after time has passed. Your rating determines the next interval.',
        'On Home start a due review, answer from memory, reveal and self-assess. If none are due, inspect the upcoming date and skip this step.',
        'Choose Partially Correct to revisit a question in two days.',
        'home',
      ),
    ],
  },
  {
    name: 'Data ownership',
    steps: [
      step(
        'backup',
        'Back up or export your collection',
        'JSON restores PKI data; Markdown lets you read and reuse notes in other applications.',
        'In Settings choose Export backup, or open Storage and Markdown export and export a space. Keep the downloaded files private.',
        'Export your Python space as a linked Markdown ZIP.',
        'settings',
      ),
    ],
  },
];
export type Progress = {
  module: number;
  cursor: number;
  status: 'active' | 'paused' | 'finished';
  done: string[];
  skipped: string[];
};
export const initialProgress = (): Progress => ({
  module: 0,
  cursor: 0,
  status: 'paused',
  done: [],
  skipped: [],
});
export type Move = 'next' | 'skip' | 'back' | 'pause' | 'resume';
export function move(p: Progress, action: Move, expected?: string): Progress {
  const steps = modules[p.module]!.steps,
    s = steps[p.cursor]!;
  if (expected && (s.id !== expected || p.status !== 'active')) return p;
  if (action === 'pause') return { ...p, status: 'paused' };
  if (action === 'resume') return { ...p, status: 'active' };
  if (action === 'back') return { ...p, cursor: Math.max(0, p.cursor - 1), status: 'active' };
  const done = new Set(p.done),
    skipped = new Set(p.skipped);
  if (action === 'next') {
    done.add(s.id);
    skipped.delete(s.id);
  } else if (!done.has(s.id)) skipped.add(s.id);
  const last = p.cursor === steps.length - 1;
  return {
    ...p,
    cursor: last ? p.cursor : p.cursor + 1,
    status: last ? 'finished' : 'active',
    done: [...done],
    skipped: [...skipped],
  };
}
export function readProgress(raw: unknown): Progress | undefined {
  if (!raw || typeof raw !== 'object') return;
  const p = raw as Progress;
  if (
    !Number.isInteger(p.module) ||
    !Number.isInteger(p.cursor) ||
    !modules[p.module]?.steps[p.cursor] ||
    !['active', 'paused', 'finished'].includes(p.status) ||
    ![p.done, p.skipped].every((a) => Array.isArray(a) && a.every((v) => typeof v === 'string'))
  )
    return;
  return p;
}
export function tutorialAction(id: string) {
  window.dispatchEvent(new CustomEvent('pki-tutorial-action', { detail: id }));
}
