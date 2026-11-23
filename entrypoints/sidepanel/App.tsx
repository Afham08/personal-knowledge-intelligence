import { useEffect, useMemo, useRef, useState } from 'react';

import { AiSettingsPanel, useAiSettings } from './AiSettings';
import { GuideInSettings, WelcomeGuide } from './QuickStart';
import { CurrentArticle } from './CurrentArticle';
import { Icon } from './Icon';
import { KnowledgeSpaces } from './KnowledgeSpaces';
import { ArticleRow, SavedLibrary } from './SavedLibrary';
import { backFromArticle, destinations, libraryEntries, type Destination, type Route } from './navigation';
import { useLibrary } from './useLibrary';

const labels: Record<Destination, string> = {
  home: 'Home', spaces: 'Spaces', library: 'Library', settings: 'Settings',
};

export default function App() {
  const state = useLibrary();
  const ai = useAiSettings();
  const [route, setRoute] = useState<Route>({ view: 'home' });
  const [returnTo, setReturnTo] = useState<Route>();
  const [reader, setReader] = useState<Extract<Route, { articleId: string }>>();
  const [spaceId, setSpaceId] = useState<string>();
  const [libraryFilter, setLibraryFilter] = useState('');
  const main = useRef<HTMLElement>(null);
  const previousRoute = useRef(route);
  const library = state.status === 'ready' ? state.library : undefined;
  const selected = library?.spaces.find((space) => space.id === spaceId) ?? library?.spaces[0];
  const entries = useMemo(() => library ? libraryEntries(library) : [], [library]);

  useEffect(() => {
    if (previousRoute.current === route) return;
    previousRoute.current = route;
    const area = main.current;
    if (!area) return;
    area.scrollTop = 0;
    area.querySelector<HTMLElement>('[data-view]:not([hidden]) [data-page-heading]')?.focus({ preventScroll: true });
  }, [route]);

  function openSetup(view: 'spaces' | 'settings') {
    setReturnTo(route);
    setRoute({ view });
  }

  function returnToReading() {
    if (!returnTo) return;
    setRoute(returnTo);
    setReturnTo(undefined);
  }

  const returnButton = returnTo && (
    <button className="text-button back-button" type="button" onClick={returnToReading}>
      <Icon name="back" /> {returnTo.view === 'home' ? 'Return to current page' : 'Return to saved article'}
    </button>
  );

  function openArticle(articleId: string, from: 'home' | 'library') {
    const next = { view: 'library', articleId, from } as const;
    setReader(next);
    setRoute(next);
  }

  function showSpaceArticles(id: string) {
    setReader(undefined);
    setReturnTo(undefined);
    setLibraryFilter(id);
    setRoute({ view: 'library' });
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-mark"><Icon name="book" /></div>
        <div><span className="brand-name">PKI</span><span className="brand-caption">Personal Knowledge Intelligence</span></div>
      </header>

      <main ref={main} className="app-main" id="main">
        {state.status === 'loading' && <p role="status">Loading your local library…</p>}
        {state.status === 'error' && <p role="alert">Your library couldn’t load. Close and reopen PKI to try again.</p>}
        <div data-view="home" hidden={route.view !== 'home'} className="page">
          <div className="page-heading">
            <h1 data-page-heading tabIndex={-1}>Your reading desk</h1>
            <p>Capture an article, save it to a space, or study it with local AI.</p>
          </div>
          <CurrentArticle space={selected} spaces={library?.spaces ?? []} onSelect={setSpaceId} libraryReady={Boolean(library)}
            ai={ai.status === 'ready' ? ai.settings : undefined}
            onSpaces={() => openSetup('spaces')} onSettings={() => openSetup('settings')} />

          <WelcomeGuide onDismiss={() => {
            const home = main.current?.querySelector<HTMLElement>('[data-view="home"]:not([hidden])');
            home?.querySelector<HTMLElement>('[data-page-heading]')?.focus();
          }} />

          {library && <>
            <section className="card" aria-labelledby="recent-heading">
              <div className="section-heading">
                <h2 id="recent-heading">Recently saved</h2>
                <button className="text-button" type="button" onClick={() => {
                  setReader(undefined);
                  setLibraryFilter('');
                  setRoute({ view: 'library' });
                }}>Open library <Icon name="arrow" /></button>
              </div>
              {entries.length > 0 && <p className="metadata">Open an article to continue reading or practice recall.</p>}
              {entries.length ? <ul className="row-list">{entries.slice(0, 3).map((entry) => (
                <li key={entry.article.id}><ArticleRow entry={entry} onOpen={() => openArticle(entry.article.id, 'home')} /></li>
              ))}</ul> : <p className="empty-copy">Articles you save to a Knowledge Space will appear here.</p>}
            </section>
            <section className="card" aria-labelledby="home-spaces">
              <div className="section-heading">
                <h2 id="home-spaces">Knowledge Spaces</h2>
                <button className="text-button" type="button" onClick={() => setRoute({ view: 'spaces' })}>
                  {library.spaces.length ? 'Manage spaces' : 'Create a space'} <Icon name="arrow" />
                </button>
              </div>
              {library.spaces.length ? <ul className="row-list">{library.spaces.slice(0, 3).map((space) => (
                <li key={space.id}>
                  <button className="list-row" type="button" onClick={() => {
                    setSpaceId(space.id);
                    setRoute({ view: 'spaces' });
                  }}>
                    <span className="row-icon"><Icon name="spaces" /></span>
                    <span className="row-copy"><strong>{space.name}</strong>
                      <small>{space.id === selected?.id ? 'Active for analysis' : 'Open space'}</small></span>
                    <Icon name="arrow" />
                  </button>
                </li>
              ))}</ul> : <p className="empty-copy">Group your reading around a learning goal.</p>}
            </section>
          </>}
        </div>

        <div data-view="spaces" hidden={route.view !== 'spaces'} className="page">
          <div className="page-heading">{returnButton}<h1 data-page-heading tabIndex={-1}>Knowledge Spaces</h1>
            <p>Organize reading around the things you want to learn.</p></div>
          {library && <KnowledgeSpaces spaces={library.spaces} selected={selected} onSelect={setSpaceId}
            onViewArticles={showSpaceArticles} links={library.links} />}
        </div>

        <div data-view="library" hidden={route.view !== 'library'} className="page">
          {library && <SavedLibrary entries={entries} spaces={library.spaces} spaceFilter={libraryFilter}
            onFilter={setLibraryFilter} route={reader ?? route} ai={ai.status === 'ready' ? ai.settings : undefined}
            preferredSpace={reader?.from === 'library' && libraryFilter ? libraryFilter : selected?.id} onSettings={() => openSetup('settings')}
            onSpaces={(id) => { setSpaceId(id); openSetup('spaces'); }} onOpen={(id) => openArticle(id, 'library')}
            onBack={() => { setReader(undefined); setRoute(backFromArticle(route)); }} />}
          {!library && <div className="page-heading"><h1 data-page-heading tabIndex={-1}>Library</h1></div>}
        </div>

        <div data-view="settings" hidden={route.view !== 'settings'} className="page">
          <div className="page-heading">{returnButton}<h1 data-page-heading tabIndex={-1}>Settings</h1>
            <p>Manage local AI and see what PKI stores.</p></div>
          <GuideInSettings />
          <AiSettingsPanel state={ai} />
          <section className="card" aria-labelledby="privacy-heading">
            <div className="card-heading"><span className="row-icon"><Icon name="shield" /></span>
              <h2 id="privacy-heading">Data on this device</h2></div>
            <p>PKI keeps saved articles, goals, and notes in this browser profile. You can use the library with AI turned off.</p>
            <p>Analysis and answer checks run on demand through local Ollama. Recall drafts last for the current practice session.</p>
          </section>
        </div>
      </main>

      <nav className="main-nav" aria-label="Main navigation">
        {destinations.map((view) => (
          <button key={view} type="button" aria-current={route.view === view ? 'page' : undefined}
            aria-label={view === 'spaces' ? 'Knowledge Spaces' : undefined} onClick={() => {
              setReturnTo(undefined);
              if (view === 'library' && route.view === 'library') {
                setReader(undefined);
                setRoute({ view });
              } else setRoute(view === 'library' && reader ? reader : { view });
            }}>
            <span className="nav-icon"><Icon name={view} /></span><span>{labels[view]}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
