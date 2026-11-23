import type { Library, SavedArticle, SpaceArticle, KnowledgeSpace } from '../../lib/library-model';

export const destinations = ['home', 'spaces', 'library', 'settings'] as const;
export type Destination = typeof destinations[number];

export type Route =
  | { view: Destination }
  | { view: 'library'; articleId: string; from: 'home' | 'library' };

export function studySpace(entry: LibraryEntry, preferredId?: string) {
  return entry.memberships.find(({ space }) => space.id === preferredId)?.space ?? entry.memberships[0]?.space;
}

export function backFromArticle(route: Route): Route {
  return { view: 'from' in route ? route.from : 'library' };
}

export type LibraryEntry = {
  article: SavedArticle;
  memberships: { space: KnowledgeSpace; link: SpaceArticle }[];
};

export function libraryEntries(library: Library): LibraryEntry[] {
  const spaces = new Map(library.spaces.map((space) => [space.id, space]));
  const articles = new Map(library.articles.map((article) => [article.id, article]));
  const entries = new Map<string, LibraryEntry>();

  // Links are appended on save. The latest link places a shared article once in the list.
  for (const link of library.links.slice().reverse()) {
    const space = spaces.get(link.spaceId);
    const article = articles.get(link.articleId);
    if (!space || !article) continue;

    const entry = entries.get(article.id) ?? { article, memberships: [] };
    entry.memberships.push({ space, link });
    entries.set(article.id, entry);
  }

  return [...entries.values()];
}

export function articleHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

export function filterLibrary(entries: LibraryEntry[], query: string, spaceId: string): LibraryEntry[] {
  const term = query.trim().toLowerCase();
  return entries.filter(({ article, memberships }) => {
    if (spaceId && !memberships.some(({ space }) => space.id === spaceId)) return false;
    return !term || [article.title, articleHost(article.url), ...memberships.map(({ space }) => space.name)]
      .some((value) => value.toLowerCase().includes(term));
  });
}
