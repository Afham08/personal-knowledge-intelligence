import { useState } from 'react';

import { isWebUrl, type ActiveTab } from '../../lib/active-tab';
import type { AiSettings } from '../../lib/ai/local-store';
import type { ExtractedArticle } from '../../lib/article';
import { extractFromTab } from '../../lib/extract-from-tab';
import type { KnowledgeSpace } from '../../lib/library-model';
import { ArticleAnalysis } from './ArticleAnalysis';
import { Icon } from './Icon';
import { SaveArticle } from './SavedLibrary';
import { articleHost } from './navigation';
import { useActiveTab } from './useActiveTab';

type ExtractionState =
  | { status: 'idle' | 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; article: ExtractedArticle };

type CurrentArticleProps = {
  space?: KnowledgeSpace;
  spaces: KnowledgeSpace[];
  onSelect: (id: string) => void;
  libraryReady: boolean;
  ai?: AiSettings;
  onSpaces: () => void;
  onOpenSaved: (id: string) => void;
  onSettings: () => void;
};

export function CurrentArticle(props: CurrentArticleProps) {
  const state = useActiveTab();
  const tab = state.status === 'ready' ? state.tab : null;
  if (tab?.url && isWebUrl(tab.url) && state.status === 'ready') {
    return <ArticleExtraction key={JSON.stringify([tab.id, tab.url, state.documentVersion])} tab={tab} {...props} />;
  }

  return (
    <section className="card capture-card" aria-labelledby="current-tab">
      <div className="card-heading"><span className="row-icon"><Icon name="page" /></span>
        <h2 id="current-tab">Current page</h2></div>
      {state.status === 'loading' && <p role="status">Checking the active tab…</p>}
      {state.status === 'error' && <p role="alert">Couldn’t read the active tab. Reopen PKI to try again.</p>}
      {state.status === 'ready' && (tab?.url
        ? <p>This page is restricted. Open an HTTP or HTTPS article.</p>
        : <p>Open a web article and click the PKI toolbar icon to give this panel access.</p>)}
    </section>
  );
}

function ArticleExtraction({ tab, space, spaces, onSelect, libraryReady, ai, onSpaces, onSettings, onOpenSaved }: CurrentArticleProps & { tab: ActiveTab }) {
  const [state, setState] = useState<ExtractionState>({ status: 'idle' });

  async function extract() {
    setState({ status: 'loading' });
    try {
      setState({ status: 'ready', article: await extractFromTab(tab) });
    } catch (error) {
      setState({ status: 'error', message: error instanceof Error ? error.message : 'Extraction failed.' });
    }
  }

  return (
    <>
      <section className="card capture-card" aria-labelledby="current-tab">
        <div className="card-heading"><span className="row-icon"><Icon name="page" /></span>
          <h2 id="current-tab">Current page</h2></div>
        <h3 className="capture-title">{state.status === 'ready' ? state.article.title : tab.title || 'Untitled page'}</h3>
        <p className="metadata" title={tab.url}>{articleHost(tab.url ?? '')}</p>
        {state.status === 'ready' ? (
          <>
            <details className="disclosure">
              <summary>Read extracted text</summary>
              {state.article.truncated && <p>Showing the first 100,000 characters.</p>}
              <p className="article-text">{state.article.text}</p>
              <button className="text-button" type="button" disabled={tab.loading} onClick={() => void extract()}>Capture again</button>
            </details>
            {space && <SaveArticle key={space.id} article={state.article} space={space} spaces={spaces} onSelect={onSelect} onOpenSaved={onOpenSaved} />}
            {libraryReady && !space && (
              <button className="button-primary" type="button" onClick={onSpaces}>Create a space to save this article</button>
            )}
            {ai && !ai.enabled && (
              <button className="text-button" type="button" onClick={onSettings}>Set up local AI <Icon name="arrow" /></button>
            )}
          </>
        ) : (
          <button className="button-primary" type="button" disabled={tab.loading || state.status === 'loading'}
            onClick={() => void extract()}>{state.status === 'loading' ? 'Extracting…' : 'Capture article'} <Icon name="arrow" /></button>
        )}
        {tab.loading && <p role="status">Waiting for the page to finish loading…</p>}
        {state.status === 'loading' && <p role="status">Reading the current page…</p>}
        {state.status === 'error' && <p role="alert">{state.message}</p>}
      </section>
      {state.status === 'ready' && ai?.enabled && space && (
        <ArticleAnalysis key={JSON.stringify([space.id, space.learningGoal, ai.modelName])} article={state.article}
          goal={space.learningGoal} modelName={ai.modelName} onSpaces={onSpaces} onSettings={onSettings} />
      )}
    </>
  );
}
