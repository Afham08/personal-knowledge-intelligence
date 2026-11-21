import { useState } from 'react';

import { isWebUrl, type ActiveTab } from '../../lib/active-tab';
import type { ExtractedArticle } from '../../lib/article';
import { extractFromTab } from '../../lib/extract-from-tab';
import type { KnowledgeSpace } from '../../lib/library-model';
import { SaveArticle } from './SavedLibrary';
import { useActiveTab } from './useActiveTab';

type ExtractionState =
  | { status: 'idle' | 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; article: ExtractedArticle };

type CurrentArticleProps = { space?: KnowledgeSpace; libraryReady: boolean };

export function CurrentArticle({ space, libraryReady }: CurrentArticleProps) {
  const state = useActiveTab();
  const tab = state.status === 'ready' ? state.tab : null;

  return (
    <section aria-labelledby="current-tab">
      <h2 id="current-tab">Current tab</h2>
      {state.status === 'loading' && <p role="status">Checking the active tab…</p>}
      {state.status === 'error' && <p role="alert">Could not read the active tab. Reopen PKI to try again.</p>}
      {state.status === 'ready' && !tab && <p>No active tab is available.</p>}
      {tab && !tab.url && <p>Open a web article and click the PKI toolbar icon to grant access to that tab.</p>}
      {tab?.url && !isWebUrl(tab.url) && <p>This page is restricted. Open an HTTP or HTTPS article.</p>}
      {tab?.url && isWebUrl(tab.url) && (
        <ArticleExtraction key={JSON.stringify([tab.id, tab.url])} tab={tab} space={space} libraryReady={libraryReady} />
      )}
    </section>
  );
}

type ArticleExtractionProps = CurrentArticleProps & {
  tab: ActiveTab;
};

function ArticleExtraction({ tab, space, libraryReady }: ArticleExtractionProps) {
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
      <p><strong>{tab.title || 'Untitled page'}</strong></p>
      <p>{tab.url}</p>
      <button type="button" disabled={state.status === 'loading'} onClick={() => void extract()}>
        Extract article
      </button>
      {state.status === 'loading' && <p role="status">Extracting article…</p>}
      {state.status === 'error' && <p role="alert">{state.message}</p>}
      {state.status === 'ready' && (
        <section aria-label="Extracted article">
          <h3>{state.article.title}</h3>
          {state.article.truncated && <p>Only the first 100,000 characters were extracted.</p>}
          <details>
            <summary>Read extracted text</summary>
            <p className="article-text">{state.article.text}</p>
          </details>
          {space && <SaveArticle key={space.id} article={state.article} space={space} />}
          {libraryReady && !space && <p>Create a Knowledge Space to save this article.</p>}
        </section>
      )}
    </>
  );
}
