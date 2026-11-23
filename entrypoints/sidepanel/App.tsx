import { useLayoutEffect, useMemo, useRef, useState } from 'react';

import { AiSettingsPanel, useAiSettings } from './AiSettings';
import { GuideInSettings, WelcomeGuide } from './QuickStart';
import { CurrentArticle } from './CurrentArticle';
import { Icon } from './Icon';
import { KnowledgeSpaces } from './KnowledgeSpaces';
import { ArticleRow, SavedLibrary } from './SavedLibrary';
import { backFromArticle, destinations, homeReading, libraryEntries, routeKey, type Destination, type Route } from './navigation';
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
  const positions = useRef(new Map<string, number>());
  const focusTargets = useRef(new Map<string, { element: WeakRef<HTMLElement>; articleId?: string }>());
  const [listVisit, setListVisit] = useState(0);
  const library = state.status === 'ready' ? state.library : undefined;
  const selected = library?.spaces.find((space) => space.id === spaceId) ?? library?.spaces[0];
  const entries = useMemo(() => library ? libraryEntries(library) : [], [library]);

  function navigate(next: Route, fresh = false) {
    if (routeKey(route) === routeKey(next) && !fresh) return;
    positions.current.set(routeKey(route), main.current?.scrollTop ?? 0);
    if (fresh) {
      positions.current.delete(routeKey(next));
      focusTargets.current.delete(routeKey(next));
    }
    setRoute(next);
  }

  useLayoutEffect(() => {
    const area = main.current;
    if (!area) return;
    const key = routeKey(route);
    // Initial open leaves keyboard focus in the browser. Later visits restore the reading position.
    if (!positions.current.size) return;
    area.scrollTop = positions.current.get(key) ?? 0;
    const bookmark = focusTargets.current.get(key);
    const view = area.querySelector<HTMLElement>('[data-view]:not([hidden])');
    const previous = bookmark?.element.deref();
    const candidate = previous?.isConnected ? previous : bookmark?.articleId
      ? view?.querySelector<HTMLElement>('[data-article-id="' + CSS.escape(bookmark.articleId) + '"]') : undefined;
    const bounds = candidate?.getBoundingClientRect();
    const viewport = area.getBoundingClientRect();
    const inView = bounds && bounds.bottom > viewport.top && bounds.top < viewport.bottom;
    const target = candidate && inView && view?.contains(candidate) && candidate.checkVisibility()
      ? candidate : area.scrollTop ? area : view?.querySelector<HTMLElement>('[data-page-heading]');
    target?.focus({ preventScroll: true });
  }, [route]);

  function openSetup(view: 'spaces' | 'settings') {
    setReturnTo(route);
    navigate({ view }, true);
  }

  function returnToReading() {
    if (!returnTo) return;
    navigate(returnTo);
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
    navigate(next, articleId !== reader?.articleId);
  }

  function showSpaceArticles(id: string) {
    setReader(undefined);
    setReturnTo(undefined);
    setLibraryFilter(id);
    setListVisit((visit) => visit + 1);
    navigate({ view: 'library' }, true);
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-mark"><Icon name="book" /></div>
        <div><span className="brand-name">PKI</span><span className="brand-caption">Personal Knowledge Intelligence</span></div>
      </header>

      <main ref={main} tabIndex={-1} onFocusCapture={(event) => {
        if (event.target !== main.current) focusTargets.current.set(routeKey(route), {
          element: new WeakRef(event.target), articleId: event.target.dataset.articleId,
        });
      }} className="app-main" id="main">
        {state.status === 'loading' && <p role="status">Loading your local library…</p>}
        {state.status === 'error' && <p role="alert">Your library couldn’t load. Close and reopen PKI to try again.</p>}
        <div data-view="home" hidden={route.view !== 'home'} className="page">
          <div className="page-heading">
            <h1 data-page-heading tabIndex={-1}>Your reading desk</h1>
            <p>Capture an article, save it to a space, or study it with local AI.</p>
          </div>
          <CurrentArticle space={selected} spaces={library?.spaces ?? []} onSelect={setSpaceId} libraryReady={Boolean(library)}
            ai={ai.status === 'ready' ? ai.settings : undefined}
            onOpenSaved={(id) => openArticle(id, 'home')} onSpaces={() => openSetup('spaces')} onSettings={() => openSetup('settings')} />

          <WelcomeGuide onDismiss={() => {
            const home = main.current?.querySelector<HTMLElement>('[data-view="home"]:not([hidden])');
            home?.querySelector<HTMLElement>('[data-page-heading]')?.focus();
          }} />

          {library && <>
            <section className="card" aria-labelledby="recent-heading">
              <div className="section-heading">
                <h2 id="recent-heading">{reader ? 'Continue learning' : 'Recently saved'}</h2>
                {entries.length > 0 && <button className="text-button" type="button" onClick={() => {
                  setReader(undefined);
                  setLibraryFilter('');
                  setListVisit((visit) => visit + 1);
                  navigate({ view: 'library' }, true);
                }}>Open library <Icon name="arrow" /></button>}
              </div>
              {entries.length > 0 && <p className="metadata">{reader ? 'Resume your open article or choose a recent save.' : 'Open a saved article to read or practice recall.'}</p>}
              {entries.length ? <ul className="row-list">{homeReading(entries, reader?.articleId).map((entry) => (
                <li key={entry.article.id}><ArticleRow entry={entry} resume={entry.article.id === reader?.articleId} onOpen={() => openArticle(entry.article.id, 'home')} /></li>
              ))}</ul> : <p className="empty-copy">Capture a page above and save it to a space. Reopen it here to read or practice.</p>}
            </section>
            <section className="card" aria-labelledby="home-spaces">
              <div className="section-heading">
                <h2 id="home-spaces">Knowledge Spaces</h2>
                <button className="text-button" type="button" onClick={() => navigate({ view: 'spaces' }, true)}>
                  {library.spaces.length ? 'Manage spaces' : 'Create a space'} <Icon name="arrow" />
                </button>
              </div>
              {library.spaces.length ? <ul className="row-list">{library.spaces.slice(0, 3).map((space) => (
                <li key={space.id}>
                  <button className="list-row" type="button" onClick={() => {
                    setSpaceId(space.id);
                    navigate({ view: 'spaces' }, true);
                  }}>
                    <span className="row-icon"><Icon name="spaces" /></span>
                    <span className="row-copy"><strong>{space.name}</strong>
                      <small>{space.id === selected?.id ? 'Selected space' : 'Open space'}</small></span>
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
          {library && <SavedLibrary key={listVisit} entries={entries} spaces={library.spaces} spaceFilter={libraryFilter}
            onFilter={setLibraryFilter} route={reader ?? route} ai={ai.status === 'ready' ? ai.settings : undefined}
            preferredSpace={reader?.from === 'library' && libraryFilter ? libraryFilter : selected?.id} onSettings={() => openSetup('settings')}
            onSpaces={(id) => { setSpaceId(id); openSetup('spaces'); }} onOpen={(id) => openArticle(id, 'library')}
            onList={() => { setReader(undefined); navigate({ view: 'library' }); }}
            onBack={() => { setReader(undefined); navigate(backFromArticle(route)); }} />}
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
              if (view === route.view) return;
              setReturnTo(undefined);
              navigate(view === 'library' && reader ? reader : { view });
            }}>
            <span className="nav-icon"><Icon name={view} /></span><span>{labels[view]}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
