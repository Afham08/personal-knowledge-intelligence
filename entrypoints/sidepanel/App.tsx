import { useState } from 'react';

import { CurrentArticle } from './CurrentArticle';
import { KnowledgeSpaces } from './KnowledgeSpaces';
import { SavedLibrary } from './SavedLibrary';
import { useLibrary } from './useLibrary';

export default function App() {
  const state = useLibrary();
  const [spaceId, setSpaceId] = useState<string>();
  const library = state.status === 'ready' ? state.library : undefined;
  const selected = library?.spaces.find((space) => space.id === spaceId) ?? library?.spaces[0];

  return (
    <main>
      <h1>Personal Knowledge Intelligence</h1>
      {state.status === 'loading' && <p role="status">Loading Knowledge Spaces and saved articles…</p>}
      {state.status === 'error' && <p role="alert">The local library could not be loaded. Reopen PKI to try again.</p>}
      {library && <KnowledgeSpaces spaces={library.spaces} selected={selected} onSelect={setSpaceId} />}
      <CurrentArticle space={selected} libraryReady={Boolean(library)} />
      {library && <SavedLibrary key={selected?.id} library={library} space={selected} />}
    </main>
  );
}
