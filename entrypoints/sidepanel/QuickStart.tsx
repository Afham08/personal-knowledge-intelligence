import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { dismissGuide, guidePreference } from './guide-preference';
import {
  initialProgress,
  modules,
  move,
  readProgress,
  type Progress,
  type Move,
  type View,
} from '../../lib/tutorial';

const key = 'pki.tutorial.v1',
  demoKey = 'pki.tutorial.pythonDemo',
  dismissed = guidePreference;
type Data = { welcome: boolean; progress?: Progress; demo: boolean };
export function useEducation(navigate: (v: View, reader: boolean) => void) {
  const [data, setData] = useState<Data>({ welcome: false, demo: false }),
    [message, setMessage] = useState(''),
    [celebrate, setCelebrate] = useState(false);
  useEffect(() => {
    let generation = 0;
    function refresh() {
      const g = ++generation;
      void browser.storage.local
        .get([key, demoKey, dismissed])
        .then((d) => {
          if (g === generation)
            setData({
              welcome: d[dismissed] !== true && !readProgress(d[key]),
              progress: readProgress(d[key]),
              demo: d[demoKey] === true,
            });
        })
        .catch(() => {
          if (g === generation) setMessage('Tutorial preferences could not be read.');
        });
    }
    const changed = (changes: Record<string, unknown>, area: string) => {
      if (area === 'local' && [key, demoKey, dismissed].some((k) => k in changes)) refresh();
    };
    browser.storage.onChanged.addListener(changed);
    refresh();
    return () => {
      generation++;
      browser.storage.onChanged.removeListener(changed);
    };
  }, []);
  useEffect(
    () => () => {
      document.querySelectorAll('.tour-target').forEach((el) => el.classList.remove('tour-target'));
    },
    [data.progress],
  );
  async function write(fn: () => Promise<void>) {
    try {
      setMessage('');
      await navigator.locks.request(key, fn);
    } catch {
      setMessage('Could not save the tutorial preference. Please try again.');
    }
  }
  function show(view: View, target: string) {
    navigate(view, ['analysis', 'recall'].includes(target));
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const panel = document.querySelector<HTMLElement>('[data-view="' + view + '"]');
        const element = panel?.querySelector<HTMLElement>('[data-tour="' + target + '"]');
        if (!element) {
          setMessage(
            ['analysis', 'recall'].includes(target)
              ? 'Open a saved resource with an analysis, or use the offline examples in the demo.'
              : 'Follow the instructions in the guide above.',
          );
          return;
        }
        if (element instanceof HTMLDetailsElement) element.open = true;
        element.classList.add('tour-target');
        element.setAttribute('tabindex', '-1');
        element.focus({ preventScroll: true });
        element.scrollIntoView({ block: 'start' });
      }),
    );
  }
  function begin(module: number, restart = false) {
    void write(async () => {
      const stored = readProgress((await browser.storage.local.get(key))[key]);
      const p = {
        ...(restart ? initialProgress() : (stored ?? initialProgress())),
        module,
        cursor: 0,
        status: 'active' as const,
      };
      await browser.storage.local.set({ [key]: p, [dismissed]: true });
      setCelebrate(false);
      navigate(modules[module]!.steps[0]!.view, false);
    });
  }
  function advance(action: Move, expected?: string) {
    void write(async () => {
      const p = readProgress((await browser.storage.local.get(key))[key]);
      if (!p) return;
      const next = move(p, action, expected);
      if (next === p) return;
      await browser.storage.local.set({ [key]: next });
      setCelebrate(next.status === 'finished');
    });
  }
  useEffect(() => {
    const step =
      data.progress?.status === 'active'
        ? modules[data.progress.module]?.steps[data.progress.cursor]
        : undefined;
    if (!step) return;
    const listener = (e: Event) => {
      if ((e as CustomEvent).detail === step.id) advance('next', step.id);
    };
    window.addEventListener('pki-tutorial-action', listener);
    return () => window.removeEventListener('pki-tutorial-action', listener);
  }, [data.progress]);
  function loadDemo() {
    void write(async () => {
      await browser.storage.local.set({ [demoKey]: true, [dismissed]: true });
      show('spaces', 'demo');
    });
  }
  function removeDemo() {
    if (
      window.confirm('Remove the Python demo from this profile? Your own spaces and study records are kept.')
    )
      void write(() => browser.storage.local.remove(demoKey));
  }
  function restart() {
    void write(async () => {
      await browser.storage.local.remove(key);
      await browser.storage.local.set({ [dismissed]: false });
      setCelebrate(false);
      navigate('home', false);
    });
  }
  return {
    data,
    message,
    celebrate,
    close: () => setCelebrate(false),
    show,
    begin,
    advance,
    loadDemo,
    removeDemo,
    restart,
    skip: () => void write(() => dismissGuide(browser.storage)),
  };
}
type Education = ReturnType<typeof useEducation>;
export function WelcomeGuide({ edu }: { edu: Education }) {
  if (!edu.data.welcome) return null;
  return (
    <section className="card tour-card">
      <h2>Turn reading into a study collection</h2>
      <p>
        A bookmark brings you back to a page. A Knowledge Space keeps the passages, notes and questions you
        want to study together. When you use local chat, its answers point back to that collection.
      </p>
      <p>
        Capture, highlight, import PDFs and search by keyword offline. Optional local AI answers from your
        saved excerpts and creates recall practice.
      </p>
      <div className="button-row">
        <button className="button-primary" onClick={() => edu.begin(0)}>
          Start guided tutorial
        </button>
        <button onClick={edu.loadDemo}>Explore demo Knowledge Space</button>
        <button className="text-button" onClick={edu.skip}>
          Explore on my own
        </button>
      </div>
    </section>
  );
}
export function TutorialPanel({ edu }: { edu: Education }) {
  const p = edu.data.progress;
  if (!p || p.status === 'paused' || (p.status === 'finished' && !edu.celebrate))
    return edu.message ? <p role="status">{edu.message}</p> : null;
  const m = modules[p.module]!,
    s = m.steps[p.cursor]!;
  if (p.status === 'finished')
    return (
      <section className="card tour-card" aria-live="polite">
        <h2>{m.name} walkthrough finished</h2>
        <p>
          {m.steps.filter((s) => p.done.includes(s.id)).length} of {m.steps.length} steps completed. Explore
          optional modules in Settings → Help and tutorials.
        </p>
        <button onClick={edu.close}>Close tutorial</button>
      </section>
    );
  return (
    <section className="card tour-card" aria-label="Guided tutorial">
      <div aria-live="polite">
        <small>
          {m.name} · Step {p.cursor + 1} of {m.steps.length}
        </small>
        <h2>{s.title}</h2>
      </div>
      <p>{s.why}</p>
      <p>{s.how}</p>
      <details>
        <summary>Practical example</summary>
        <p>{s.example}</p>
      </details>
      <button className="button-primary" onClick={() => edu.show(s.view, s.target)}>
        Show me where
      </button>
      <div className="button-row">
        <button disabled={!p.cursor} onClick={() => edu.advance('back')}>
          Back a step
        </button>
        <button onClick={() => edu.advance('next', s.id)}>I did this</button>
        <button onClick={() => edu.advance('skip', s.id)}>Skip step</button>
        <button onClick={() => edu.advance('pause')}>Pause tutorial</button>
      </div>
      {edu.message && <p role="status">{edu.message}</p>}
    </section>
  );
}
export function GuideInSettings({ edu }: { edu: Education }) {
  const p = edu.data.progress;
  return (
    <details className="card guide-settings">
      <summary>Help and tutorials</summary>
      <p>
        Start with a space and one saved article. The other modules can be taken in any order. Completed
        actions advance the guide, or you can move through it manually.
      </p>
      {p?.status === 'paused' && (
        <button onClick={() => edu.advance('resume')}>Resume {modules[p.module]!.name}</button>
      )}
      <details>
        <summary>Tutorial modules</summary>
        {modules.map((m, i) => (
          <button key={m.name} onClick={() => edu.begin(i)}>
            {m.name} · {m.steps.filter((s) => p?.done.includes(s.id)).length}/{m.steps.length}
          </button>
        ))}
      </details>
      <button onClick={edu.loadDemo}>
        {edu.data.demo ? 'Open demo Knowledge Space' : 'Load demo Knowledge Space'}
      </button>
      {edu.data.demo && <button onClick={edu.removeDemo}>Remove demo space</button>}
      <details>
        <summary>Three ways to use PKI</summary>
        <p>
          <strong>Student.</strong> Import module PDFs into one subject space, annotate your thinking in its
          notes and search by page. With AI, generate recall questions; later review them offline.
        </p>
        <p>
          <strong>Developer.</strong> Save documentation, highlight a useful explanation and request related
          knowledge on another article. Keyword matching works offline; an optional local embedding model can
          find similar wording.
        </p>
        <p>
          <strong>Researcher.</strong> Collect articles and papers, browse their graph and inspect excerpts
          side by side. Local AI can suggest relationships. Export a linked Markdown collection for your own
          synthesis.
        </p>
      </details>
      <details>
        <summary>Feature guide</summary>
        {modules
          .flatMap((m) => m.steps)
          .map((s) => (
            <p key={s.id}>
              <strong>{s.title}.</strong> {s.why}
            </p>
          ))}
      </details>
      <details>
        <summary>Privacy, permissions and common questions</summary>
        <p>
          <strong>Why click the toolbar icon?</strong> It grants temporary access to the current tab. Then
          choose Capture article or save selected text. Browser settings pages are restricted.
        </p>
        <p>
          <strong>Why is AI unavailable?</strong> Local AI starts off. In Local AI below, check the server,
          extension origin, permission and installed generation model. The setup section includes commands for
          this installation.
        </p>
        <p>
          <strong>Where is my work?</strong> It stays in this browser profile. Export a backup before removing
          the extension. Demo examples and tutorial choices are separate from your study records.
        </p>
        <p>
          <strong>Is a source reference proof?</strong> Open the excerpt and check the reasoning. Model
          feedback is a study aid; you can adjust a review rating.
        </p>
      </details>
      <button onClick={edu.restart}>Restart onboarding</button>
    </details>
  );
}
