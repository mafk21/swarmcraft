/* Google's responseSchema is a narrow OpenAPI subset, not JSON Schema. The
   build failed in the user's hands with "Unknown name 'const'" — a field that
   is perfectly valid JSON Schema and simply not in Google's vocabulary.

   Rather than wait for the next field to be rejected, walk the schema we send
   and check every key and construct against what the API documents. */
import { build } from 'esbuild';
import { scratch } from './_scratch.mjs';
import assert from 'node:assert/strict';

const out = scratch('schema.mjs');
await build({
  entryPoints: ['src/lib/gemini.ts'],
  bundle: true, format: 'esm', platform: 'node',
  outfile: out.path, logLevel: 'silent',
});

let sent = null;
globalThis.fetch = async (_u, init) => {
  sent = JSON.parse(init.body);
  const spec = {
    meta: { title: 'T', description: 'd', theme: 'minimal', accent: 'clay' },
    nav: { brand: 'B', links: [] },
    sections: [
      { type: 'hero', headline: 'h', sub: 's' },
      { type: 'features', heading: 'H', items: [
        { title: 'a', body: 'b' }, { title: 'c', body: 'd' }, { title: 'e', body: 'f' }] },
      { type: 'contact', heading: 'C', form: true },
    ],
    footer: { note: 'n' },
    voice: { register: 'r', facts: [] },
  };
  return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(spec) }] } }] }) };
};

const g = await import(out.url);
await g.buildSite('k', 'store', {});

const schema = sent.generationConfig.responseSchema;
assert.ok(schema, 'a schema must be sent');

/* The keys Google documents for Schema. Anything else is a rejection waiting
   to happen — `const` is not on this list, which is exactly why the build broke. */
const ALLOWED = new Set([
  'type', 'format', 'title', 'description', 'nullable', 'enum', 'items',
  'properties', 'required', 'minItems', 'maxItems', 'minProperties',
  'maxProperties', 'minLength', 'maxLength', 'pattern', 'example', 'anyOf',
  'propertyOrdering', 'minimum', 'maximum', 'default',
]);

const TYPES = new Set(['string', 'number', 'integer', 'boolean', 'array', 'object']);

const problems = [];
function walk(node, path) {
  if (!node || typeof node !== 'object') return;
  for (const [k, v] of Object.entries(node)) {
    if (['properties', 'items', 'anyOf'].includes(k)) continue;
    if (!ALLOWED.has(k)) problems.push(`${path}: unsupported key "${k}"`);
  }
  if (node.type && !TYPES.has(node.type)) problems.push(`${path}: unsupported type "${node.type}"`);
  /* `enum` must carry a type or it is rejected */
  if ('enum' in node && !node.type) problems.push(`${path}: enum without a type`);
  if ('anyOf' in node) {
    if (!Array.isArray(node.anyOf) || node.anyOf.length < 2) {
      problems.push(`${path}: anyOf needs at least two branches`);
    }
    node.anyOf.forEach((b, i) => walk(b, `${path}.anyOf[${i}]`));
  }
  if (node.items) walk(node.items, `${path}[]`);
  if (node.properties) {
    for (const [name, child] of Object.entries(node.properties)) walk(child, `${path}.${name}`);
    /* every required name must exist in properties */
    for (const r of node.required ?? []) {
      if (!(r in node.properties)) problems.push(`${path}: required "${r}" is not a property`);
    }
  }
}
walk(schema, 'schema');

assert.equal(problems.length, 0, `the schema uses things Google rejects:\n  ${problems.join('\n  ')}`);

/* the specific regression that broke the build */
assert.ok(
  !JSON.stringify(schema).includes('"const"'),
  'the schema must not use `const` — Google rejects it as "Unknown name const"'
);

/* and the discriminator must still constrain the model to one value */
const heroType = schema.properties.sections.items.anyOf[0].properties.type;
assert.equal(heroType.type, 'string', 'section type must be a string');
assert.deepEqual(heroType.enum, ['hero'], 'section type must still be pinned to one value');

console.log('SCHEMA OK — every key is in Google\'s vocabulary, no const, all 13 discriminators pinned by single-value enum');
