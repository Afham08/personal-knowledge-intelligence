export const MAX_ARTICLE_TEXT = 100_000;

export type ExtractedArticle = {
  url: string;
  title: string;
  text: string;
  truncated: boolean;
  pages?: {page:number;start:number}[];
};

export type ExtractionResult =
  | { status: 'ok'; article: ExtractedArticle }
  | { status: 'empty' | 'restricted' };

declare global {
  // Shared type for the two scripts that execute in the same isolated world.
  var pkiExtractArticle: (() => ExtractionResult) | undefined;
}
