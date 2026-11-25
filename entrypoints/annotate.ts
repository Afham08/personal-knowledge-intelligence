import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import { colors, locate, type Anchor, type Annotation } from '../lib/anchors';
type Result = { anchor?: Anchor; matched: number; missing: string[] };
declare global {
  var pkiAnnotations: ((items: (Anchor & Pick<Annotation,'color'>)[], capture: boolean) => Result) | undefined;
}
export default defineUnlistedScript(() => {
  globalThis.pkiAnnotations = (items, capture) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) =>
        n.parentElement?.closest(
          'script,style,template,input,textarea,select,[contenteditable]:not([contenteditable=false]),[hidden],[aria-hidden=true]',
        )
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT,
    });
    const nodes: { node: Node; start: number; end: number }[] = [];
    const parts: string[] = [];
    let length = 0,
      node;
    while ((node = walker.nextNode())) {
      const value = node.textContent ?? '';
      if (!value) continue;
      nodes.push({ node, start: length, end: length + value.length });
      parts.push(value);
      length += value.length;
      if (length > 2000000 || nodes.length > 100000)
        throw new Error('Page too large for reliable highlighting.');
    }
    const text = parts.join('');
    const result: Result = { matched: 0, missing: [] };
    if (capture) {
      const sel = getSelection();
      if (!sel?.rangeCount) return result;
      const r = sel.getRangeAt(0);
      const row = nodes.find((n) => n.node === r.startContainer);
      const quote = r.toString();
      if (!row || !quote.trim() || quote.length > 4000) return result;
      const start = row.start + r.startOffset;
      if (text.slice(start, start + quote.length) !== quote) return result;
      result.anchor = {
        quote,
        start,
        prefix: text.slice(Math.max(0, start - 48), start),
        suffix: text.slice(start + quote.length, start + quote.length + 48),
      };
    } else {
      for (const color of colors) {
        const ranges: Range[] = [];
        for (const a of items.filter((h) => h.color === color)) {
          const at = locate(text, a);
          const first = at === undefined ? undefined : nodes.find((n) => n.end > at);
          const last = at === undefined ? undefined : nodes.find((n) => n.end >= at + a.quote.length);
          if (at === undefined || !first || !last) {
            result.missing.push(a.quote.slice(0,80));
            continue;
          }
          const range = new Range();
          range.setStart(first.node, at - first.start);
          range.setEnd(last.node, at + a.quote.length - last.start);
          ranges.push(range);
          result.matched++;
        }
        CSS.highlights.set('pki-' + color, new Highlight(...ranges));
      }
    }
    return result;
  };
});
