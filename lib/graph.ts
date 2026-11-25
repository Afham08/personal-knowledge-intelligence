import type { Library } from './library-model';
import type { Card } from './revision';
export function knowledgeGraph(library: Library, cards: Card[], space: string) {
  const nodes = new Map<
    string,
    { id: string; label: string; kind: string; articleId?: string; detail?: string }
  >();
  const edges = new Map<string, { a: string; b: string; label: string; inferred: boolean }>();
  function edge(a: string, b: string, label: string, inferred = false) {
    edges.set(JSON.stringify([a, b, label]), { a, b, label, inferred });
  }
  for (const s of library.spaces.filter((s) => !space || space === s.id)) {
    nodes.set('s' + s.id, { id: 's' + s.id, label: s.name, kind: 'Knowledge Space', detail: s.learningGoal });
    for (const link of library.links.filter((l) => l.spaceId === s.id)) {
      const a = library.articles.find((a) => a.id === link.articleId);
      if (!a) continue;
      nodes.set(a.id, {
        id: a.id,
        label: a.title,
        kind: a.pages ? 'PDF' : 'Article',
        articleId: a.id,
        detail: link.note,
      });
      edge('s' + s.id, a.id, 'Saved in space');
      for (const h of (library.highlights ?? []).filter((h) => h.articleId === a.id && h.spaceId === s.id)) {
        nodes.set('h' + h.id, {
          id: 'h' + h.id,
          label: h.quote.slice(0, 60),
          kind: 'Highlight',
          articleId: a.id,
          detail: h.quote + ' ' + h.note,
        });
        edge(a.id, 'h' + h.id, 'Selected passage');
      }
      for (const card of cards.filter((c) => c.spaceId === s.id && c.url === a.url))
        for (const term of card.concepts) {
          const id = 'c' + term.trim().toLowerCase();
          nodes.set(id, { id, label: term, kind: 'Concept', detail: card.passage });
          edge(a.id, id, 'AI-identified concept', true);
        }
    }
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}
