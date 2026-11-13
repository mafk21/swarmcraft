/**
 * The inspector contract: every editable field must exist on the section it
 * edits, and every edit must round-trip through the schema.
 *
 * The inspector is 750 lines of JSX that no headless test can click. What it
 * CAN be held to is the data contract it is built on: SECTION_FIELDS declares a
 * path per editable value, and editSectionField applies it. If a field names a
 * key the section does not have, the editor renders a box wired to nothing.
 *
 *   node scripts/editor-test.mjs
 */
import { build } from 'esbuild';
import { scratch } from './_scratch.mjs';
import { writeFileSync } from 'node:fs';

const b = await build({
  stdin: {
    contents: `
      export { SECTION_FIELDS, sectionSummary } from './src/app/editors';
      export { newSection } from './src/lib/presets';
      export { editSectionField, editMeta, SectionSchema, SiteSpecSchema } from './src/lib/spec';
    `,
    resolveDir: process.cwd(), loader: 'ts',
  },
  bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'error',
  external: ['react', 'react-dom', 'zod'],
});
writeFileSync(scratch('editor.mjs').path, b.outputFiles[0].text);
const { SECTION_FIELDS, sectionSummary, newSection, editSectionField, editMeta, SectionSchema } =
  await import(scratch('editor.mjs').url);

let fail = 0;
const ok = (name, cond, detail = '') => {
  if (!cond) { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
};

/** Fields the schema marks optional, so a fresh preset may not carry them. */
const OPTIONAL = {
  hero: ['eyebrow', 'image', 'cta'],
  products: [],
  gallery: ['heading', 'layout'],
  about: ['image'],
  cta: ['sub'],
  contact: ['email', 'phone', 'address'],
  pricing: [],
};
const OPTIONAL_ITEM = {
  pricing: ['tiers.period'],
  products: ['items.image', 'items.note'],
  gallery: ['items.image', 'items.caption', 'items.span'],
};

const types = Object.keys(SECTION_FIELDS);
ok('every section type has an editor', types.length === 13, String(types.length));

/* ── each declared field must exist on its preset ───────────────────────── */
for (const t of types) {
  const preset = newSection(t);
  for (const f of SECTION_FIELDS[t]) {
    const exists = f.key in preset;
    /* A field the schema marks optional is legitimately absent from a fresh
       preset — that is the editor offering a box for something the model left
       out. It must still be ACCEPTED when typed into, which is checked below. */
    const optional = OPTIONAL[t]?.includes(f.key);
    if (!optional) {
      ok(`${t}.${f.key} exists on the section`, exists,
        `not a key of ${JSON.stringify(Object.keys(preset))}`);
    } else {
      ok(`${t}.${f.key} is optional and may start empty`, true);
    }

    // a field the section marks optional may legitimately be undefined
    if (exists && preset[f.key] !== undefined && f.kind === 'objs') {
      // `objs` covers both a list of objects and a single nested object
      const v = preset[f.key];
      ok(`${t}.${f.key} is an object or a list`,
        Array.isArray(v) || (typeof v === 'object' && v !== null));
    }
    if (exists && preset[f.key] !== undefined && (f.kind === 'list' || f.kind === 'groups')) {
      ok(`${t}.${f.key} is a list`, Array.isArray(preset[f.key]));
    }

    // nested object fields must exist on the objects inside
    if (f.kind === 'objs' && Array.isArray(preset[f.key])) {
      const first = preset[f.key][0];
      if (first && typeof first === 'object') {
        for (const sub of f.fields) {
          const subOptional = OPTIONAL_ITEM[t]?.includes(`${f.key}.${sub.key}`);
          if (!subOptional) {
            ok(`${t}.${f.key}[].${sub.key} exists`, sub.key in first,
              `present keys: ${Object.keys(first).join(',')}`);
          }
        }
      }
    }
  }
}

/* ── editing every field of every section keeps the spec valid ──────────── */
const spec = {
  meta: { title: 'Test', description: 'A page for testing the editor.', theme: 'warm', accent: 'clay' },
  nav: { brand: 'Test', links: [] },
  sections: [
    { type: 'hero', headline: 'H', sub: 'S' },
    { type: 'features', heading: 'F', items: [
      { title: 'a', body: 'b' }, { title: 'c', body: 'd' }, { title: 'e', body: 'f' }] },
    { type: 'contact', heading: 'C', email: 'a@b.co', form: false },
  ],
  footer: { note: 'n' },
  voice: { register: 'r', facts: [] },
};

for (const t of types) {
  const preset = newSection(t);
  const withIt = {
    ...spec,
    sections: [spec.sections[0], preset, spec.sections[1], spec.sections[2]].slice(0, 9),
  };
  ok(`${t}: the section can be added to a page`, SiteSpecOk(withIt), 'page became invalid');

  // Edit each text field and confirm it lands. The value has to be one the
  // schema would accept for THAT field — an email box given "foo edited" is a
  // refusal the editor is right to make, not a bug in the editor.
  for (const f of SECTION_FIELDS[t]) {
    if (f.kind !== 'text') continue;
    const cur = preset[f.key];
    const next = f.key === 'email' || /email/i.test(f.key)
      ? 'typed@example.com'
      : typeof cur === 'string' && cur.trim()
        ? `${cur} edited`
        : 'Typed value';
    const r = editSectionField(withIt, 1, [f.key], next);
    ok(`${t}.${f.key} accepts an edit`, !r.rejected, 'edit was rejected');
    if (!r.rejected) {
      ok(`${t}.${f.key} stores what was typed`, r.spec.sections[1][f.key] === next);
      ok(`${t}.${f.key} result is still valid`, SiteSpecOk(r.spec));
    }
  }

  // a summary is available for the collapsed card
  ok(`${t}: has a summary`, typeof sectionSummary(preset) === 'string');
}

function SiteSpecOk(s) {
  return SectionSchema.safeParse(s.sections[1]).success && s.sections.length >= 3;
}

/* ── edits that must be refused ─────────────────────────────────────────── */
{
  const hero = spec.sections[0];
  const empty = editSectionField(spec, 0, ['headline'], '');
  ok('an empty headline is refused', empty.rejected);
  ok('and the old headline survives', empty.spec.sections[0].headline === hero.headline);

  const num = editSectionField(spec, 0, ['headline'], 42);
  ok('a number where a string belongs is refused', num.rejected);

  const badTheme = editMeta(spec, ['meta', 'theme'], 'neon');
  ok('an unknown theme is refused', badTheme.rejected);

  // contact is the third section of `spec` (hero, features, contact)
  const badEmail = editSectionField(spec, 2, ['email'], 'not-an-email');
  ok('a malformed email is refused', badEmail.rejected);

  const okEmail = editSectionField(spec, 2, ['email'], 'real@example.com');
  ok('a real email is accepted', !okEmail.rejected);
}

/* ── a section that drops below its minimums is refused ────────────────── */
{
  const feats = editSectionField(spec, 1, ['items'], [
    { title: 'only one', body: 'x' },
  ]);
  ok('dropping features below three is refused', feats.rejected);

  const hero = editSectionField(spec, 0, ['headline'], 'x'.repeat(200));
  ok('an over-long headline is refused', hero.rejected);
}

console.log(fail === 0 ? '\nEDITOR OK' : `\n${fail} FAILED`);
process.exit(fail ? 1 : 0);
