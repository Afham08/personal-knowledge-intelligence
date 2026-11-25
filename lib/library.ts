import { browser } from 'wxt/browser';

import { validateLibrary } from './backup';
import type { ExtractedArticle } from './article';
import {
  attachArticle, editArticleNote, emptyLibrary, identifyArticle, MAX_LEARNING_GOAL, MAX_SPACE_NAME,
  type Library,
} from './library-model';

const STORAGE_KEY = 'pki.library';

export async function readLibrary(): Promise<Library> {
  const stored = (await browser.storage.local.get(STORAGE_KEY))[STORAGE_KEY] as Partial<Library> | undefined;
  if (!stored) return emptyLibrary;
  if (stored.version !== 1 || !Array.isArray(stored.spaces) ||
      !Array.isArray(stored.articles) || !Array.isArray(stored.links)) {
    throw new Error('The saved library format could not be read.');
  }
  return validateLibrary(stored);
}

export function watchLibrary(refresh: () => void): () => void {
  const listener: Parameters<typeof browser.storage.onChanged.addListener>[0] = (changes, area) => {
    if (area === 'local' && STORAGE_KEY in changes) refresh();
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}

export async function updateLibrary(update: (current: Library) => Library): Promise<boolean> {
  // One writer at a time across side panels, with all related records committed in one set().
  return await navigator.locks.request(STORAGE_KEY, async () => {
    const current = await readLibrary();
    const next = update(current);
    if (next === current) return false;
    await browser.storage.local.set({ [STORAGE_KEY]: next });
    return true;
  });
}

export async function createSpace(name: string, learningGoal: string): Promise<string> {
  const cleanName = name.trim();
  if (!cleanName || cleanName.length > MAX_SPACE_NAME) {
    throw new Error('Enter a Knowledge Space name of 1 to 80 characters.');
  }

  const id = crypto.randomUUID();
  await updateLibrary((current) => ({
    ...current,
    spaces: [...current.spaces, { id, name: cleanName, learningGoal: learningGoal.trim().slice(0, MAX_LEARNING_GOAL) }],
  }));
  return id;
}

export async function updateLearningGoal(spaceId: string, learningGoal: string): Promise<void> {
  await updateLibrary((current) => ({
    ...current,
    spaces: current.spaces.map((space) =>
      space.id === spaceId ? { ...space, learningGoal: learningGoal.trim().slice(0, MAX_LEARNING_GOAL) } : space,
    ),
  }));
}

export async function saveArticle(spaceId: string, article: ExtractedArticle, note: string) {
  const identified = await identifyArticle(article);
  const added = await updateLibrary((current) => attachArticle(current, identified, spaceId, note));
  return { articleId: identified.id, added };
}

export async function updateNote(spaceId: string, articleId: string, note: string): Promise<void> {
  await updateLibrary((current) => editArticleNote(current, spaceId, articleId, note));
}
