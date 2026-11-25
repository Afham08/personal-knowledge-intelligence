import { browser } from 'wxt/browser';
import { cacheKey, libraryKey, fromStorage } from './backup';
import { knowledgeKey } from './revision';
import { studyKey } from './study';
import { articleFingerprint } from './ai/analysis';

export function deleteResource(id: string) {
  return navigator.locks.request(libraryKey, () =>
    navigator.locks.request(cacheKey, () =>
      navigator.locks.request('pki.study', () =>
        navigator.locks.request(knowledgeKey, async () => {
          const b = fromStorage(await browser.storage.local.get(null));
          const a = b.library.articles.find((a) => a.id === id);
          if (!a) return;
          const lib = b.library;
          lib.articles = lib.articles.filter((a) => a.id !== id);
          lib.links = lib.links.filter((l) => l.articleId !== id);
          lib.highlights = lib.highlights?.filter((h) => h.articleId !== id) ?? [];
          const knowledge = b.knowledge;
          knowledge.cards = knowledge.cards.filter((c) => c.url !== a.url);
          const remaining = new Set(knowledge.cards.map((c) => c.id));
          knowledge.ratings = knowledge.ratings.filter((r) => remaining.has(r.cardId));
          knowledge.turns = knowledge.turns.filter((t) => !t.sources.some((s) => s.id.startsWith(id + '/')));
          const fingerprint = await articleFingerprint(a);
          if (
            !lib.articles.some((v) => v.title === a.title && v.text === a.text && v.truncated === a.truncated)
          ) {
            for (const [k, r] of Object.entries(b.cache))
              if ((r as { fingerprint?: string })?.fingerprint === fingerprint) delete b.cache[k];
          }
          await browser.storage.local.set({
            [libraryKey]: lib,
            [knowledgeKey]: knowledge,
            [cacheKey]: b.cache,
          });
          await browser.storage.local.remove(b.study.filter((r) => r.url === a.url).map(studyKey));
        }),
      ),
    ),
  );
}
