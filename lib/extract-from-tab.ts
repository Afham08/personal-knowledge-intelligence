import { browser } from 'wxt/browser';

import { getActiveTab, isWebUrl, type ActiveTab } from './active-tab';
import type { ExtractedArticle } from './article';

export async function extractFromTab(tab: ActiveTab): Promise<ExtractedArticle> {
  const current = await getActiveTab();
  if (!tab.url || !isWebUrl(tab.url) || current?.id !== tab.id || current.url !== tab.url) {
    throw new Error('The active page changed. Click the PKI toolbar icon on the article and try again.');
  }

  let result;
  try {
    // Load Readability from the extension bundle, then call it in that same document.
    const [frame] = await browser.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['/extract-article.js'],
    });
    if (!frame?.documentId) throw new Error('Article document is unavailable.');

    [result] = await browser.scripting.executeScript({
      target: { tabId: tab.id, documentIds: [frame.documentId] },
      func: () => globalThis.pkiExtractArticle?.(),
    });
  } catch {
    throw new Error('PKI could not read this page. Open a public web article and click the PKI toolbar icon to grant access.');
  }

  if (result?.result?.status === 'restricted') {
    throw new Error('This page marks its content as restricted. Try a public article.');
  }
  if (result?.result?.status !== 'ok') {
    throw new Error('No readable article was found. Try a page that contains a full article.');
  }

  const article = result.result.article;
  const after = await getActiveTab();
  if (article.url !== tab.url || after?.id !== tab.id || after.url !== tab.url) {
    throw new Error('The active page changed during extraction. Extract again from the current page.');
  }
  return article;
}
