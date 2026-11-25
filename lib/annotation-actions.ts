import { browser } from 'wxt/browser';
import { getActiveTab, isWebUrl } from './active-tab';
import { extractFromTab } from './extract-from-tab';
import { normalizeArticleUrl, identifyArticle, attachArticle } from './library-model';
import { readLibrary, updateLibrary } from './library';
import type { Annotation } from './anchors';
export async function annotateCurrent(
  spaceId: string,
  color: Annotation['color'],
  note: string,
  capture: boolean,
) {
  const tab = await getActiveTab();
  if (!tab?.url || !isWebUrl(tab.url)) throw new Error('Click PKI on a supported article tab first.');
  const url = normalizeArticleUrl(tab.url);
  const library = await readLibrary();
  const saved = library.articles.find((a) => a.url === url);
  const items = (library.highlights ?? []).filter((a) => a.articleId === saved?.id).map(({quote,prefix,suffix,start,color})=>({quote,prefix,suffix,start,color}));
  const [frame] = await browser.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['/annotate.js'],
  });
  if (!frame?.documentId) throw new Error('Page changed. Try again.');
  const target = { tabId: tab.id, documentIds: [frame.documentId] };
  const invoke = (rows: typeof items, select: boolean) =>
    browser.scripting.executeScript({
      target,
      func: (rows: typeof items, select: boolean, source: string) =>
        location.href === source ? globalThis.pkiAnnotations?.(rows, select) : undefined,
      args: [rows, select, tab.url!],
    });
  if (!capture)
    await browser.scripting.insertCSS({
      target,
      css: '::highlight(pki-gold){background:#ffe185;color:#211a08}::highlight(pki-mint){background:#a9ebd1;color:#10281e}::highlight(pki-violet){background:#ddc8ff;color:#261736}',
    });
  const [res] = await invoke(items, capture);
  if (!res?.result) throw new Error('Page unavailable. Click the extension toolbar icon and try again.');
  if (!capture)
    return (
      res.result.matched +
      ' located · ' +
      res.result.missing.length + ' locations unavailable.' + (res.result.missing.length?' Saved excerpts: '+res.result.missing.join(' · '):'')
    );
  const anchor = res.result.anchor;
  if (!anchor) throw new Error('Select up to 4,000 characters of ordinary article text first.');
  const article = saved ?? (await identifyArticle(await extractFromTab(tab)));
  await updateLibrary((current) => {
    const base = attachArticle(current, article, spaceId, '');
    if (
      base.highlights?.some(
        (h) =>
          h.articleId === article.id &&
          h.spaceId === spaceId &&
          h.start === anchor.start &&
          h.quote === anchor.quote,
      )
    )
      return base;
    return {
      ...base,
      highlights: [
        ...(base.highlights ?? []),
        { ...anchor, id: crypto.randomUUID(), articleId: article.id, spaceId, color, note },
      ],
    };
  });
  return 'Highlight saved.';
}
