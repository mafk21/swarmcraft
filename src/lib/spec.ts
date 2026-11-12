/* ============================================================================
   The SiteSpec — the contract between Gemini and the renderer.

   THE RULE THAT MAKES "NO AI PATTERNS" STRUCTURAL:
   There is no `styles` field. No `className`. No colour. No font.
   The model composes sections and writes content. It cannot write CSS,
   because the schema has nowhere to put it.
   ========================================================================== */

import { z } from 'zod';

/* ── kinds of site ────────────────────────────────────────────────────────── */

export const SITE_KINDS = [
  'store',
  'landing',
  'portfolio',
  'blog',
  'restaurant',
  'saas',
  'agency',
  'event',
  'docs',
  'custom',
] as const;

export type SiteKind = (typeof SITE_KINDS)[number];

export const KIND_META: Record<SiteKind, { label: string; blurb: string }> = {
  store: { label: 'Store', blurb: 'Sell products or a catalogue' },
  landing: { label: 'Landing page', blurb: 'One page, one action' },
  portfolio: { label: 'Portfolio', blurb: 'Show your work' },
  blog: { label: 'Blog', blurb: 'Write and publish' },
  restaurant: { label: 'Restaurant', blurb: 'Menu, hours, reservations' },
  saas: { label: 'SaaS', blurb: 'Product, pricing, signup' },
  agency: { label: 'Agency', blurb: 'Services and case studies' },
  event: { label: 'Event', blurb: 'Schedule, speakers, tickets' },
  docs: { label: 'Docs', blurb: 'Reference and guides' },
  custom: { label: 'Custom', blurb: 'Something else' },
};

/* ── themes: a closed enum. The model picks, it never writes. ────────────── */

export const THEME_IDS = [
  'editorial',
  'studio',
  'retail',
  'nordic',
  'brutalist',
  'warm',
  'terminal',
  'minimal',
] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export const ACCENTS = ['slate', 'oxblood', 'forest', 'ink', 'sand', 'clay'] as const;
export type AccentId = (typeof ACCENTS)[number];

/* ── section schemas ─────────────────────────────────────────────────────── */

/**
 * Every object in a section is strict. Without this, zod silently STRIPS
 * unknown keys — which would mean a model could smuggle {"styles": "..."} into
 * a section and have it quietly dropped rather than rejected. Dropped is safe;
 * rejected is honest. We want rejected.
 */
const strict = <T extends z.ZodRawShape>(shape: T) => z.object(shape).strict();

/**
 * A reference to an image the user brought themselves. `src` may be:
 *   - 'media:<id>'  a file in IndexedDB (inlined as a data URL on export)
 *   - 'pages/<n>'   another page in this site (used by portfolio case cards)
 * Anything else is ignored at render time, so a model cannot inject a remote
 * URL and turn this into a tracking pixel.
 */
const ImageRef = z.object({
  src: z.string().trim().max(2048),
  alt: z.string().trim().max(200).optional(),
});

const nonEmpty = z.string().trim().min(1).max(400);
const short = z.string().trim().min(1).max(120);
const body = z.string().trim().min(1).max(1200);

const HeroSection = strict({
  type: z.literal('hero'),
  eyebrow: short.optional(),
  headline: z.string().trim().min(1).max(90),
  sub: z.string().trim().min(1).max(240),
  cta: strict({ label: short, href: short }).optional(),
  image: ImageRef.optional(),
});

const FeaturesSection = strict({
  type: z.literal('features'),
  heading: short,
  items: z
    .array(strict({ title: short, body }))
    .min(3)
    .max(6),
});

const PricingSection = strict({
  type: z.literal('pricing'),
  heading: short,
  tiers: z
    .array(
      strict({
        name: short,
        price: short,
        period: short.optional(),
        features: z.array(short).min(2).max(8),
        cta: short,
        featured: z.boolean().optional(),
      })
    )
    .min(2)
    .max(4),
});

const ProductsSection = strict({
  type: z.literal('products'),
  heading: short,
  items: z
    .array(
      strict({
        name: short,
        price: short,
        note: short.optional(),
        image: ImageRef.optional(),
      })
    )
    .min(3)
    .max(12),
});

const TestimonialsSection = strict({
  type: z.literal('testimonials'),
  heading: short,
  items: z
    .array(strict({ quote: nonEmpty, author: short, role: short.optional() }))
    .min(2)
    .max(6),
});

const FaqSection = strict({
  type: z.literal('faq'),
  heading: short,
  items: z.array(strict({ q: short, a: body })).min(3).max(8),
});

const AboutSection = strict({
  type: z.literal('about'),
  heading: short,
  body: z.array(body).min(1).max(4),
  image: ImageRef.optional(),
});

const MenuSection = strict({
  type: z.literal('menu'),
  heading: short,
  groups: z
    .array(
      strict({
        name: short,
        items: z
          .array(
            strict({
              name: short,
              price: short,
              note: short.optional(),
              image: ImageRef.optional(),
            })
          )
          .min(2)
          .max(14),
      })
    )
    .min(1)
    .max(6),
});

const GallerySection = strict({
  type: z.literal('gallery'),
  heading: short.optional(),
  items: z
    .array(
      strict({
        title: short,
        caption: short.optional(),
        image: ImageRef.optional(),
        /** 'wide' takes two columns, 'tall' takes two rows */
        span: z.enum(['normal', 'wide', 'tall']).optional(),
      })
    )
    .min(3)
    .max(9),
  /** which composition this gallery uses */
  layout: z.enum(['grid', 'feature', 'strip', 'masonry']).optional(),
});

const StatsSection = strict({
  type: z.literal('stats'),
  items: z
    .array(strict({ value: short, label: short }))
    .min(3)
    .max(4),
});

const CtaSection = strict({
  type: z.literal('cta'),
  heading: short,
  sub: body.optional(),
  action: strict({ label: short, href: short }),
});

const ContactSection = strict({
  type: z.literal('contact'),
  heading: short,
  email: z.string().trim().email().optional(),
  phone: short.optional(),
  address: short.optional(),
  form: z.boolean(),
});

const ScheduleSection = strict({
  type: z.literal('schedule'),
  heading: short,
  days: z
    .array(
      strict({
        day: short,
        items: z.array(strict({ time: short, title: short })).min(1).max(10),
      })
    )
    .min(1)
    .max(7),
});

export const SectionSchema = z.discriminatedUnion('type', [
  HeroSection,
  FeaturesSection,
  PricingSection,
  ProductsSection,
  TestimonialsSection,
  FaqSection,
  AboutSection,
  MenuSection,
  GallerySection,
  StatsSection,
  CtaSection,
  ContactSection,
  ScheduleSection,
]);

export type Section = z.infer<typeof SectionSchema>;
export type SectionType = Section['type'];

export const SECTION_LABEL: Record<SectionType, string> = {
  hero: 'Hero',
  features: 'Features',
  pricing: 'Pricing',
  products: 'Products',
  testimonials: 'Testimonials',
  faq: 'FAQ',
  about: 'About',
  menu: 'Menu',
  gallery: 'Gallery',
  stats: 'Stats',
  cta: 'Call to action',
  contact: 'Contact',
  schedule: 'Schedule',
};

/* ── the site ────────────────────────────────────────────────────────────── */

export const SiteSpecSchema = z
  .object({
    meta: z.object({
      title: z.string().trim().min(1).max(80),
      description: z.string().trim().min(1).max(200),
      theme: z.enum(THEME_IDS),
      accent: z.enum(ACCENTS),
      themeReason: z.string().trim().max(160).optional(),
    }),
    nav: z.object({
      brand: z.string().trim().min(1).max(40),
      links: z.array(z.object({ label: short, href: short })).max(6),
    }),
    sections: z.array(SectionSchema).min(3).max(9),
    footer: z.object({
      note: z.string().trim().max(200),
    }),
    voice: z.object({
      /** one line describing the tone, used by Melpomene's guard */
      register: z.string().trim().max(120),
      /** concrete facts the copy is allowed to use */
      facts: z.array(z.string().trim().max(160)).max(20),
    }),
  })
  .strict(); // ← rejects any extra key, including a smuggled `styles`

export type SiteSpec = z.infer<typeof SiteSpecSchema>;

/* ── the anti-slop guard ─────────────────────────────────────────────────── */

/** Phrases that are an instant fail. Melpomene rejects and demands a rewrite. */
export const SLOP = [
  'unlock the power',
  'unleash the power',
  'elevate your',
  'take it to the next level',
  'in today\u2019s fast-paced',
  "in today's fast-paced",
  'game-changer',
  'game changer',
  'seamlessly integrate',
  'seamlessly connects',
  'cutting-edge',
  'state-of-the-art',
  'revolutionize',
  'revolutionise',
  'we are passionate about',
  "we're passionate about",
  'empower your',
  'transform your business',
  'world-class',
  'best-in-class',
  'one-stop shop',
  'look no further',
  'lorem ipsum',
  'delve into',
  'tapestry',
  'in the ever-evolving',
];

export type SlopFinding = { section: number; phrase: string; field: string };

/** Walk every string in the spec and find banned phrases. */
export function findSlop(spec: SiteSpec): SlopFinding[] {
  const out: SlopFinding[] = [];
  const walk = (value: unknown, path: string, idx: number) => {
    if (typeof value === 'string') {
      const low = value.toLowerCase();
      for (const phrase of SLOP) {
        if (low.includes(phrase)) out.push({ section: idx, phrase, field: path });
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((v, i) => walk(v, `${path}[${i}]`, idx));
      return;
    }
    if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) walk(v, path ? `${path}.${k}` : k, idx);
    }
  };
  spec.sections.forEach((s, i) => walk(s, s.type, i));
  return out;
}

/* ── validation entry point ──────────────────────────────────────────────── */

export type SpecResult =
  | { ok: true; spec: SiteSpec; repairs: string[] }
  | { ok: false; error: string; issues: string[] };

/**
 * Validate model output. Applies safe repairs before failing:
 *  - trims strings
 *  - drops sections that don't match any known type
 *  - clamps section count to 3..9
 */
export function validateSpec(raw: unknown): SpecResult {
  const repairs: string[] = [];
  let candidate: unknown = raw;

  if (candidate && typeof candidate === 'object' && 'sections' in candidate) {
    const obj = candidate as { sections: unknown[] };
    if (Array.isArray(obj.sections)) {
      const kept = obj.sections.filter((s) => {
        const ok = SectionSchema.safeParse(s).success;
        if (!ok) repairs.push(`dropped an invalid section`);
        return ok;
      });
      if (kept.length !== obj.sections.length) obj.sections = kept;
      if (obj.sections.length > 9) {
        obj.sections = obj.sections.slice(0, 9);
        repairs.push('trimmed to 9 sections');
      }
    }
  }

  const parsed = SiteSpecSchema.safeParse(candidate);
  if (parsed.success) return { ok: true, spec: parsed.data, repairs };

  return {
    ok: false,
    error: 'The generated site did not match the schema.',
    issues: parsed.error.issues.map((i) => `${i.path.join('.') || 'root'}: ${i.message}`),
  };
}


/* ============================================================================
   Editing and duplication.

   The inspector never lets a value become invalid, but these helpers keep the
   spec correct anyway: empty strings fall back, arrays keep their shape, and
   the discriminated union is preserved because we only mutate in place.
   ========================================================================== */

/** Path into a section: the section index, then keys. */
export type FieldPath = (string | number)[];

export function getIn(obj: unknown, path: FieldPath): unknown {
  return path.reduce<unknown>((acc, k) => {
    if (acc == null) return undefined;
    return (acc as Record<string | number, unknown>)[k];
  }, obj);
}

export function setIn<T>(obj: T, path: FieldPath, value: unknown): T {
  if (path.length === 0) return value as T;
  const clone = Array.isArray(obj) ? ([...obj] as unknown[]) : { ...(obj as object) };
  const [head, ...rest] = path;
  (clone as Record<string | number, unknown>)[head] = setIn(
    (clone as Record<string | number, unknown>)[head],
    rest,
    value
  );
  return clone as T;
}

/**
 * Replace a section field without breaking the union.
 * Returns a NEW spec. If the next value would make the section invalid, the
 * previous value is kept for that field only.
 */
export function editSectionField(
  spec: SiteSpec,
  sectionIndex: number,
  path: FieldPath,
  value: unknown
): { spec: SiteSpec; rejected: boolean } {
  const sections = [...spec.sections];
  const current = sections[sectionIndex];
  if (!current) return { spec, rejected: true };

  const nextSection = setIn(current, path, value);
  const check = SectionSchema.safeParse(nextSection);

  if (!check.success) {
    // The whole section failed. That can legitimately happen while a required
    // field is mid-edit, so the caller is told and keeps what it had.
    return { spec, rejected: true };
  }

  sections[sectionIndex] = check.data as Section;
  return { spec: { ...spec, sections }, rejected: false };
}

/** Edit meta / nav / footer. Same rule: validate, or keep what was there. */
export function editMeta(
  spec: SiteSpec,
  path: FieldPath,
  value: unknown
): { spec: SiteSpec; rejected: boolean } {
  const next = setIn(spec, path, value);
  const check = SiteSpecSchema.safeParse(next);
  if (!check.success) return { spec, rejected: true };
  return { spec: check.data, rejected: false };
}

/**
 * The page in one plain string, for the public page and for showing the user
 * exactly what they are exporting. Includes contact details so a scraper that
 * only reads this one file still gets them.
 */
export function pageText(spec: SiteSpec): string {
  const out: string[] = [
    `${spec.meta.title}`,
    `${spec.meta.description}`,
    '',
    `${spec.nav.brand}`,
    ...spec.nav.links.map((l) => `${l.label}: ${l.href}`),
    '',
  ];

  const walk = (value: unknown) => {
    if (typeof value === 'string') out.push(value);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object')
      Object.entries(value as Record<string, unknown>).forEach(([k, v]) => {
        if (k === 'type' || k === 'href') return;
        walk(v);
      });
  };

  walk(spec.sections);
  out.push('', spec.footer.note);
  return out.join('\n');
}

/**
 * Duplicate a section and append it. Used by the "add a section" control so
 * people are not forced back through the whole funnel to add a second FAQ.
 */
export function duplicateSection(spec: SiteSpec, index: number): SiteSpec | null {
  const src = spec.sections[index];
  if (!src) return null;
  if (spec.sections.length >= 9) return null;
  const copy = JSON.parse(JSON.stringify(src)) as Section;
  return { ...spec, sections: [...spec.sections, copy] };
}

export function removeSection(spec: SiteSpec, index: number): SiteSpec | null {
  // the hero is structural; never drop it, and never go below the schema floor
  if (spec.sections[index]?.type === 'hero') return null;
  if (spec.sections.length <= 3) return null;
  return { ...spec, sections: spec.sections.filter((_, i) => i !== index) };
}

export function moveSection(spec: SiteSpec, index: number, delta: number): SiteSpec {
  const to = index + delta;
  if (to < 0 || to >= spec.sections.length) return spec;
  const sections = [...spec.sections];
  const [item] = sections.splice(index, 1);
  sections.splice(to, 0, item);
  return { ...spec, sections };
}


/* ============================================================================
   Pages.

   A SiteSpec is one page. A SiteSpec[] is a site. Page 0 is always the home
   page; its nav becomes the site nav. Links between pages use `page:2`, which
   render() turns into a real href.
   ========================================================================== */

export type SiteDoc = {
  pages: SiteSpec[];
  /** which page index the workbench is showing */
  current: number;
};

export function siteTitle(doc: SiteDoc): string {
  return doc.pages[0]?.meta.title ?? 'Untitled';
}

/**
 * Turn `page:2` into a real href, and leave everything else alone.
 * Export filenames come from pageSlug(), so home is index.html and the rest are
 * derived from their titles.
 */
export function resolveHref(
  href: string,
  fromIndex: number,
  inExport: boolean,
  slugs?: string[]
): string {
  const m = href.match(/^page:(\d+)$/);
  if (!m) return href;
  const n = Number(m[1]);
  if (n === fromIndex) return '#top';
  if (!inExport) return `#page-${n}`;
  return `./${slugs?.[n] ?? `page-${n + 1}`}.html`;
}

/** Every page after the first needs a slug for export filenames. */
export function pageSlug(spec: SiteSpec, index: number): string {
  const base = spec.meta.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'page';
  return index === 0 ? 'index' : base;
}

/** A blank page in the same voice and theme as the home page. */
export function newPage(from: SiteSpec, title: string): SiteSpec {
  return {
    meta: {
      title,
      description: from.meta.description,
      theme: from.meta.theme,
      accent: from.meta.accent,
    },
    nav: {
      brand: from.nav.brand,
      // a new page needs a way back home, ahead of whatever the home page links to
      links: [{ label: 'Home', href: 'page:0' }, ...from.nav.links].slice(0, 6),
    },
    sections: [
      {
        type: 'hero',
        headline: title,
        sub: 'One sentence about what is on this page.',
      },
      {
        type: 'about',
        heading: 'About this page',
        body: ['Replace this with what belongs here.'],
      },
      {
        type: 'contact',
        heading: 'Contact',
        email: 'you@example.com',
        form: false,
      },
    ],
    footer: { note: from.footer.note },
    voice: { register: from.voice.register, facts: from.voice.facts },
  };
}
