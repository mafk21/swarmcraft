/* ============================================================================
   Gemini, called directly from the browser with the user's own key.

   Two responsibilities:
     1. ask()    — structure the user's answers into a SiteSpec
     2. theme()  — when the user delegates, choose a theme and say why

   The model never emits CSS. The response schema it must satisfy has no
   styling fields (see spec.ts, which is .strict()).
   ========================================================================== */

import { SITE_KINDS } from './spec';
import { THEME_IDS, ACCENTS, type SiteSpec } from './spec';
import { KIND_BRIEFS } from './questions';
import { validateSpec, findSlop } from './spec';

const MODEL = 'gemini-2.5-flash';
const ENDPOINT = (model: string, key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
    key
  )}`;

export type AnswerMap = Record<string, string | string[] | boolean>;

/* ── prompt ──────────────────────────────────────────────────────────────── */

const SYSTEM = `You write website content. You are being used by a builder that renders your output into a designed page.

Hard rules, no exceptions:

1. NEVER write CSS, HTML, class names, colours, fonts or layout. The schema has no field for it. Do not add extra keys.
2. Write like a person who runs the thing. Concrete, specific, short sentences. British or American spelling, but be consistent.
3. Do not invent facts, numbers, testimonials, client names, prices, addresses or credentials. If the user gave you none, write around it. For testimonials with no source material, return an honest empty-ish section or omit it entirely.
4. Banned phrases — using any of these fails validation: "unlock the power", "unleash", "elevate your", "next level", "game-changer", "cutting-edge", "state-of-the-art", "seamlessly", "revolutionize", "world-class", "best-in-class", "one-stop shop", "look no further", "we are passionate about", "in today's fast-paced", "delve into", "tapestry", "empower", "transform your business".
5. No em-dash at the start of a sentence. No exclamation marks. No emoji.
6. Headings are 2–5 words. No title case tics like "Why Choose Us?".
7. The "voice.facts" array is the only material you may reuse. Keep every real number the user gave you there, verbatim.
8. Sections must appear in an order a reader would want them, starting with "hero".`;

function briefPrompt(kind: keyof typeof KIND_BRIEFS, answers: AnswerMap): string {
  const brief = KIND_BRIEFS[kind];
  const lines: string[] = [];

  lines.push(`Site kind: ${kind}`);
  lines.push(`Name: ${String(answers.name ?? '')}`);
  lines.push(`Description: ${String(answers.description ?? '')}`);

  for (const q of brief.questions) {
    const v = answers[q.id];
    if (v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) continue;
    const label = q.label.replace(/\?$/, '');
    if (typeof v === 'boolean') {
      lines.push(`${label}: ${v ? 'yes' : 'no'}`);
    } else if (Array.isArray(v)) {
      lines.push(`${label}: ${v.join(', ')}`);
    } else {
      lines.push(`${label}:\n${v}`);
    }
  }

  const chosen = (answers.__sections as string[] | undefined) ?? [];
  if (chosen.length) lines.push(`Sections the user wants: ${chosen.join(', ')}`);

  const source = answers.__source;
  if (typeof source === 'string' && source.trim().length > 40) {
    lines.push(
      `\nSOURCE DOCUMENT (extracted text from a PDF the user supplied). Use only the facts that appear below. Do not invent anything beyond this and the answers above:\n\n${source.slice(0, 14000)}`
    );
  }

  return lines.join('\n\n');
}

/* ── schema the model must satisfy ───────────────────────────────────────── */

const sectionUnion = {
  anyOf: [
    obj({ type: { const: 'hero' }, eyebrow: str(), headline: str(), sub: str(), cta: optObj({ label: str(), href: str() }) }, ['type', 'headline', 'sub']),
    obj({ type: { const: 'features' }, heading: str(), items: arr(obj({ title: str(), body: str() }, ['title', 'body']), 3, 6) }, ['type', 'heading', 'items']),
    obj({ type: { const: 'pricing' }, heading: str(), tiers: arr(obj({ name: str(), price: str(), period: optStr(), features: arr(str(), 2, 8), cta: str(), featured: { type: 'boolean' } }, ['name', 'price', 'features', 'cta']), 2, 4) }, ['type', 'heading', 'tiers']),
    obj({ type: { const: 'products' }, heading: str(), items: arr(obj({ name: str(), price: str(), note: optStr() }, ['name', 'price']), 3, 12) }, ['type', 'heading', 'items']),
    obj({ type: { const: 'testimonials' }, heading: str(), items: arr(obj({ quote: str(), author: str(), role: optStr() }, ['quote', 'author']), 2, 6) }, ['type', 'heading', 'items']),
    obj({ type: { const: 'faq' }, heading: str(), items: arr(obj({ q: str(), a: str() }, ['q', 'a']), 3, 8) }, ['type', 'heading', 'items']),
    obj({ type: { const: 'about' }, heading: str(), body: arr(str(), 1, 4) }, ['type', 'heading', 'body']),
    obj({ type: { const: 'menu' }, heading: str(), groups: arr(obj({ name: str(), items: arr(obj({ name: str(), price: str(), note: optStr() }, ['name', 'price']), 2, 14) }, ['name', 'items']), 1, 6) }, ['type', 'heading', 'groups']),
    obj({ type: { const: 'gallery' }, heading: optStr(), items: arr(obj({ title: str(), caption: optStr() }, ['title']), 3, 9) }, ['type', 'items']),
    obj({ type: { const: 'stats' }, items: arr(obj({ value: str(), label: str() }, ['value', 'label']), 3, 4) }, ['type', 'items']),
    obj({ type: { const: 'cta' }, heading: str(), sub: optStr(), action: obj({ label: str(), href: str() }, ['label', 'href']) }, ['type', 'heading', 'action']),
    obj({ type: { const: 'contact' }, heading: str(), email: optStr(), phone: optStr(), address: optStr(), form: { type: 'boolean' } }, ['type', 'heading', 'form']),
    obj({ type: { const: 'schedule' }, heading: str(), days: arr(obj({ day: str(), items: arr(obj({ time: str(), title: str() }, ['time', 'title']), 1, 10) }, ['day', 'items']), 1, 7) }, ['type', 'heading', 'days']),
  ],
};

function str() {
  return { type: 'string' as const };
}
function optStr() {
  return { type: 'string' as const, nullable: true };
}
function arr(items: unknown, minItems: number, maxItems: number) {
  return { type: 'array' as const, items, minItems, maxItems };
}
function obj(properties: Record<string, unknown>, required: string[]) {
  return { type: 'object' as const, properties, required };
}
function optObj(properties: Record<string, unknown>) {
  return { type: 'object' as const, properties, required: Object.keys(properties) };
}

const RESPONSE_SCHEMA = obj(
  {
    meta: obj(
      {
        title: str(),
        description: str(),
        theme: { type: 'string', enum: [...THEME_IDS] },
        accent: { type: 'string', enum: [...ACCENTS] },
        themeReason: str(),
      },
      ['title', 'description', 'theme', 'accent']
    ),
    nav: obj({ brand: str(), links: arr(obj({ label: str(), href: str() }, ['label', 'href']), 0, 6) }, ['brand', 'links']),
    sections: { type: 'array', items: sectionUnion, minItems: 3, maxItems: 9 },
    footer: obj({ note: str() }, ['note']),
    voice: obj({ register: str(), facts: arr(str(), 0, 20) }, ['register', 'facts']),
  },
  ['meta', 'nav', 'sections', 'footer', 'voice']
);

/* ── the call ────────────────────────────────────────────────────────────── */

class GeminiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function call(key: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(ENDPOINT(MODEL, key), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      const j = await res.json();
      detail = j?.error?.message ?? detail;
    } catch {
      /* non-json */
    }
    throw new GeminiError(detail, res.status);
  }

  const json = await res.json();
  const text: string | undefined = json?.candidates?.[0]?.content?.parts
    ?.map((p: { text?: string }) => p.text ?? '')
    .join('');

  if (!text) {
    const reason = json?.candidates?.[0]?.finishReason ?? 'no content returned';
    throw new GeminiError(String(reason), 200);
  }

  try {
    return JSON.parse(text);
  } catch {
    // model wrapped it in a fence
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new GeminiError('The model did not return JSON.', 200);
    return JSON.parse(m[0]);
  }
}

/** Validate the key cheaply. */
export async function testKey(key: string): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`
    );
    if (res.ok) return { ok: true, message: 'Key works.' };
    const j = await res.json().catch(() => null);
    return { ok: false, message: j?.error?.message ?? `Rejected (${res.status}).` };
  } catch {
    return { ok: false, message: 'Could not reach Google. Check your connection.' };
  }
}

/** Turn the interview into a validated SiteSpec, with one slop retry. */
export async function buildSpec(
  key: string,
  kind: (typeof SITE_KINDS)[number],
  answers: AnswerMap,
  signal?: AbortSignal
): Promise<{ spec: SiteSpec; repairs: string[] }> {
  const base = {
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [{ role: 'user', parts: [{ text: briefPrompt(kind, answers) }] }],
    generationConfig: {
      temperature: 0.72,
      topP: 0.9,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      maxOutputTokens: 4096,
    },
  };

  let raw = await call(key, base, signal);
  let result = validateSpec(raw);

  if (!result.ok) {
    // one repair round-trip with the validation errors attached
    const repaired = await call(
      key,
      {
        ...base,
        contents: [
          ...base.contents,
          {
            role: 'user',
            parts: [
              {
                text: `That response failed validation with these errors:\n${result.issues.slice(0, 8).join('\n')}\n\nReturn the whole object again, corrected. Same rules.`,
              },
            ],
          },
        ],
      },
      signal
    );
    result = validateSpec(repaired);
  }

  if (!result.ok) {
    throw new GeminiError(
      `The generated content did not pass validation: ${result.issues.slice(0, 3).join('; ')}`,
      200
    );
  }

  /* ── Melpomene: the slop guard ────────────────────────────────────────
     Validation only proves the shape is right. This proves the words are.
     One rewrite, naming the exact offending phrases, then we accept.    */

  const findings = findSlop(result.spec);
  if (findings.length > 0) {
    const banned = [...new Set(findings.map((f) => f.phrase))];
    const guarded = await call(
      key,
      {
        ...base,
        contents: [
          ...base.contents,
          { role: 'model', parts: [{ text: JSON.stringify(result.spec) }] },
          {
            role: 'user',
            parts: [
              {
                text: `That draft used banned marketing phrases: ${banned.join(
                  ', '
                )}. Rewrite the whole object with every one of them gone. Keep every fact the user gave you, keep the same sections, keep the same facts array. Change only the wording that was flagged and anything that depended on it.`,
              },
            ],
          },
        ],
      },
      signal
    );

    const second = validateSpec(guarded);
    if (second.ok && findSlop(second.spec).length === 0) {
      return { spec: second.spec, repairs: [...result.repairs, 'rewrote marketing phrases'] };
    }
    // the rewrite was worse or also sloppy — keep the first, and say so
    return {
      spec: result.spec,
      repairs: [
        ...result.repairs,
        `left ${banned.length} phrase(s) in: ${banned.slice(0, 3).join(', ')}`,
      ],
    };
  }

  return { spec: result.spec, repairs: result.repairs };
}

/** Ask Gemini to pick a theme for a finished spec. */
export async function pickTheme(
  key: string,
  spec: SiteSpec,
  signal?: AbortSignal
): Promise<{ theme: (typeof THEME_IDS)[number]; accent: (typeof ACCENTS)[number]; reason: string }> {
  const raw = (await call(
    key,
    {
      systemInstruction: {
        parts: [
          {
            text: 'You choose typographic themes for websites. Reply with JSON only. Pick the theme whose character fits the subject, not the trendiest one.',
          },
        ],
      },
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Subject: ${spec.meta.title}\nDescription: ${spec.meta.description}\nSections: ${spec.sections
                .map((s) => s.type)
                .join(', ')}\n\nTheme options: editorial (serif display, generous measure), studio (tight grotesque, oversized), retail (brisk, dense grid), nordic (light, airy, muted), brutalist (monospace, hard borders), warm (soft, rounded, human), terminal (mono, dark, technical), minimal (stripped back).\n\nAccent options: ${ACCENTS.join(', ')}.`,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.4,
        responseMimeType: 'application/json',
        responseSchema: obj(
          {
            theme: { type: 'string', enum: [...THEME_IDS] },
            accent: { type: 'string', enum: [...ACCENTS] },
            reason: str(),
          },
          ['theme', 'accent', 'reason']
        ),
      },
    },
    signal
  )) as { theme: (typeof THEME_IDS)[number]; accent: (typeof ACCENTS)[number]; reason: string };

  return raw;
}

export { GeminiError };
