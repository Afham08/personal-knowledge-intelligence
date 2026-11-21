import { Readability } from '@mozilla/readability';
import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';

import { MAX_ARTICLE_TEXT, type ExtractionResult } from '../lib/article';

export default defineUnlistedScript(() => {
  globalThis.pkiExtractArticle = (): ExtractionResult => {
    if (document.contentType !== 'text/html') return { status: 'empty' };

    const restricted = document.querySelector(
      '[itemprop="isAccessibleForFree"][content="false"]',
    );
    if (restricted) return { status: 'restricted' };

    const copy = document.cloneNode(true) as Document;
    copy.querySelectorAll('script, template, [hidden], [aria-hidden="true"]').forEach(
      (element) => element.remove(),
    );

    const parsed = new Readability(copy, { maxElemsToParse: 50_000 }).parse();
    const text = parsed?.textContent?.replace(/[^\S\n]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    if (!text) return { status: 'empty' };

    return {
      status: 'ok',
      article: {
        title: (parsed?.title?.trim() || document.title.trim() || 'Untitled article').slice(0, 300),
        url: location.href,
        text: text.slice(0, MAX_ARTICLE_TEXT),
        truncated: text.length > MAX_ARTICLE_TEXT,
      },
    };
  };
});
