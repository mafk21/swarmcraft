/* ============================================================================
   The contact details and the contact form, rendered for real.

   Three defects shipped in a generated page:
     1. a phone number printed as dead text, so a phone cannot dial it;
     2. a form with onsubmit="return false" — a button that looks like it sends
        a message and throws it away;
     3. a nav link labelled "Roaster Details" wired to #features.
   ========================================================================== */
import { build } from 'esbuild';
import { scratch } from './_scratch.mjs';
import { JSDOM } from 'jsdom';
import { writeFileSync } from 'node:fs';

const entry = scratch('contact-entry.ts');
writeFileSync(entry.path, `export { renderDocument } from '../src/lib/render';\nexport { validateSpec } from '../src/lib/spec';\n`);
const out = scratch('contact.mjs');
await build({ entryPoints: [entry.path], bundle: true, format: 'esm', platform: 'node', outfile: out.path, logLevel: 'silent' });
const { renderDocument, validateSpec } = await import(out.url);

let fail = 0;
const ok = (n, c, d = '') => { if (!c) { fail++; console.log(`  FAIL  ${n}${d ? ` — ${d}` : ''}`); } };

const base = {
  meta: { title: 'T', description: 'd', theme: 'warm', accent: 'clay' },
  nav: { brand: 'B', links: [] },
  footer: { note: 'n' },
  voice: { register: 'plain', facts: [] },
  sections: [],
};
/* the schema wants at least three sections on a page */
const FAQ = { type: 'faq', heading: 'Q', items: [{ q: 'a?', a: 'b' }, { q: 'c?', a: 'd' }, { q: 'e?', a: 'f' }] };

/* ── phone ─────────────────────────────────────────────────────────────── */
{
  const html = renderDocument({
    ...base,
    sections: [{ type: 'hero', headline: 'H', sub: 's' }, FAQ, { type: 'contact', heading: 'Contact', phone: '013 812 4400', email: 'a@b.co', form: false }],
  });
  const d = new JSDOM(html).window.document;
  const a = d.querySelector('.contact-list a[href^="tel:"]');
  ok('a phone number is a tel: link', !!a, 'plain text cannot be dialled');
  ok('the dial target is digits only', a?.getAttribute('href') === 'tel:0138124400', a?.getAttribute('href'));
  ok('the visible number keeps its spacing', a?.textContent === '013 812 4400', a?.textContent);

  const intl = renderDocument({
    ...base,
    sections: [{ type: 'hero', headline: 'H', sub: 's' }, FAQ, { type: 'contact', heading: 'Contact', phone: '+966 13 812 4400', form: false }],
  });
  const i = new JSDOM(intl).window.document.querySelector('.contact-list a[href^="tel:"]');
  ok('a + number keeps one leading +', i?.getAttribute('href') === 'tel:+966138124400', i?.getAttribute('href'));
}

/* ── form ──────────────────────────────────────────────────────────────── */
{
  const html = renderDocument({
    ...base,
    sections: [{ type: 'hero', headline: 'H', sub: 's' }, FAQ, { type: 'contact', heading: 'Contact', email: 'hi@shop.co', form: true }],
  });
  const d = new JSDOM(html).window.document;
  const f = d.querySelector('form.contact-form');
  ok('the form is not a dead end', !/return false/.test(html), 'onsubmit="return false" throws the message away');
  ok('the form has a mailto target', f?.getAttribute('data-mailto') === 'mailto:hi@shop.co', f?.getAttribute('data-mailto'));
  ok('the form has a no-JS fallback', f?.getAttribute('action') === 'mailto:hi@shop.co', f?.getAttribute('action'));
  ok('the fields are required', !!d.querySelector('form input[name="name"][required]') && !!d.querySelector('form textarea[required]'));
  ok('the script wires the submit', /addEventListener\('submit'/.test(html));
  ok('the script opens a mail composer', /location\.href = to \+ '\?subject='/.test(html));

  /* no address, no form: a mailto with nowhere to go is worse than no form */
  const noMail = renderDocument({
    ...base,
    sections: [{ type: 'hero', headline: 'H', sub: 's' }, FAQ, { type: 'contact', heading: 'Contact', phone: '555', form: true }],
  });
  const nf = new JSDOM(noMail).window.document.querySelector('form.contact-form');
  ok('no address means the form stays hidden', nf?.hasAttribute('hidden'), 'it would submit into nothing');
}

/* ── dead nav links ────────────────────────────────────────────────────── */
{
  const r = validateSpec({
    ...base,
    nav: {
      brand: 'B',
      links: [
        { label: 'Shop Beans', href: '#products' },
        { label: 'Roaster Details', href: '#features' },
        { label: 'Contact', href: '#contact' },
        { label: 'Wholesale', href: '#wholesale' },
      ],
    },
    sections: [
      { type: 'hero', headline: 'H', sub: 's' },
      { type: 'features', heading: 'F', items: [{ title: 'a', body: 'b' }, { title: 'c', body: 'd' }, { title: 'e', body: 'f' }] },
      {
        type: 'products',
        heading: 'P',
        items: [
          { name: 'Espresso', price: 'SAR 65', note: '250g' },
          { name: 'Filter', price: 'SAR 70', note: '250g' },
          { name: 'Papers', price: 'SAR 12', note: '100' },
        ],
      },
      { type: 'contact', heading: 'Contact', email: 'a@b.co', form: false },
    ],
  });
  ok('the spec still validates', r.ok, r.ok ? '' : r.issues?.join('; '));
  const hrefs = r.ok ? r.spec.nav.links.map((l) => l.href) : [];
  ok('a link to a section that does not exist is removed', !hrefs.includes('#wholesale'), hrefs.join(' '));
  ok('the repair is reported', (r.ok ? r.repairs : []).some((x) => /pointing at nothing/.test(x)),
    (r.ok ? r.repairs : []).join(','));
  ok('links that do resolve are kept', hrefs.includes('#features') && hrefs.includes('#contact') && hrefs.includes('#products'),
    hrefs.join(' '));

  /* page: links and #top are not dead */
  const pages = validateSpec({
    ...base,
    nav: { brand: 'B', links: [{ label: 'Home', href: '#top' }, { label: 'Journal', href: 'page:1' }] },
    sections: [
      { type: 'hero', headline: 'H', sub: 's' },
      { type: 'about', heading: 'A', body: ['b'] },
      FAQ,
    ],
  });
  ok('page links and #top survive', pages.ok && pages.spec.nav.links.length === 2,
    pages.ok ? pages.spec.nav.links.map((l) => l.href).join(' ') : 'invalid');
}

console.log(fail === 0
  ? '\nCONTACT OK — phone dials, the form sends through the mail app, dead nav links are dropped'
  : `\n${fail} FAILED`);
process.exit(fail ? 1 : 0);
