export const colors = ['gold', 'mint', 'violet'] as const;
export type Anchor = { quote: string; prefix: string; suffix: string; start: number };
export type Annotation = Anchor & {
  id: string;
  articleId: string;
  spaceId: string;
  color: (typeof colors)[number];
  note: string;
};
export function locate(text: string, a: Anchor): number | undefined {
  if (!a.quote) return;
  const first = text.indexOf(a.quote);
  if (first < 0) return;
  if (text.indexOf(a.quote, first + 1) < 0) {
    if (
      a.quote.length >= 16 ||
      text.slice(Math.max(0, first - a.prefix.length), first) === a.prefix ||
      text.slice(first + a.quote.length, first + a.quote.length + a.suffix.length) === a.suffix
    )
      return first;
    return;
  }
  let best: number | undefined;
  for (let i = first; i >= 0; i = text.indexOf(a.quote, i + 1)) {
    if (!a.prefix && !a.suffix) return;
    if (
      text.slice(Math.max(0, i - a.prefix.length), i) === a.prefix &&
      text.slice(i + a.quote.length, i + a.quote.length + a.suffix.length) === a.suffix
    ) {
      if (best !== undefined) return;
      best = i;
    }
  }
  return best;
}
