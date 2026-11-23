import { useEffect, useMemo, useRef, useState } from 'react';

import { AiSettingsPanel, useAiSettings } from './AiSettings';
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

  function openArticle(articleId: string, from: 'home' | 'library') {
    setRoute({ view: 'library', articleId, from });
  }

  function showSpaceArticles(id: string) {
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
          <CurrentArticle space={selected} libraryReady={Boolean(library)}
            ai={ai.status === 'ready' ? ai.settings : undefined}
            onSpaces={() => setRoute({ view: 'spaces' })} onSettings={() => setRoute({ view: 'settings' })} />

          {library && <>
            <section className="card" aria-labelledby="recent-heading">
              <div className="section-heading">
                <h2 id="recent-heading">Recently saved</h2>
                <button className="text-button" type="button" onClick={() => {
                  setLibraryFilter('');
                  setRoute({ view: 'library' });
                }}>Open library <Icon name="arrow" /></button>
              </div>
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
          <div className="page-heading"><h1 data-page-heading tabIndex={-1}>Knowledge Spaces</h1>
            <p>Organize reading around the things you want to learn.</p></div>
          {library && <KnowledgeSpaces spaces={library.spaces} selected={selected} onSelect={setSpaceId}
            onViewArticles={showSpaceArticles} links={library.links} />}
        </div>

        <div data-view="library" hidden={route.view !== 'library'} className="page">
          {library && <SavedLibrary entries={entries} spaces={library.spaces} spaceFilter={libraryFilter}
            onFilter={setLibraryFilter} route={route} onOpen={(id) => openArticle(id, 'library')}
            onBack={() => setRoute(backFromArticle(route))} />}
          {!library && <div className="page-heading"><h1 data-page-heading tabIndex={-1}>Library</h1></div>}
        </div>

        <div data-view="settings" hidden={route.view !== 'settings'} className="page">
          <div className="page-heading"><h1 data-page-heading tabIndex={-1}>Settings</h1>
            <p>Manage local AI and see what PKI stores.</p></div>
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
            aria-label={view === 'spaces' ? 'Knowledge Spaces' : undefined} onClick={() => setRoute({ view })}>
            <span className="nav-icon"><Icon name={view} /></span><span>{labels[view]}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
