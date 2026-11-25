import type { Backup } from './backup';
import { reopenReview, articleFingerprint, type Review } from './ai/analysis.ts';

const escape = (s: string) => s.replace(/[\\`*_{}\[\]()#!|<>~]/g, '\\$&');
export async function markdownFiles(b: Backup, space = '', resource = '') {
  const files: Record<string, string> = {};
  const spaces = b.library.spaces.filter((s) => !space || space === s.id);
  const links = b.library.links.filter(
    (l) => spaces.some((s) => s.id === l.spaceId) && (!resource || l.articleId === resource),
  );
  for (const a of b.library.articles.filter((a) => links.some((l) => l.articleId === a.id))) {
    let md = '# ' + escape(a.title) + '\n\n' + (a.pages ? 'Imported PDF' : a.url) + '\n\n';
    md += a.pages
      ? a.pages
          .map(
            (p, i) => '## Page ' + p.page + '\n\n' + escape(a.text.slice(p.start, a.pages?.[i + 1]?.start)),
          )
          .join('\n\n')
      : escape(a.text);
    for (const link of links.filter((l) => l.articleId === a.id)) {
      const s = spaces.find((s) => s.id === link.spaceId)!;
      md += '\n\n## ' + escape(s.name) + '\n\n' + escape(link.note);
      for (const h of (b.library.highlights ?? []).filter((h) => h.articleId === a.id && h.spaceId === s.id))
        md += '\n\n> ' + escape(h.quote).replaceAll('\n', '\n> ') + '\n\n' + escape(h.note);
    }
    const fingerprint = await articleFingerprint(a);
    for (const item of Object.values(b.cache)) {
      const review = item as Review;
      if (
        review?.fingerprint !== fingerprint ||
        (space && !spaces.some((s) => s.learningGoal === review.goal))
      )
        continue;
      try {
        const r = await reopenReview(a, review);
        const x = r.analysis;
        md +=
          '\n\n## Analysis · ' +
          escape(r.model.name) +
          '\n\nGoal: ' +
          escape(r.goal) +
          '\n\n' +
          escape(x.summary.overview) +
          '\n\n' +
          [...x.summary.ideas, ...x.summary.takeaways, x.relevance.alignment, ...x.relevance.limitations]
            .map(escape)
            .join('\n\n');
        for (const c of x.concepts)
          md += '\n\n- ' + escape(c.term) + ': ' + escape(c.explanation) + ' (' + c.evidence + ')';
        for (const q of x.recall)
          md += '\n\n' + escape(q.question) + ' — ' + escape(q.answer) + ' (' + q.evidence + ')';
        for (const p of r.passages) md += '\n\n' + p.id + ' — ' + escape(p.text);
      } catch {
        /* Export only reviews that still validate against this resource. */
      }
    }
    files['resources/' + a.id + '.md'] = md + '\n';
  }
  if (!resource)
    for (const [i, s] of spaces.entries()) {
      files['spaces/space-' + (i + 1) + '.md'] =
        '# ' +
        escape(s.name) +
        '\n\n' +
        escape(s.learningGoal) +
        '\n\n' +
        links
          .filter((l) => l.spaceId === s.id)
          .map(
            (l) =>
              '- [' +
              escape(b.library.articles.find((a) => a.id === l.articleId)!.title) +
              '](../resources/' +
              l.articleId +
              '.md)',
          )
          .join('\n') +
        '\n';
    }
  return files;
}
export function usage(b: Backup, index: unknown) {
  const size = (v: unknown) => new TextEncoder().encode(JSON.stringify(v ?? null)).length;
  return {
    'Articles and documents': size(b.library.articles),
    'Highlights and notes': size([b.library.highlights ?? [], b.library.links]),
    'AI analyses': size(b.cache),
    'Chat history': size(b.knowledge.turns),
    'Embedding index': size(index),
    'Learning progress': size([b.knowledge.cards, b.knowledge.ratings, b.study]),
  };
}
