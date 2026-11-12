/* ============================================================================
   PDF text extraction, in the page. No upload, no worker server.
   pdf.js reads the bytes here and hands back plain text.
   ========================================================================== */

/* pdf.js is ~600 kB. It is imported only when someone actually attaches a PDF,
   so the first paint of the app stays light. */
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

export type Extracted = {
  name: string;
  pages: number;
  chars: number;
  text: string;
};

export class PdfError extends Error {}

export async function extractPdf(file: File): Promise<Extracted> {
  if (file.size > 24 * 1024 * 1024) {
    throw new PdfError('That file is over 24 MB. Try a smaller export.');
  }

  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

  const bytes = new Uint8Array(await file.arrayBuffer());

  let doc;
  try {
    doc = await pdfjs.getDocument({ data: bytes, isEvalSupported: false }).promise;
  } catch {
    throw new PdfError(
      'That PDF would not open. If it is a scan, the text is pixels — there is nothing to read.'
    );
  }

  const parts: string[] = [];
  // cap so a 400-page manual does not blow the prompt or the memory
  const limit = Math.min(doc.numPages, 30);

  for (let i = 1; i <= limit; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const line = content.items
      .map((it) => ('str' in it ? it.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (line) parts.push(line);
    page.cleanup();
  }

  const text = parts.join('\n\n').trim();

  if (text.length < 40) {
    throw new PdfError(
      'Almost no text came out of that PDF. It is probably scans rather than a text layer.'
    );
  }

  return {
    name: file.name,
    pages: doc.numPages,
    chars: text.length,
    text: text.slice(0, 18000),
  };
}
