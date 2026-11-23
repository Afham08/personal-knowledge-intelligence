import type { Passage } from '../../lib/ai/provider';

export function SourceReference({ passage }: { passage: Passage | undefined }) {
  if (!passage) return null;
  return (
    <details className="source-reference">
      <summary>Source reference {passage.id}</summary>
      <p className="article-text">{passage.text}</p>
    </details>
  );
}
