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
/**
 * What a thrown fetch actually means.
 *
 * In a browser, `fetch` THROWS for a CORS rejection and for a dead network
 * alike — the page is not allowed to tell them apart, so it cannot report the
 * status. "Could not reach Google. Check your connection." was therefore a
 * guess, and for a user whose key began with `AQ.` it was the wrong guess: the
 * connection was fine, the request was being refused for the shape of its URL.
 *
 * The key format is a fact we DO have, and it is diagnostic. Saying so is the
 * difference between the user checking their wifi forever and the user
 * checking the thing that is actually wrong.
 */
function connectionFailure(key: string, what: string): GeminiError {
  const authKey = key.trim().startsWith('AQ.');
  if (authKey) {
    return new GeminiError(
      `${what} This browser could not read Google's reply. That usually means the request was refused before it was answered, and the most common cause with a new-style AQ. key is the key being restricted or the API not being enabled on its project. The key itself looks well formed.`,
      0
    );
  }
  return new GeminiError(
    `${what} Check your connection, and check that the key was copied in full — Google gives no reply at all when the key is rejected at the network edge.`,
    0
  );
}

/**
 * The endpoint, WITHOUT the key in the URL.
 *
 * This was `?key=...` — the pattern in every tutorial — and it is what broke
 * every build for a user whose key started with `AQ.`
 *
 * Google has replaced the old "Standard" keys (`AIza…`) with "Auth" keys
 * (`AQ.Ab…`), and AI Studio now issues only the new kind. The two do not
 * authenticate the same way: an `AQ.` key in a query parameter is not accepted,
 * while the same key in the `x-goog-api-key` header works. This is not a niche
 * edge case — it is reported against Bazarr, Lingarr and half a dozen other
 * projects, all with the identical symptom, and all fixed by moving the key out
 * of the URL and into the header.
 *
 * The header is also what Google documents, and it keeps the secret out of
 * URLs, logs and browser history. Both key formats work with it.
 */
const ENDPOINT = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

/** Auth + content type. The key never touches the URL. */
function headersFor(key: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-goog-api-key': key,
  };
}

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

/**
 * Thrown internally to move on to the next model. Never reaches the user.
 *
 *   gone   — the model name is retired for this project. Free to skip.
 *   silent — accepted the request, wrote nothing. Worth another model.
 *   busy   — per-MINUTE throttle. The next name will be throttled too, so wait.
 *   daily  — the per-DAY allowance for THAT MODEL is spent. Google counts it
 *            per project per model, so a different model has its own bucket.
 *            Flash allows 20/day and Flash-Lite 500/day on the free tier, so
 *            this is precisely when changing model is the right move.
 */
class TryNext extends Error {
  constructor(readonly why: 'silent' | 'gone' | 'busy' | 'daily', readonly quota = '') {
    super(why);
  }
}

/**
 * Read Google's quota violation out of a 429.
 *
 * The body names the limit exactly, e.g.
 *   {"quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier",
 *    "quotaValue":"20","quotaDimensions":{"model":"gemini-3.8-flash"}}
 * That is the difference between "wait a minute" and "today is used up,
 * switching to the model with a bigger free allowance" — and getting it wrong
 * is what leaves a user retrying a key that is perfectly fine.
 */
type Quota = { perDay: boolean; limit: string };

function readQuota(detail: unknown): Quota | null {
  const d = detail as {
    error?: {
      details?: {
        violations?: { quotaId?: string; quotaMetric?: string; quotaValue?: string }[];
      }[];
    };
  };
  const violations = (d?.error?.details ?? []).flatMap((x) => x?.violations ?? []);
  const v = violations.find((x) => /quota|rate/i.test(`${x.quotaId}${x.quotaMetric}`));
  if (!v) return null;
  const id = `${v.quotaId ?? ''} ${v.quotaMetric ?? ''}`;
  return { perDay: /perday|per_day/i.test(id), limit: v.quotaValue ?? '' };
}

async function call(
  key: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
  /** absolute epoch ms; the call is aborted when the budget passes */
  deadline = Infinity
): Promise<unknown> {
  /* ── why this is streamed, and why each attempt is self-contained ────────
     This started as one blocking POST, which told the app nothing for up to 55
     seconds and failed with "Ran out of time" — the least useful sentence it
     could produce. Streaming fixed the blindness. But the model loop still had
     a structural hole: it only reacted to a NON-OK response, so a model that
     answered 200 and then sent nothing held the entire build hostage in the
     read phase and the next model was never tried.

     That is a real Gemini behaviour on the free tier — an accepted request that
     produces no text — and it looked exactly like the user's rate limit.

     So each attempt now owns its own budget, its own abort controller and its
     own silence watchdog, and any of them can end it. Silence is a reason to
     try the next model, not a reason to fail. */

  const startedAt = Date.now();
  const remaining = Math.max(0, deadline - Date.now());
  /* The build budget, not this call, may be the thing running out. Different
     sentence to the user, so it is decided once here. */
  const budgetIsTight = remaining < TIMEOUT_MS;

  const attempts = liveModel
    ? [liveModel, ...MODELS.filter((m) => m !== liveModel)]
    : [...MODELS];

  /* Waits before retrying a throttled request. A free-tier limit is per minute,
     so these are sized to let a minute roll over rather than to be polite. */
  const backoff = [3_000, 8_000, 15_000];

  let gotAnyBytes = false;
  let lastStatus = 0;
  let lastDetail = '';
  /* annotated so TS does not narrow this to `null` from the only visible
     assignment inside the nested closure */
  let lastQuota = null as Quota | null;
  let attemptsMade = 0;

  const attemptOne = async (model: string, budgetMs: number) => {
    const ctl = new AbortController();
    const onAbort = () => ctl.abort();
    signal?.addEventListener('abort', onAbort, { once: true });

    let timedOut = false;
    let bytes = 0;
    let lastActivity = Date.now();
    const IDLE_MS = Math.min(idleMs, Math.max(1_500, budgetMs));

    let trip: (e: Error) => void = () => {};
    const guard = new Promise<never>((_, reject) => {
      trip = reject;
    });

    const outOfTime = () => {
      timedOut = true;
      ctl.abort();
      return new GeminiError(
        bytes > 0
          ? `Google stopped sending while it was still writing — ${Math.max(
              1,
              Math.ceil((Date.now() - startedAt) / 1000)
            )}s in. Usually a dropped connection. Try again.`
          : budgetIsTight
            ? 'The 80-second budget ran out before Google started writing. That usually means the free tier is throttling this key. Wait a minute.'
            : 'Google did not answer in time. Usually a free-tier rate limit. Wait a minute and try again.',
        504
      );
    };

    const timer = setTimeout(() => trip(outOfTime()), Math.max(0, budgetMs));
    /* Silence is the failure mode that actually happens, so it gets its own
       clock. A build that is too slow and a build that is dead are different
       problems and deserve different advice. */
    const idle = setInterval(() => {
      if (Date.now() - lastActivity > IDLE_MS) {
        /* Move on AND release the socket. Without the abort, a model that
           accepted the request and went quiet leaves a live connection behind
           — on a free tier where connections are limited, that is how one dead
           model poisons the models tried after it. */
        ctl.abort();
        trip(new TryNext('silent'));
      }
    }, 250);

    const cleanup = () => {
      clearTimeout(timer);
      clearInterval(idle);
      signal?.removeEventListener('abort', onAbort);
    };

    try {
      const payload = {
        ...body,
        generationConfig: {
          ...(body.generationConfig as Record<string, unknown>),
          thinkingConfig: thinkingConfigFor(model),
        },
      };

      let res: Response;
      attemptsMade++;
      try {
        res = await Promise.race([
          guard,
          fetch(`${ENDPOINT(model)}?alt=sse`, {
            method: 'POST',
            headers: headersFor(key),
            body: JSON.stringify(payload),
            signal: ctl.signal,
          }),
        ]);
      } catch (e) {
        if (e instanceof GeminiError || e instanceof TryNext) throw e;
        if (timedOut) throw outOfTime();
        if (signal?.aborted) throw new GeminiError('Cancelled.', 0);
        if (e instanceof DOMException && e.name === 'AbortError') throw new TryNext('silent');
        throw connectionFailure(key, 'Google could not be reached.');
      }

      if (!res.ok) {
        lastStatus = res.status;
        lastDetail = `${res.status}`;
        let body: unknown = null;
        try {
          body = await Promise.race([guard, res.json()]);
          lastDetail = (body as { error?: { message?: string } })?.error?.message ?? lastDetail;
        } catch {
          /* non-json error body */
        }
        if (modelGone(res.status, lastDetail)) throw new TryNext('gone');

        if (res.status === 429 || res.status === 503) {
          const quota = readQuota(body);
          if (quota?.perDay) {
            lastQuota = quota;
            /* Spend the day's allowance on THIS model, not on the key. The next
               model has its own bucket, so move on without waiting. */
            throw new TryNext('daily', quota.limit);
          }
          throw new TryNext('busy', quota?.limit ?? '');
        }
        throw new GeminiError(`${humanise(lastDetail)}${hintFor(res.status)}`, res.status);
      }

      /* ── read it ─────────────────────────────────────────────────────────
         Take the first useful chunk and commit to this model. Until then the
         attempt is still refusable, so `take()` throws TryNext('silent') and
         the caller simply moves on. */
      let text = '';
      let finishReason = '';
      let committed = false;

      const take = (json: unknown) => {
        const p = json as {
          candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
          promptFeedback?: { blockReason?: string };
          error?: { message?: string };
        };
        if (p?.error?.message) throw new GeminiError(humanise(p.error.message), 500);
        if (p?.promptFeedback?.blockReason) {
          throw new GeminiError(`Google refused the request: ${p.promptFeedback.blockReason}.`, 200);
        }
        const piece = p?.candidates?.[0]?.content?.parts?.map((x) => x.text ?? '').join('') ?? '';
        if (piece) {
          text += piece;
          bytes += piece.length;
          gotAnyBytes = true;
          committed = true;
        }
        if (p?.candidates?.[0]?.finishReason) {
          finishReason = p.candidates[0].finishReason!;
          committed = true;
        }
        lastActivity = Date.now();
      };

      const contentType = res.headers?.get?.('content-type') ?? '';
      if (contentType.includes('event-stream') && res.body?.getReader) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
          const { done, value } = await Promise.race([guard, reader.read()]);
          if (done) break;
          lastActivity = Date.now();
          buffer += decoder.decode(value, { stream: true });
          /* Keep the tail: a JSON object split across two reads is the classic
             streaming bug, and it silently drops the page. */
          const frames = buffer.split(/\r?\n\r?\n/);
          buffer = frames.pop() ?? '';
          for (const frame of frames) {
            const line = frame.split(/\r?\n/).find((l) => l.startsWith('data:'));
            if (!line) continue;
            const raw = line.slice(5).trim();
            if (!raw || raw === '[DONE]') continue;
            try {
              take(JSON.parse(raw));
            } catch (e) {
              if (e instanceof GeminiError) throw e;
              /* a keep-alive or malformed frame is not fatal */
            }
          }
        }
      } else {
        let json: unknown;
        try {
          json = await Promise.race([guard, res.json()]);
        } catch (e) {
          if (e instanceof TryNext || e instanceof GeminiError) throw e;
          throw new TryNext(committed ? 'busy' : 'silent');
        }
        take(json);
      }

      if (!text) {
        /* 200, read cleanly, no words. Not a finished answer, so it is worth
           another model — but remember WHY, because "it ran out of room" and
           "it stayed silent" are different things to tell the user. */
        if (finishReason === 'MAX_TOKENS') lastDetail = 'MAX_TOKENS';
        throw new TryNext(finishReason === 'MAX_TOKENS' ? 'busy' : 'silent');
      }

      liveModel = model;

      const truncated = finishReason === 'MAX_TOKENS';
      try {
        return { value: JSON.parse(text), truncated };
      } catch {
        const m = text.match(/\{[\s\S]*\}/);
        if (m) {
          try {
            return { value: JSON.parse(m[0]), truncated };
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
    } catch (e) {
      /* Whatever ended this attempt, the connection must not survive it. */
      if (e instanceof TryNext || e instanceof GeminiError || timedOut) ctl.abort();
      if (e instanceof TryNext) throw e;
      if (e instanceof GeminiError) throw e;
      if (timedOut) throw outOfTime();
      throw connectionFailure(key, 'Google could not be reached.');
    } finally {
      cleanup();
    }
  };

  /* ── the attempt ladder ───────────────────────────────────────────────────
     Models first: a name that is retired or blind costs seconds, not the
     build. Then throttling waits, retrying the SAME model, because a per-key
     rate limit is not lifted by asking a different name. */
  const ROUNDS = 3;
  for (let round = 0; round < ROUNDS; round++) {
    for (const model of attempts) {
      const left = deadline - Date.now();
      /* Below ~1s there is no point starting a request — but breaking out
         silently is worse than trying: a ladder that placed no call at all
         still reported "every model stayed silent", which is a lie about work
         that never happened. `attemptsMade` keeps that honest. */
      if (left < 250) break;

      try {
        const { value } = await attemptOne(model, Math.min(left, TIMEOUT_MS));
        return value;
      } catch (e) {
        if (!(e instanceof TryNext)) throw e;
        if (e.why === 'gone') continue; // free: ask the next name
        /* The day's allowance is spent on that MODEL, and Google counts it per
           project per model — so the next name has its own bucket. This is the
           whole reason Flash-Lite (500/day) is in the ladder under Flash
           (20/day): it turns "come back tomorrow" into a finished page. */
        if (e.why === 'daily') continue;
        /* A silent model is worth replacing — the next name may answer.
           A per-MINUTE throttle is not: it applies to the whole key, so trying
           three more names instantly is hammering something Google has already
           said no to. Break out and wait instead. */
        if (e.why === 'busy') break;
        if (round < ROUNDS - 1) continue;
      }
    }

    /* If budget remains, wait out the throttle and go round again. A free-tier
       minute is the thing we are waiting for, so the waits get longer. */
    if (round === ROUNDS - 1) break;
    const wait = backoff[Math.min(round, backoff.length - 1)];
    if (deadline - Date.now() < wait + 5_000) break;
    await new Promise((r) => setTimeout(r, wait));
  }

  /* Everything answered but produced nothing usable. Say what we know. */
  if (lastQuota?.perDay) {
    throw new GeminiError(
      `The free tier's daily allowance is used up on every model tried${
        lastQuota.limit ? ` (Flash allows ${lastQuota.limit} requests a day)` : ''
      }. It resets at midnight Pacific time. Your key is fine — nothing is wrong with it, and nothing was charged.`,
      lastStatus
    );
  }
  if (lastStatus === 429 || lastStatus === 503) {
    throw new GeminiError(
      'The free tier is throttling this key right now. Wait about a minute and build again — the key itself is fine.',
      lastStatus
    );
  }
  if (lastDetail === 'MAX_TOKENS') {
    throw new GeminiError(
      'The model used its whole answer on thinking and never wrote the page. That is a bug in the app, not in your key or your brief. Nothing was charged.',
      200
    );
  }
  if (lastDetail) {
    throw new GeminiError(`${humanise(lastDetail)}${hintFor(lastStatus)}`, lastStatus);
  }
  if (attemptsMade === 0) {
    /* The budget was already gone before a request could be placed. Saying
       "every model stayed silent" here would be a fiction. */
    throw new GeminiError(
      'The 80-second budget ran out before Google could be asked. Try again.',
      408
    );
  }
  throw new GeminiError(
    gotAnyBytes
      ? 'Google started writing and then stopped. Try again.'
      : 'Google took the request but never started writing — every model tried stayed silent. That is a free-tier throttle on this key, not a problem with the key itself. Wait a minute and build again.',
    504
  );
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
        res = await fetch(ENDPOINT(model), {
          method: 'POST',
          headers: headersFor(key),
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
        return { ok: false, message: connectionFailure(key, 'Google could not be reached.').message };
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
