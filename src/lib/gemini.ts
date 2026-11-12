/* ============================================================================
   Gemini, called directly from the browser with the user's own key.

   Two responsibilities:
     1. ask()    — structure the user's answers into a SiteSpec
     2. theme()  — when the user delegates, choose a theme and say why

   The model never emits CSS. The response schema it must satisfy has no
   styling fields (see spec.ts, which is .strict()).
   ========================================================================== */

import { SITE_KINDS } from './spec';
import type { Section } from './spec';
import { THEME_IDS, ACCENTS, type SiteSpec } from './spec';
import { KIND_BRIEFS } from './questions';
import { validateSpec, findSlop } from './spec';

const MODEL = 'gemini-2.5-flash';

/**
 * 2.5 Flash THINKS by default, and thinking tokens are not billable output but
 * they are wall-clock. A structured 400-word page would spend 20–60s reasoning
 * before emitting a character. We do not need that: the schema and the brief
 * already constrain the answer. Turn it off and the same draft lands in 2–5s.
 */
const NO_THINKING = { thinkingConfig: { thinkingBudget: 0 } } as const;
const ENDPOINT = (model: string, key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
    key
  )}`;

export type AnswerMap = Record<string, string | string[] | boolean>;

/* ── prompt ──────────────────────────────────────────────────────────────── */

const SYSTEM = `You write and edit website content. A builder renders your output into a designed page. You are the only pass: the draft you return is what ships, so get it right the first time.

Hard rules, no exceptions:

1. NEVER write CSS, HTML, class names, colours, fonts or layout. The schema has no field for it. Do not add extra keys.
2. Write like a person who runs the thing. Concrete, specific, short sentences. One spelling convention throughout — pick British or American and keep it.
3. Do not invent facts, numbers, testimonials, client names, prices, addresses or credentials. If the user gave you none, write around it. Never invent a testimonial.
4. Banned phrases — using any of these fails validation: "unlock the power", "unleash", "elevate your", "next level", "game-changer", "cutting-edge", "state-of-the-art", "seamlessly", "revolutionize", "world-class", "best-in-class", "one-stop shop", "look no further", "we are passionate about", "in today's fast-paced", "delve into", "tapestry", "empower", "transform your business".
5. No em-dash at the start of a sentence. No exclamation marks. No emoji.
6. Headings are 2–5 words. No title case tics like "Why Choose Us?".
7. Be internally consistent. One name for the company, one price per thing, one format per phone number or price. If the user gave prices in one format, use it everywhere.
8. Match the tone the user asked for in every sentence. Do not drift warm, do not drift corporate.
9. The "voice.facts" array is the only material you may reuse. Keep every real number the user gave you there, verbatim.
10. Sections must appear in an order a reader would want them, starting with "hero". Put contact last if it exists.
11. For images, never invent a src. Omit image fields entirely unless the user tells you they have files.
12. Accessibility: every button label says what it does, never "click here" or "learn more".

Be brief. A page that says three true things well beats one that says nine vaguely.`;

/** What each kind's page should actually be made of, in order. */
export const KIND_SHAPES: Record<string, string> = {
  store:
    'hero (with a picture if they gave one), products (the catalogue, prices in their format), about (who makes it), faq (shipping, returns, care), contact. A store without products is not a store.',
  landing:
    'hero (the claim and the one action), features (three specifics), stats (only if they gave numbers), faq (the objection, answered), cta (the same action again). Nothing else.',
  portfolio:
    'hero (name and discipline), gallery (layout "feature" — their best piece large, the rest supporting), about (how they work), contact.',
  blog:
    'hero (what this is), gallery (layout "grid" — the latest pieces as cards), about (who writes it), contact (subscribe).',
  restaurant:
    'hero, menu (groups of dishes with prices), about (the room and the people), gallery (layout "strip" if they have photographs), contact (address, hours, phone).',
  saas:
    'hero, features (three steps of how it works), stats (only real numbers), pricing (real tiers), faq (security, migration, contracts), cta.',
  agency:
    'hero, features (what a client receives), gallery (layout "grid" — case studies), stats (only if real), about (process), contact.',
  event:
    'hero (name, date, ticket action), schedule (the running order by day), features (what you leave with), pricing (ticket types), faq, contact.',
  docs:
    'hero (what this is, the first task), features (the sections of the docs), about (the mental model), faq (troubleshooting), contact (support).',
  custom:
    'hero, then whatever the user said must be on the page, then contact.',
};

function briefPrompt(kind: keyof typeof KIND_BRIEFS, answers: AnswerMap): string {
  const brief = KIND_BRIEFS[kind];
  const lines: string[] = [];

  lines.push(`Site kind: ${kind}`);
  lines.push(`This kind of page is normally made of: ${KIND_SHAPES[kind] ?? 'hero, then what the user asked for.'}`);
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

const TIMEOUT_MS = 40_000;

async function call(key: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
  /* The ceiling has to cover the BODY, not just the headers.
     The previous version cleared the timer as soon as `fetch` resolved, so a
     stream that opened and then stalled hung forever — the clock ran past the
     limit and nothing ever happened. One timer now spans the whole exchange. */
  const ctl = new AbortController();
  const onAbort = () => ctl.abort();
  signal?.addEventListener('abort', onAbort, { once: true });

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctl.abort();
  }, TIMEOUT_MS);

  const fail = (e: unknown): never => {
    if (signal?.aborted) throw new GeminiError('Cancelled.', 0);
    if (timedOut || (e instanceof DOMException && e.name === 'AbortError')) {
      throw new GeminiError(
        `Google did not finish within ${Math.round(
          TIMEOUT_MS / 1000
        )} seconds. Usually a rate limit or a slow connection. Try again.`,
        408
      );
    }
    throw new GeminiError('Could not reach Google. Check your connection.', 0);
  };

  try {
    let res: Response;
    try {
      res = await fetch(ENDPOINT(MODEL, key), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctl.signal,
      });
    } catch (e) {
      return fail(e);
    }

    if (!res.ok) {
      let detail = `${res.status}`;
      try {
        const j = await res.json();
        detail = j?.error?.message ?? detail;
      } catch {
        /* non-json error body */
      }
      const hint =
        res.status === 429
          ? ' — you have hit the free tier rate limit. Wait a minute, or turn off Review passes.'
          : '';
      throw new GeminiError(`${detail}${hint}`, res.status);
    }

    /* Reading the body is where it used to hang. */
    let json: unknown;
    try {
      json = await res.json();
    } catch (e) {
      return fail(e);
    }

    const payload = json as {
      candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
      promptFeedback?: { blockReason?: string };
    };

    if (payload?.promptFeedback?.blockReason) {
      throw new GeminiError(
        `Google refused the request: ${payload.promptFeedback.blockReason}.`,
        200
      );
    }

    const text = payload?.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? '')
      .join('');

    if (!text) {
      const reason = payload?.candidates?.[0]?.finishReason ?? 'no content returned';
      throw new GeminiError(
        reason === 'MAX_TOKENS'
          ? 'The answer was cut off before it finished. Try fewer sections.'
          : `The model returned nothing (${reason}).`,
        200
      );
    }

    try {
      return JSON.parse(text);
    } catch {
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) throw new GeminiError('The model did not return JSON.', 200);
      return JSON.parse(m[0]);
    }
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
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
      maxOutputTokens: 3000,
      ...NO_THINKING,
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
        ...NO_THINKING,
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


/* ============================================================================
   The Muses.

   These are not costumes. Each one is a real pass with a job, a narrow prompt
   and a specific output — so the user can see what was checked and undo it.
   They run after the section draft and before it is accepted.

   Polyhymnia is deterministic (no model call) — accessibility is checkable, so
   it is checked, not asked about.
   ========================================================================== */

export type MuseReport = {
  muse: string;
  role: string;
  changed: boolean;
  notes: string[];
};

export type Revised = { spec: SiteSpec; reports: MuseReport[] };

/** Clio: keep one name, price and form of address across the whole page. */
export async function clio(
  key: string,
  spec: SiteSpec,
  signal?: AbortSignal
): Promise<Revised> {
  const raw = (await call(
    key,
    {
      systemInstruction: {
        parts: [
          {
            text: 'You are a consistency editor. You are given a website as JSON. Find internal contradictions: a product priced one way in one place and another way elsewhere, a company referred to by two different names, one paragraph in British spelling and another in American, a phone number formatted two ways. Fix ONLY those. Keep the schema and every fact. Return the whole JSON.',
          },
        ],
      },
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Fix inconsistencies only. Do not rewrite anything else.\n\n${JSON.stringify(
                spec
              )}`,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
        ...NO_THINKING,
      },
    },
    signal
  ));

  const parsed = validateSpec(raw);
  if (!parsed.ok) {
    return { spec, reports: [{ muse: 'Clio', role: 'consistency', changed: false, notes: ['returned invalid, kept the original'] }] };
  }

  const diff = changedFields(spec, parsed.spec);
  return {
    spec: parsed.spec,
    reports: [
      {
        muse: 'Clio',
        role: 'consistency',
        changed: diff.length > 0,
        notes: diff.length ? diff.slice(0, 4) : ['no contradictions found'],
      },
    ],
  };
}

/** Thalia: is the tone actually the tone they asked for? */
export async function thalia(
  key: string,
  spec: SiteSpec,
  register: string,
  signal?: AbortSignal
): Promise<Revised> {
  if (!register.trim()) {
    return { spec, reports: [{ muse: 'Thalia', role: 'voice', changed: false, notes: ['no tone given'] }] };
  }

  const raw = (await call(
    key,
    {
      systemInstruction: {
        parts: [
          {
            text: `You are a line editor with one instruction: make the copy sound like the requested register and nothing else. Every sentence must be in that register. Do not add facts, do not add sections, do not change prices, names or numbers. Return the whole JSON.`,
          },
        ],
      },
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Requested register: ${register}\n\nRewrite the copy that does not match.\n\n${JSON.stringify(
                spec
              )}`,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.5,
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
        ...NO_THINKING,
      },
    },
    signal
  ));

  const parsed = validateSpec(raw);
  if (!parsed.ok) {
    return { spec, reports: [{ muse: 'Thalia', role: 'voice', changed: false, notes: ['returned invalid, kept the original'] }] };
  }
  const diff = changedFields(spec, parsed.spec);
  return {
    spec: parsed.spec,
    reports: [{ muse: 'Thalia', role: 'voice', changed: diff.length > 0, notes: diff.length ? diff.slice(0, 4) : ['already matches'] }],
  };
}

/**
 * Polyhymnia: accessibility. Deterministic, no model.
 *  - images must have alt text
 *  - headings must not be used as styling
 *  - links must not say "click here"
 *  - a page needs at least one h1 (the hero provides it)
 */
export function polyhymnia(spec: SiteSpec): Revised {
  const notes: string[] = [];
  let changed = false;
  const sections = spec.sections.map((s) => {
    const clone = JSON.parse(JSON.stringify(s)) as Section;

    const fixImage = (holder: { image?: { src: string; alt?: string } }) => {
      if (holder.image && holder.image.src && !holder.image.alt?.trim()) {
        holder.image.alt = '';
        notes.push('an image was missing alt text');
        changed = true;
      }
    };

    if ('image' in clone) fixImage(clone as { image?: { src: string; alt?: string } });

    if (clone.type === 'gallery' || clone.type === 'products' || clone.type === 'menu') {
      const anyClone = clone as unknown as { items?: { image?: unknown }[]; groups?: { items?: { image?: unknown }[] }[] };
      anyClone.items?.forEach((it) => fixImage(it as { image?: { src: string; alt?: string } }));
      anyClone.groups?.forEach((g) =>
        g.items?.forEach((it) => fixImage(it as { image?: { src: string; alt?: string } }))
      );
    }

    // "click here" / "learn more" links
    if (clone.type === 'cta' && /^(click here|learn more|read more|more)$/i.test(clone.action.label.trim())) {
      clone.action.label = 'Read the details';
      notes.push('a button said "click here"');
      changed = true;
    }
    if (clone.type === 'hero' && clone.cta && /^(click here|learn more)$/i.test(clone.cta.label.trim())) {
      clone.cta.label = 'Read the details';
      notes.push('a button said "click here"');
      changed = true;
    }

    return clone as Section;
  });

  const hasHero = spec.sections.some((s) => s.type === 'hero');
  if (!hasHero) notes.push('no hero, so no h1 on the page');

  const parsed = validateSpec({ ...spec, sections });
  return {
    spec: parsed.ok ? parsed.spec : spec,
    reports: [
      {
        muse: 'Polyhymnia',
        role: 'accessibility',
        changed,
        notes: notes.length ? [...new Set(notes)].slice(0, 5) : ['images have alt text, buttons have names'],
      },
    ],
  };
}

/** Calliope: did they get the sections they ticked, in a sensible order? */
export function calliope(spec: SiteSpec, wanted: string[]): Revised {
  const have = spec.sections.map((s) => s.type);
  const missing = wanted.filter((w) => !have.includes(w as never));
  const notes: string[] = [];
  let out = spec;

  // hero first, always
  if (out.sections[0]?.type !== 'hero') {
    const hero = out.sections.find((s) => s.type === 'hero');
    if (hero) {
      out = { ...out, sections: [hero, ...out.sections.filter((s) => s !== hero)] };
      notes.push('moved the hero to the top');
    }
  }

  // contact, if present, belongs last
  const ci = out.sections.findIndex((s) => s.type === 'contact');
  const last = out.sections.length - 1;
  if (ci >= 0 && ci !== last && out.sections[last]?.type !== 'contact') {
    const copy = [...out.sections];
    const [c] = copy.splice(ci, 1);
    copy.push(c);
    out = { ...out, sections: copy };
    notes.push('moved contact to the end');
  }

  if (missing.length) notes.push(`never produced: ${missing.join(', ')}`);

  return {
    spec: out,
    reports: [
      {
        muse: 'Calliope',
        role: 'structure',
        changed: notes.length > 0,
        notes: notes.length ? notes : ['sections match what you asked for'],
      },
    ],
  };
}

/** A readable list of what actually differs between two specs. */
function changedFields(a: SiteSpec, b: SiteSpec): string[] {
  const out: string[] = [];
  const walkA = flatten(a);
  const walkB = flatten(b);
  for (const key of new Set([...Object.keys(walkA), ...Object.keys(walkB)])) {
    if (walkA[key] !== walkB[key]) out.push(key);
  }
  return out;
}

function flatten(obj: unknown, prefix = '', acc: Record<string, string> = {}) {
  if (obj === null || obj === undefined) {
    acc[prefix] = String(obj);
    return acc;
  }
  if (typeof obj !== 'object') {
    acc[prefix] = String(obj);
    return acc;
  }
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => flatten(v, `${prefix}[${i}]`, acc));
    return acc;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    flatten(v, prefix ? `${prefix}.${k}` : k, acc);
  }
  return acc;
}


/* ── the conductor ───────────────────────────────────────────────────────── */

export type BuiltSite = { spec: SiteSpec; reports: MuseReport[]; repairs: string[] };

/**
 * The full generation — ONE model call.
 *
 * It used to be three: a draft, then Clio and Thalia as separate passes. That
 * was the whole reason a build took minutes. Their instructions are now folded
 * into the single system prompt (consistency and voice, rules 7 and 8), and the
 * deterministic checks still run afterwards because they are free and they can
 * catch what a prompt cannot enforce.
 *
 * Budget: one call, thinking off, ~5–12 seconds in practice. Everything else in
 * the funnel runs locally.
 */
export async function buildSite(
  key: string,
  kind: (typeof SITE_KINDS)[number],
  answers: AnswerMap,
  opts: {
    register?: string;
    wanted?: string[];
    onMuse?: (r: MuseReport) => void;
    /** fired BEFORE each stage, so the UI can label and time it honestly */
    onStage?: (label: string) => void;
    signal?: AbortSignal;
  } = {}
): Promise<BuiltSite> {
  const reports: MuseReport[] = [];

  const record = (r: MuseReport) => {
    reports.push(r);
    opts.onMuse?.(r);
  };

  opts.onStage?.('Writing the page');
  const { spec, repairs } = await buildSpec(key, kind, answers, opts.signal);
  let current = spec;

  // Calliope: structural, free, and it cannot be left to the model
  const structure = calliope(current, opts.wanted ?? []);
  current = structure.spec;
  record(structure.reports[0]);

  // The model was asked to fix these in the same pass; report whether it did.
  const findings = findSlop(current);
  record({
    muse: 'Melpomene',
    role: 'slop guard',
    changed: findings.length === 0,
    notes:
      findings.length === 0
        ? ['no marketing phrases']
        : [`left ${findings.length} phrase(s): ${[...new Set(findings.map((f) => f.phrase))].slice(0, 3).join(', ')}`],
  });

  const a11y = polyhymnia(current);
  current = a11y.spec;
  record(a11y.reports[0]);

  return { spec: current, reports, repairs };
}
