import type { ExtractedArticle } from './article';
export const isDocument = (url: string) => /^https:\/\/pki\.invalid\/pdf\/[0-9a-f]{64}$/.test(url);
export function pagesOf(a: ExtractedArticle) {
  return (a.pages ?? []).map((p, i) => ({
    ...p,
    text: a.text.slice(p.start, a.pages?.[i + 1]?.start ?? a.text.length),
  }));
}
export function assemblePages(pages: { page: number; text: string }[]) {
  const offsets: { page: number; start: number }[] = [];
  let text = '',
    truncated = false;
  for (const p of pages) {
    if (!p.text.trim()) continue;
    if (text.length >= 100000) {
      truncated = true;
      break;
    }
    offsets.push({ page: p.page, start: text.length });
    const value = p.text.trim() + '\n';
    text += value.slice(0, 100000 - text.length);
    if (text.length === 100000 && value.length > text.length - offsets.at(-1)!.start) truncated = true;
  }
  if (!text.trim()) throw new Error('No selectable text was found. This PDF may be scanned and require OCR.');
  return { text, pages: offsets, truncated };
}
