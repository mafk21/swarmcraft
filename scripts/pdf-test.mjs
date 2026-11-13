import { build } from 'esbuild';
import { scratch } from './_scratch.mjs';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

/* pdf.js will not run without somewhere to load its worker from. Point the
   stubbed `?url` import at the real worker on disk. */
const WORKER = pathToFileURL(resolve('node_modules/pdfjs-dist/build/pdf.worker.min.mjs')).href;

const out = scratch('pdf.bundle.mjs');
await build({
  entryPoints: ['src/lib/pdf.ts'],
  bundle: true, format: 'esm', platform: 'neutral', mainFields: ['main'],
  outfile: out.path, logLevel: 'silent',
  /* Vite's `?url` suffix has no meaning to esbuild. Leave it alone rather than
     letting a `file` loader (which would rewrite pdf.js itself) swallow it. */
  plugins: [{
    name: 'stub-url-imports',
    setup(b) {
      b.onResolve({ filter: /\?url$/ }, () => ({ path: 'url-stub', namespace: 'urlstub' }));
      b.onLoad({ filter: /.*/, namespace: 'urlstub' }, () => ({
        contents: `export default ${JSON.stringify(WORKER)};`, loader: 'js',
      }));
    },
  }],
});

const { extractPdf, PdfError } = await import(out.url);

/* ── hand-built PDF, so this tests pdf.js rather than a mock ─────────────── */

function makePdf(pages) {
  const objs = [];
  const n = pages.length;
  // 1 catalog, 2 pages, then per page: page obj + content stream
  const kids = pages.map((_, i) => `${3 + i * 2} 0 R`).join(' ');
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[2] = `<< /Type /Pages /Kids [${kids}] /Count ${n} >>`;
  pages.forEach((lines, i) => {
    const num = 3 + i * 2;
    const body = lines.map((l, k) => `BT /F1 11 Tf 50 ${720 - k * 16} Td (${l.replace(/[()\\]/g, (m) => '\\' + m)}) Tj ET`).join('\n');
    objs[num] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> /Contents ${num + 1} 0 R >>`;
    objs[num + 1] = `<< /Length ${body.length} >>\nstream\n${body}\nendstream`;
  });

  let file = '%PDF-1.4\n';
  const offsets = [];
  for (let i = 1; i < objs.length + 1; i++) {
    offsets[i] = file.length;
    file += `${i} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xref = file.length;
  file += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < objs.length + 1; i++) {
    file += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  file += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(file, 'latin1');
}

const real = makePdf([
  ['Falcon Cafe roasts single-origin beans in Dammam.',
   'We opened in 2019 and serve about forty cups a day.'],
  ['Our espresso costs SAR 12 and filter is SAR 14.',
   'Hours are 7am to 6pm, Saturday to Thursday.'],
]);

const file = new File([real], 'brief.pdf', { type: 'application/pdf' });
const got = await extractPdf(file);

assert.equal(got.name, 'brief.pdf');
assert.equal(got.pages, 2, 'must count both pages');
assert.ok(got.chars > 100, `should read real text, got ${got.chars} chars`);
assert.match(got.text, /Falcon Cafe/, 'page 1 text missing');
assert.match(got.text, /SAR 12/, 'page 2 text missing');
assert.match(got.text, /7am to 6pm/, 'page 2 second line missing');

/* ── refusals ───────────────────────────────────────────────────────────── */

// a PDF with no text layer at all — the scanned-document case
const blank = makePdf([['']]);
await assert.rejects(
  () => extractPdf(new File([blank], 'scan.pdf', { type: 'application/pdf' })),
  (e) => e instanceof PdfError && /scans/.test(e.message),
  'an empty text layer must say the file is probably a scan'
);

// not a PDF at all
await assert.rejects(
  () => extractPdf(new File([Buffer.from('hello, I am not a pdf')], 'x.pdf')),
  (e) => e instanceof PdfError,
  'garbage must fail as a PdfError, not a raw exception'
);

// oversized, rejected before parsing
const big = { name: 'big.pdf', size: 25 * 1024 * 1024, arrayBuffer: async () => real };
await assert.rejects(
  () => extractPdf(big),
  (e) => e instanceof PdfError && /24 MB/.test(e.message),
  'must refuse over 24 MB before doing work'
);

// truncation: a 30-page cap must hold, and text must be capped at 18000
const many = makePdf(Array.from({ length: 45 }, (_, i) => [`Page ${i} of the long document.`]));
const doc = await extractPdf(new File([many], 'long.pdf'));
assert.equal(doc.pages, 45, 'page count should still report the true total');
assert.ok(doc.text.length <= 18000, `text must be capped, got ${doc.text.length}`);
assert.ok(doc.text.includes('Page 0'), 'first page must survive the cap');

console.log('PDF OK — real pdf.js extraction over a hand-built 2-page PDF, 45-page cap, and all three refusals');
