import type { ExtractedArticle } from './article';

export type KnowledgeSpace = { id: string; name: string; learningGoal: string };
export type SavedArticle = ExtractedArticle & { id: string };
export type SpaceArticle = { spaceId: string; articleId: string; note: string };

export type Library = {
  version: 1;
  spaces: KnowledgeSpace[];
  articles: SavedArticle[];
  links: SpaceArticle[];
};

export const emptyLibrary: Library = { version: 1, spaces: [], articles: [], links: [] };

export const MAX_SPACE_NAME = 80;
export const MAX_LEARNING_GOAL = 600;
export const MAX_NOTE = 4000;

export function normalizeArticleUrl(address: string) {
  const url = new URL(address);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Only regular HTTP or HTTPS article URLs can be saved.');
  }

  // Ignore section anchors while preserving query parameters and common hash routes.
  if (!url.hash.startsWith('#/') && !url.hash.startsWith('#!/')) url.hash = '';
  return url.href;
}

export async function identifyArticle(article: ExtractedArticle): Promise<SavedArticle> {
  const normalizedUrl = normalizeArticleUrl(article.url);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalizedUrl));
  const id = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return { ...article, url: normalizedUrl, id };
}

export function attachArticle(
  library: Library,
  article: SavedArticle,
  spaceId: string,
  note: string,
): Library {
  if (!library.spaces.some((space) => space.id === spaceId)) {
    throw new Error('Select an existing Knowledge Space.');
  }

  if (library.links.some((link) => link.spaceId === spaceId && link.articleId === article.id)) {
    return library;
  }

  const articles = library.articles.some((stored) => stored.id === article.id)
    ? library.articles
    : [...library.articles, article];
  return {
    ...library,
    articles,
    links: [...library.links, { spaceId, articleId: article.id, note: note.trim().slice(0, MAX_NOTE) }],
  };
}

export function editArticleNote(library: Library, spaceId: string, articleId: string, note: string): Library {
  const link = library.links.find((item) => item.spaceId === spaceId && item.articleId === articleId);
  if (!link) throw new Error('This article is no longer saved in this Knowledge Space.');
  const cleanNote = note.trim().slice(0, MAX_NOTE);
  if (cleanNote === link.note) return library;
  return { ...library, links: library.links.map((item) => item === link ? { ...item, note: cleanNote } : item) };
}
