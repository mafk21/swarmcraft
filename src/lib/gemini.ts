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

  /* The user's own brief comes first and in full: it is the primary
     instruction, and everything below is supporting detail they optionally
     filled in. Putting it here rather than merging it into a field means the
     model reads their words, not a paraphrase of them. */
  const own = String(answers.prompt ?? answers.description ?? '').trim();
  if (own) {
    lines.push(
      `WHAT THE USER WANTS, IN THEIR OWN WORDS\nThis is the brief. Follow it. Where it is specific, it wins over the generic advice below.\n\n${own.slice(0, 6000)}`
    );
  }

  // keep the short description when it is a separate thing
  const desc = String(answers.description ?? '').trim();
  if (desc && desc !== own) lines.push(`Summary: ${desc}`);

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

/**
 * Ceiling for a single request — deliberately generous.
 *
 * It is NOT the limit on the build; BUDGET_MS is. This only stops a request
 * that has clearly died. Being stingy here is the wrong trade: a page that
 * arrives at 30s is worth far more to the user than a clean timeout at 25s,
 * and the animation can always be compressed to absorb it.
 */
const TIMEOUT_MS = 55_000;

/**
 * The hard limit for the whole build, animation included.
 *
 * There is one budget and everything draws from it: each model call is given
 * whatever is LEFT rather than a private ceiling of its own. Before this
 * existed the ceilings were 40s for writing, 40s for a repair round-trip and
 * 40s for a slop rewrite — each reasonable alone, together two minutes of
 * silence, which is exactly what the user got.
 */
export const BUDGET_MS = 80_000;

async function call(
  key: string,
  body: unknown,
  signal?: AbortSignal,
  /** absolute epoch ms; the call is aborted when the budget passes */
  deadline = Infinity
): Promise<unknown> {
  /* The ceiling has to cover the BODY, not just the headers.
     The previous version cleared the timer as soon as `fetch` resolved, so a
     stream that opened and then stalled hung forever — the clock ran past the
     limit and nothing ever happened. One timer now spans the whole exchange. */
  const ctl = new AbortController();
  const onAbort = () => ctl.abort();
  signal?.addEventListener('abort', onAbort, { once: true });

  let timedOut = false;
  const remaining = Math.max(0, deadline - Date.now());
  const allowed = Math.min(TIMEOUT_MS, remaining);

  /* The timer does two things, and both matter.
     Aborting the request tells the network layer to stop. But a deadline that
     only *asks* to stop is not a deadline: if the implementation ignores the
     abort — or resolves the headers and then never finishes the body — the
     promise would never settle and the build would sit there past its limit.
     So the same timer also rejects, and that rejection is what call() returns.
     Whatever the fetch does afterwards is ignored. */
  let trip: (e: Error) => void = () => {};
  const guard = new Promise<never>((_, reject) => {
    trip = reject;
  });
  const timer = setTimeout(() => {
    timedOut = true;
    ctl.abort();
    trip(
      new GeminiError(
        remaining < TIMEOUT_MS
          ? `The build ran out of time while Google was still writing — ${Math.round(
              remaining / 1000
            )}s of the budget was left. Usually a rate limit. Try again.`
          : `Google did not finish within ${Math.round(
              allowed / 1000
            )} seconds. Usually a rate limit or a slow connection. Try again.`,
        408
      )
    );
  }, Math.max(0, allowed));

  const fail = (e: unknown): never => {
    if (timedOut) throw e instanceof GeminiError ? e : new GeminiError('Ran out of time.', 408);
    if (signal?.aborted) throw new GeminiError('Cancelled.', 0);
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new GeminiError(
        remaining < TIMEOUT_MS
          ? `The build ran out of time while Google was still writing — ${Math.round(
              remaining / 1000
            )}s of the budget was left. Usually a rate limit. Try again.`
          : `Google did not finish within ${Math.round(
              allowed / 1000
            )} seconds. Usually a rate limit or a slow connection. Try again.`,
        408
      );
    }
    throw new GeminiError('Could not reach Google. Check your connection.', 0);
  };

  try {
    let res: Response;
    try {
      res = await Promise.race([guard, fetch(ENDPOINT(MODEL, key), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctl.signal,
      })]);
    } catch (e) {
      return fail(e);
    }

    if (!res.ok) {
      let detail = `${res.status}`;
      try {
        const j = await Promise.race([guard, res.json()]);
        detail = (j as { error?: { message?: string } })?.error?.message ?? detail;
      } catch {
        /* non-json error body */
      }
      const hint =
        res.status === 429
          ? ' — you have hit the free tier rate limit. Wait a minute and try again.'
          : '';
      throw new GeminiError(`${detail}${hint}`, res.status);
    }

    /* Reading the body is where it used to hang. */
    let json: unknown;
    try {
      json = await Promise.race([guard, res.json()]);
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

/**
 * Turn the interview into a validated SiteSpec.
 *
 * ONE call. No repair round-trip, no rewrite pass, no retry of any kind.
 *
 * Both follow-ups used to cost a full extra request, so a bad draft made three
 * 40-second calls before measuring had even started — which is how a hard limit
 * of 90 seconds became a user staring at 140. What replaces them is free:
 *
 *   · shape   — anything the schema rejects is repaired locally in
 *               validateSpec: bad sections are dropped, long lists trimmed. A
 *               page that is merely imperfect is still a page.
 *   · wording — the banned-phrase list, the section rules and the voice rules
 *               are all in SYSTEM before the request goes out, and the slop
 *               scan afterwards tells the user the truth instead of spending
 *               another call to hide it.
 *
 * If the result cannot be salvaged we fail fast and say why rather than quietly
 * paying for another attempt.
 */
export async function buildSpec(
  key: string,
  kind: (typeof SITE_KINDS)[number],
  answers: AnswerMap,
  signal?: AbortSignal,
  deadline = Infinity
): Promise<{ spec: SiteSpec; repairs: string[] }> {
  const raw = await call(
    key,
    {
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
    },
    signal,
    deadline
  );

  const result = validateSpec(raw);

  if (!result.ok) {
    throw new GeminiError(
      `The generated content did not pass validation: ${result.issues.slice(0, 3).join('; ')}`,
      200
    );
  }

  return { spec: result.spec, repairs: result.repairs };
}

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

export { GeminiError };

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
    /** absolute epoch ms for the WHOLE build; every model call shares it */
    deadline?: number;
  } = {}
): Promise<BuiltSite> {
  const reports: MuseReport[] = [];

  const record = (r: MuseReport) => {
    reports.push(r);
    opts.onMuse?.(r);
  };

  opts.onStage?.('Writing the page');
  const { spec, repairs } = await buildSpec(
    key,
    kind,
    answers,
    opts.signal,
    opts.deadline ?? Date.now() + BUDGET_MS
  );
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
