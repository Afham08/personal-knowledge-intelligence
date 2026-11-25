import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import worker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { assemblePages } from './documents';
GlobalWorkerOptions.workerSrc = worker;
export async function extractPdf(file: File, signal: AbortSignal) {
  if (file.size > 20 * 1024 * 1024) throw new Error('Choose a PDF smaller than 20 MiB.');
  const bytes = await file.arrayBuffer();
  signal.throwIfAborted();
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (x) =>
    x.toString(16).padStart(2, '0'),
  ).join('');
  const task = getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: false,
    useWasm: false,
    disableFontFace: true,
  });
  const cancel = () => {
    void task.destroy();
  };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    const doc = await task.promise;
    if (doc.numPages > 500) throw new Error('Choose a PDF with 500 pages or fewer.');
    const pages = [];
    let count = 0;
    for (let i = 1; i <= doc.numPages; i++) {
      signal.throwIfAborted();
      const page = await doc.getPage(i);
      const stream = page.streamTextContent().getReader();
      let text = '';
      try {
        while (true) {
          const chunk = await stream.read();
          if (chunk.done) break;
          for (const item of chunk.value.items)
            if ('str' in item) {
              text += (item.str + (item.hasEOL ? '\n' : ' ')).slice(0, 100001 - count - text.length);
              if (count + text.length > 100000) break;
            }
          if (count + text.length > 100000) {
            await stream.cancel();
            break;
          }
        }
      } finally {
        stream.releaseLock();
      }
      pages.push({ page: i, text });
      page.cleanup();
      count += text.length + 1;
      if (count > 100000) break;
    }
    const parsed = assemblePages(pages);
    const meta = await doc.getMetadata().catch(() => undefined);
    const info = meta?.info as { Title?: unknown } | undefined;
    return {
      ...parsed,
      truncated: parsed.truncated || pages.length < doc.numPages,
      title: ((typeof info?.Title === 'string' && info.Title.trim()) || file.name).slice(0, 300),
      url: 'https://pki.invalid/pdf/' + hash,
    };
  } catch (e) {
    if (signal.aborted) throw new Error('Import cancelled.');
    if (e instanceof Error && e.name === 'PasswordException')
      throw new Error('This PDF is encrypted. Choose an unlocked copy.');
    throw e instanceof Error ? e : new Error('Unsupported or damaged PDF.');
  } finally {
    signal.removeEventListener('abort', cancel);
    await task.destroy();
  }
}
