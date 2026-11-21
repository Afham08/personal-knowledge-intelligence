import { useEffect, useState } from 'react';

import { readLibrary, watchLibrary } from '../../lib/library';
import type { Library } from '../../lib/library-model';

type LibraryState =
  | { status: 'loading' | 'error' }
  | { status: 'ready'; library: Library };

export function useLibrary(): LibraryState {
  const [state, setState] = useState<LibraryState>({ status: 'loading' });

  useEffect(() => {
    let request = 0;

    async function refresh() {
      const current = ++request;
      try {
        const library = await readLibrary();
        if (current === request) setState({ status: 'ready', library });
      } catch {
        if (current === request) setState({ status: 'error' });
      }
    }

    const unwatch = watchLibrary(refresh);
    void refresh();

    return () => {
      request++;
      unwatch();
    };
  }, []);

  return state;
}
