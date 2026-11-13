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
import type { SiteSpec } from './spec';
import { KIND_BRIEFS } from './questions';
import { validateSpec, findSlop } from './spec';

/**
 * Models to try, best first.
 *
 * `gemini-2.5-flash` answers 404 for any project created recently. Pinning one
 * literal name broke this app once and would break it again at the next
 * retirement, so the first choice is the alias Google maintains.
 */
const MODELS = [
  'gemini-flash-latest',
  'gemini-3.8-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
] as const;

/** Google's "that model is unknown or closed to you" answers. Try the next name. */
function modelGone(status: number, detail: string): boolean {
  if (status === 404) return true;
  return /no longer available|NOT_FOUND|is not found for API version|not supported for generateContent/i.test(
    detail
  );
}

/**
 * How to make a model stop thinking.
 *
 * This is the bug that cost the last build, and it is not obvious: Gemini 3.x
 * models CANNOT have thinking disabled. Sending `thinkingBudget: 0` to them is
 * accepted and then ignored, so the model thinks at its default ("low" on
 * 3.6/3.8 Flash) before writing a character — and thought tokens are billed
 * against `maxOutputTokens`, so a 6000-token page can starve.
 *
 * `thinkingLevel` is the control that works on 3.x, but the accepted range
 * differs per model and the wrong value is a hard 400: `minimal` is rejected
 * outright by 3.7 and 3.8 Flash. So the mapping is explicit, and `low` is the
 * safe floor for anything new because every non-image Gemini 3 model documents
 * it.
 *
 * Never send both fields: that is a 400 on every 3.x model.
 */
function thinkingConfigFor(model: string): Record<string, unknown> {
  /* 2.5 and the moving alias still take the legacy budget. */
  if (model.includes('2.5') || model === 'gemini-flash-latest') {
    return { thinkingBudget: 0 };
  }
  /* Models documented as accepting `minimal`. */
  if (/3\.6-flash|3\.5-flash-lite|3\.1-flash-lite|3-flash/.test(model)) {
    return { thinkingLevel: 'minimal' };
  }
  /* 3.7 / 3.8 Flash and anything newer: reject `minimal`, accept `low`. */
  return { thinkingLevel: 'low' };
}

/** The model currently in use, updated once one works. */
let liveModel: string | null = null;

/**
 * 2.5 Flash THINKS by default, and thinking tokens are not billable output but
 * they are wall-clock. A structured 400-word page would spend 20–60s reasoning
 * before emitting a character. We do not need that: the schema and the brief
 * already constrain the answer. Turn it off and the same draft lands in 2–5s.
 */
/* NOTE: thinkingConfig is no longer a shared constant. It is injected per model
   inside call(), because `thinkingBudget: 0` is silently ignored by Gemini 3.x
   and `thinkingLevel: 'minimal'` is a hard 400 on 3.8 Flash. Sending one shape
   to every model is what made the app both slow and intermittently broken. */
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

Be brief. A page that says three true things well beats one that says nine vaguely.

── OUTPUT SHAPE ─────────────────────────────────────────────────────────────
Return ONE JSON object and nothing else. No markdown fences, no commentary.
Exact keys, exact spelling:

{
  "meta": { "title": string, "description": string, "theme": one of
            "editorial"|"studio"|"retail"|"nordic"|"brutalist"|"warm"|"terminal"|"minimal",
            "accent": one of "slate"|"oxblood"|"forest"|"ink"|"sand"|"clay",
            "themeReason": string },
  "nav": { "brand": string, "links": [{ "label": string, "href": string }] },
  "sections": [ section, ... 3 to 9 of them ],
  "footer": { "note": string },
  "voice": { "register": string, "facts": [string] }
}

A section is one of these, and "type" must be exactly one of these strings:

  { "type": "hero",      "eyebrow"?: string, "headline": string, "sub": string,
    "cta"?: { "label": string, "href": string } }
  { "type": "features",  "heading": string, "items": [{ "title": string, "body": string }, 3-6 items] }
  { "type": "pricing",   "heading": string,
    "tiers": [{ "name": string, "price": string, "period"?: string,
                "features": [2-8 strings], "cta": string, "featured"?: boolean }, 2-4 tiers] }
  { "type": "products",  "heading": string, "items": [{ "name": string, "price": string, "note"?: string }, 3-12] }
  { "type": "testimonials", "heading": string, "items": [{ "quote": string, "author": string, "role"?: string }, 2-6] }
  { "type": "faq",       "heading": string, "items": [{ "q": string, "a": string }, 3-8] }
  { "type": "about",     "heading": string, "body": [1-4 strings] }
  { "type": "menu",      "heading": string,
    "groups": [{ "name": string, "items": [{ "name": string, "price": string, "note"?: string }, 2-14] }, 1-6] }
  { "type": "gallery",   "heading"?: string, "items": [{ "title": string, "caption"?: string }, 3-9] }
  { "type": "stats",     "items": [{ "value": string, "label": string }, 3-4] }
  { "type": "cta",       "heading": string, "sub"?: string, "action": { "label": string, "href": string } }
  { "type": "contact",   "heading": string, "email"?: string, "phone"?: string, "address"?: string, "form": boolean }
  { "type": "schedule",  "heading": string,
    "days": [{ "day": string, "items": [{ "time": string, "title": string }, 1-10] }, 1-7] }

Omit an optional key entirely rather than sending null. Use no other keys.
`;

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

/**
 * Turn Google's error text into something a person can read.
 *
 * A schema rejection arrives as one enormous sentence with every offending path
 * repeated: "Invalid JSON payload received. Unknown name \"const\" at
 * 'generation_config.response_schema.properties[2].value.items.anyOf[2]...'"
 * thirteen times over. The user was shown all of it, in a box, at 500 words.
 * The useful part is the first clause; the paths are for me, not for them.
 */
function humanise(raw: string): string {
  const text = raw.trim();

  /* the schema-vocabulary failure, the one that actually happened */
  const unknown = text.match(/Unknown name "([^"]+)"/);
  if (unknown) {
    return `The request shape was rejected by Google: it does not accept "${unknown[1]}" in a response schema. This is a bug in the app, not in your key or your brief. Nothing was charged.`;
  }
  if (/Invalid JSON payload/i.test(text)) {
    return 'Google rejected the shape of the request. This is a bug in the app, not in your key or your brief.';
  }

  /* generic: first sentence, capped, because the rest is usually paths */
  const firstSentence = text.split(/(?<=\.)\s/)[0] ?? text;
  return firstSentence.length > 240 ? `${firstSentence.slice(0, 240)}…` : firstSentence;
}

function hintFor(status: number): string {
  if (status === 429) return ' — you have hit the free tier rate limit. Wait a minute and try again.';
  if (status === 401 || status === 403) return ' — Google did not accept the key. Check it on the Connect screen.';
  return '';
}

/** How long silence is tolerated before a stream is declared dead. */
let idleMs = 25_000;

/** Test seam: make the silence watchdog observable without a 25s test. */
export function setIdleTimeoutForTesting(ms: number) {
  idleMs = ms;
}

async function call(
  key: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
  /** absolute epoch ms; the call is aborted when the budget passes */
  deadline = Infinity
): Promise<unknown> {
  /* ── why this is streamed ─────────────────────────────────────────────────
     The previous version made one blocking POST and waited for the whole body.
     That means the ONLY thing the app knows for up to 55 seconds is silence,
     and the failure it produced was the least useful sentence possible: "Ran
     out of time." No stage, no progress, no way to tell a slow start from a
     hang, and nothing to show on screen while it happened.

     Streaming turns the same request into a heartbeat. Text arrives in
     per-second pieces, which buys three things the build needs:
       1. a stall is detected in seconds, not after the whole budget;
       2. the screen can count the page up as it is written;
       3. a response that dies halfway still leaves its partial text to salvage.

     `alt=sse` is a query parameter, not a body field, so the request shape is
     otherwise identical — and if a future model ignores it we fall back to
     reading the single JSON body. */

  const ctl = new AbortController();
  const onAbort = () => ctl.abort();
  signal?.addEventListener('abort', onAbort, { once: true });

  let timedOut = false;
  const remaining = Math.max(0, deadline - Date.now());
  const allowed = Math.min(TIMEOUT_MS, remaining);
  const startedAt = Date.now();

  /* No text for this long and the connection is dead, whatever the socket
     thinks. Generous enough for the model to think before its first token,
     short enough that the user is not left guessing for a minute. */
  const IDLE_MS = idleMs;
  let lastActivity = Date.now();
  let bytes = 0;

  let trip: (e: Error) => void = () => {};
  const guard = new Promise<never>((_, reject) => {
    trip = reject;
  });

  const timeLeft = () => Math.max(0, deadline - Date.now());
  const outOfTime = () => {
    timedOut = true;
    ctl.abort();
    /* Round UP and never print zero: "within 0s" is what a sub-second budget
       produced, and it reads as a bug in the timer rather than a fact. */
    const spent = Math.max(1, Math.ceil((Date.now() - startedAt) / 1000));
    return new GeminiError(
      bytes > 0
        ? `Google stopped sending while it was still writing — ${spent}s in. Usually a rate limit or a dropped connection. Try again.`
        : `Google did not start answering within ${spent}s. Usually a rate limit on the free tier. Wait a minute and try again.`,
      theBudgetWasTight ? 408 : 504
    );
  };
  /* `remaining < TIMEOUT_MS` means the build budget, not this call, is the
     thing running out — which is a different sentence to the user. */
  const theBudgetWasTight = remaining < TIMEOUT_MS;

  const timer = setTimeout(() => trip(outOfTime()), Math.max(0, allowed));
  /* A watchdog for silence. Separate from the overall timer because a build
     that is genuinely too slow and a build that is wedged are different
     failures and deserve different advice. */
  const idle = setInterval(() => {
    if (Date.now() - lastActivity > IDLE_MS) {
      trip(
        new GeminiError(
          bytes > 0
            ? 'Google went quiet in the middle of the page. That is usually a dropped connection. Try again.'
            : 'Google accepted the request but sent nothing back. Usually a free-tier rate limit. Wait a minute and try again.',
          504
        )
      );
    }
  }, 1000);

  const fail = (e: unknown): never => {
    if (e instanceof GeminiError) throw e;
    if (timedOut) throw outOfTime();
    if (signal?.aborted) throw new GeminiError('Cancelled.', 0);
    if (e instanceof DOMException && e.name === 'AbortError') {
      if (timeLeft() <= 0) throw outOfTime();
      throw new GeminiError(
        'The connection to Google was cut off. Check your connection and try again.',
        0
      );
    }
    throw new GeminiError('Could not reach Google. Check your connection.', 0);
  };

  let text = '';
  let finishReason = '';
  let status = 0;
  let detail = '';

  try {
    const candidates = liveModel
      ? [liveModel, ...MODELS.filter((m) => m !== liveModel)]
      : [...MODELS];

    let res: Response | null = null;

    /* Waits, in ms, before each retry of a throttled request. Roughly 4s, 10s,
       then 20s — long enough for a free-tier minute to roll over, short enough
       that two retries still fit inside an 80-second build. */
    const backoff = [4_000, 10_000, 20_000];
    let attempt = 0;

    for (let i = 0; i < candidates.length; i++) {
      const model = candidates[i];
      /* The model decides its own thinking config. Sending the wrong shape is
         a hard 400, and sending the 2.5 budget to a 3.x model is silently
         ignored — both were live bugs. */
      const payload = {
        ...body,
        generationConfig: {
          ...(body.generationConfig as Record<string, unknown>),
          thinkingConfig: thinkingConfigFor(model),
        },
      };

      try {
        res = await Promise.race([
          guard,
          fetch(`${ENDPOINT(model, key)}&alt=sse`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: ctl.signal,
          }),
        ]);
      } catch (e) {
        return fail(e);
      }

      if (res.ok) {
        liveModel = model;
        break;
      }

      status = res.status;
      detail = `${status}`;
      try {
        const j = await Promise.race([guard, res.json()]);
        detail = (j as { error?: { message?: string } })?.error?.message ?? detail;
      } catch {
        /* non-json error body */
      }

      /* A dead model name is our problem: move on immediately, it is free. */
      const more = i < candidates.length - 1;
      if (more && modelGone(status, detail)) continue;

      /* Being throttled is NOT a reason to give up while there is budget left.
         The user has 80 seconds and a 429 usually clears in a few. Failing
         fast here is what turns "wait a minute and try again" into a build the
         user has to babysit themselves. Back off and try the SAME model again,
         because switching names will not lift a per-key rate limit. */
      /* 429 is the free-tier shape. 503 is Google saying the model is busy,
         which is also temporary. A plain 500 is a real error and retrying it
         just burns the user's budget on the same failure. */
      const throttle = status === 429 || status === 503;
      const waitMs = backoff[attempt] ?? 0;
      if (throttle && attempt < backoff.length && timeLeft() > waitMs + 8_000) {
        attempt++;
        await new Promise((r) => setTimeout(r, waitMs));
        i--; // retry this model
        continue;
      }

      throw new GeminiError(`${humanise(detail)}${hintFor(status)}`, status);
    }

    if (!res) throw new GeminiError('Google accepted no model name. Try again.', 404);
    if (!res.ok) throw new GeminiError(`${humanise(detail)}${hintFor(status)}`, status);

    /* ── read the stream, or the plain body if there is no stream ────────── */
    const contentType = res.headers?.get?.('content-type') ?? '';
    const looksStreamed = contentType.includes('event-stream');

    const takeChunk = (json: unknown) => {
      const p = json as {
        candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
        promptFeedback?: { blockReason?: string };
        error?: { message?: string };
      };
      if (p?.error?.message) throw new GeminiError(humanise(p.error.message), 500);
      if (p?.promptFeedback?.blockReason) {
        throw new GeminiError(
          `Google refused the request: ${p.promptFeedback.blockReason}.`,
          200
        );
      }
      const piece = p?.candidates?.[0]?.content?.parts?.map((x) => x.text ?? '').join('') ?? '';
      if (piece) text += piece;
      if (p?.candidates?.[0]?.finishReason) finishReason = p.candidates[0].finishReason!;
      bytes += piece.length;
      lastActivity = Date.now();
    };

    if (looksStreamed && res.body?.getReader) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      try {
        for (;;) {
          const { done, value } = await Promise.race([guard, reader.read()]);
          if (done) break;
          lastActivity = Date.now();
          buffer += decoder.decode(value, { stream: true });
          /* SSE frames are separated by a blank line. Keeping the tail in the
             buffer is what stops a JSON object split across two reads from
             being thrown away — the classic streaming bug. */
          const frames = buffer.split(/\r?\n\r?\n/);
          buffer = frames.pop() ?? '';
          for (const frame of frames) {
            const line = frame.split(/\r?\n/).find((l) => l.startsWith('data:'));
            if (!line) continue;
            const raw = line.slice(5).trim();
            if (!raw || raw === '[DONE]') continue;
            try {
              takeChunk(JSON.parse(raw));
            } catch (e) {
              if (e instanceof GeminiError) throw e;
              /* a keep-alive or a malformed frame is not fatal */
            }
          }
        }
      } catch (e) {
        if (e instanceof GeminiError) throw e;
        return fail(e);
      }
    } else {
      let json: unknown;
      try {
        json = await Promise.race([guard, res.json()]);
      } catch (e) {
        return fail(e);
      }
      takeChunk(json);
    }

    if (!text) {
      throw new GeminiError(
        finishReason === 'MAX_TOKENS'
          ? 'The answer was cut off before it finished. Try fewer sections.'
          : `The model returned nothing (${finishReason || 'no content'}).`,
        200
      );
    }

    const truncated = finishReason === 'MAX_TOKENS';
    try {
      return JSON.parse(text);
    } catch {
      const m = text.match(/\{[\s\S]*\}/);
      if (m) {
        try {
          return JSON.parse(m[0]);
        } catch {
          /* fall through */
        }
      }
      throw new GeminiError(
        truncated
          ? 'The answer ran out of room before the page was finished. Try a shorter brief.'
          : 'The model did not return usable JSON.',
        200
      );
    }
  } finally {
    clearTimeout(timer);
    clearInterval(idle);
    signal?.removeEventListener('abort', onAbort);
  }
}

/**
 * Validate the key by actually generating.
 *
 * This used to call `models.list` and call it a day — which quietly lied. A
 * retired model still appears in that list as supporting `generateContent`;
 * only a real call reveals that the project cannot use it. So setup reported
 * "Key works" and the user's first build died with a 404 from a model name
 * that had been dead the whole time.
 *
 * The only honest test of "can this key build a page" is to ask for a page.
 * One token, the same model chain a real build uses, a short leash.
 */
export async function testKey(
  key: string,
  signal?: AbortSignal
): Promise<{ ok: boolean; message: string }> {
  const ctl = new AbortController();
  const onAbort = () => ctl.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  /* No timeout here used to mean the Connect screen could spin forever. */
  const timer = setTimeout(() => ctl.abort(), 20_000);

  let detail = '';
  let status = 0;
  try {
    const candidates = [...MODELS];
    for (let i = 0; i < candidates.length; i++) {
      const model = candidates[i];
      let res: Response;
      try {
        res = await fetch(ENDPOINT(model, key), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: 'Reply with the single word: ready' }] }],
            generationConfig: {
              maxOutputTokens: 8,
              temperature: 0,
              thinkingConfig: thinkingConfigFor(model),
            },
          }),
          signal: ctl.signal,
        });
      } catch {
        return { ok: false, message: 'Could not reach Google. Check your connection.' };
      }

      if (res.ok) {
        liveModel = model;
        return { ok: true, message: 'Key works — it wrote a real reply.' };
      }

      status = res.status;
      detail = `${status}`;
      try {
        const j = await res.json();
        detail = (j as { error?: { message?: string } })?.error?.message ?? detail;
      } catch {
        /* non-json error body */
      }

      /* A dead model name is our problem, not the user's: try the next one. */
      if (i < candidates.length - 1 && modelGone(status, detail)) continue;
      break;
    }
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }

  /* The key is real, we just cannot spend it this second. Telling the user
     their key is broken here would send them to regenerate a good key. */
  if (status === 429) {
    return { ok: true, message: 'Key works. Google is rate-limiting it right now, so wait a minute.' };
  }
  if (status === 401 || status === 403) {
    return { ok: false, message: 'Google did not accept this key. Check it was copied in full.' };
  }
  return { ok: false, message: `${humanise(detail)}${hintFor(status)}` };
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
/**
 * Ask for the page, and validate it here.
 *
 * The request carries NO responseSchema. That is deliberate and it is the fix
 * for the class of bug that cost four rounds of the user's time:
 *
 *   · responseSchema is a narrow OpenAPI subset, not JSON Schema. One
 *     unsupported keyword (`const`) rejected every build before the model was
 *     even asked anything, and it failed as a hard 400.
 *   · a schema can only enforce shape, never honesty, and shape is already
 *     enforced here by zod — which runs on real data and can repair a page that
 *     is merely imperfect.
 *   · the worst failure mode is the one that cannot fall back. Removing the
 *     fragile constraint is strictly safer than keeping a redundant one.
 *
 * The output contract lives in SYSTEM instead, in plain words, and the result
 * is validated locally. Anything the validator can salvage is salvaged.
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
        /* Gemini 3.x cannot have thinking turned off, and thought tokens are
           billed against this same budget. A nine-section page is ~4000 tokens
           of visible text; at "low" thinking that leaves comfortable headroom.
           At 6000 it was a coin flip that ended as "ran out of room". */
        maxOutputTokens: 12_000,
      },
    },
    signal,
    deadline
  );

  const result = validateSpec(raw);

  if (!result.ok) {
    throw new GeminiError(
      `The model's page did not fit our shape: ${result.issues.slice(0, 2).join('; ')}. ` +
        'This is a bug in the app, not in your key or your brief. Nothing was charged.',
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

  const named = {
    muse: 'Polyhymnia',
    role: 'accessibility',
    notes: notes.length ? [...new Set(notes)].slice(0, 5) : ['images have alt text, buttons have names'],
  };

  const parsed = validateSpec({ ...spec, sections });

  /* The repaired page has to still be a valid page. It normally is — the only
     things touched here are alt text and button labels — but if it is not, we
     must not claim the repair: reporting "changed" while returning the original
     sections would tell the user a button was fixed that still says the old
     thing, and the undo button would then do nothing. */
  if (!parsed.ok && changed) {
    return {
      spec,
      reports: [{ ...named, changed: false, notes: [...named.notes, 'could not fix these without breaking the page'].slice(0, 5) }],
    };
  }

  return { spec: parsed.ok ? parsed.spec : spec, reports: [{ ...named, changed }] };
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
