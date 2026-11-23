import { useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';

import { Icon } from './Icon';

import { dismissGuide, watchGuide } from './guide-preference';

function Steps() {
  return (
    <ol className="guide-steps">
      <li><strong>Create a Knowledge Space.</strong> In Spaces, name a topic and add a learning goal if you have one.</li>
      <li><strong>Save your first article.</strong> Open an article, click the PKI toolbar icon, then choose Capture article on Home. Pick a space and save.</li>
      <li><strong>Practice when you’re ready.</strong> Local AI is optional. Connect Ollama in Settings, open a saved article, and choose Analyze with AI. Answer a recall question and check your answer against the source.</li>
    </ol>
  );
}

export function GuideInSettings() {
  return (
    <details className="card guide-settings">
      <summary>Quick start guide</summary>
      <Steps />
    </details>
  );
}

export function WelcomeGuide({ onDismiss }: { onDismiss: () => void }) {
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const stop = watchGuide(browser.storage, setVisible);
    return () => {
      stop();
      mounted.current = false;
    };
  }, []);

  async function dismiss() {
    setSaving(true);
    try {
      await dismissGuide(browser.storage);
      if (mounted.current) {
        setVisible(false);
        onDismiss();
      }
    } catch {
      if (mounted.current) setError('Couldn’t remember this choice. Try again or continue using Home.');
    } finally {
      if (mounted.current) setSaving(false);
    }
  }

  if (!visible) return null;
  return (
    <section className="card" aria-labelledby="guide-heading">
      <div className="card-heading"><span className="row-icon"><Icon name="book" /></span>
        <h2 id="guide-heading">Getting started</h2></div>
      <p>Build a reading collection around what you want to learn. Everything stays on this device.</p>
      {expanded && <Steps />}
      <div className="button-row">
        <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Hide steps' : 'Show quick start'}
        </button>
        <button className="text-button" type="button" disabled={saving} onClick={() => void dismiss()}>
          {expanded ? 'Finish guide' : 'Skip guide'}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
