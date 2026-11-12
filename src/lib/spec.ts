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

const nonEmpty = z.string().trim().min(1).max(400);
const short = z.string().trim().min(1).max(120);
const body = z.string().trim().min(1).max(1200);

const HeroSection = z.object({
  type: z.literal('hero'),
  eyebrow: short.optional(),
  headline: z.string().trim().min(1).max(90),
  sub: z.string().trim().min(1).max(240),
  cta: z.object({ label: short, href: short }).optional(),
});

const FeaturesSection = z.object({
  type: z.literal('features'),
  heading: short,
  items: z
    .array(z.object({ title: short, body }))
    .min(3)
    .max(6),
});

const PricingSection = z.object({
  type: z.literal('pricing'),
  heading: short,
  tiers: z
    .array(
      z.object({
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

const ProductsSection = z.object({
  type: z.literal('products'),
  heading: short,
  items: z
    .array(
      z.object({
        name: short,
        price: short,
        note: short.optional(),
      })
    )
    .min(3)
    .max(12),
});

const TestimonialsSection = z.object({
  type: z.literal('testimonials'),
  heading: short,
  items: z
    .array(z.object({ quote: nonEmpty, author: short, role: short.optional() }))
    .min(2)
    .max(6),
});

const FaqSection = z.object({
  type: z.literal('faq'),
  heading: short,
  items: z.array(z.object({ q: short, a: body })).min(3).max(8),
});

const AboutSection = z.object({
  type: z.literal('about'),
  heading: short,
  body: z.array(body).min(1).max(4),
});

const MenuSection = z.object({
  type: z.literal('menu'),
  heading: short,
  groups: z
    .array(
      z.object({
        name: short,
        items: z
          .array(z.object({ name: short, price: short, note: short.optional() }))
          .min(2)
          .max(14),
      })
    )
    .min(1)
    .max(6),
});

const GallerySection = z.object({
  type: z.literal('gallery'),
  heading: short.optional(),
  items: z.array(z.object({ title: short, caption: short.optional() })).min(3).max(9),
});

const StatsSection = z.object({
  type: z.literal('stats'),
  items: z
    .array(z.object({ value: short, label: short }))
    .min(3)
    .max(4),
});

const CtaSection = z.object({
  type: z.literal('cta'),
  heading: short,
  sub: body.optional(),
  action: z.object({ label: short, href: short }),
});

const ContactSection = z.object({
  type: z.literal('contact'),
  heading: short,
  email: z.string().trim().email().optional(),
  phone: short.optional(),
  address: short.optional(),
  form: z.boolean(),
});

const ScheduleSection = z.object({
  type: z.literal('schedule'),
  heading: short,
  days: z
    .array(
      z.object({
        day: short,
        items: z.array(z.object({ time: short, title: short })).min(1).max(10),
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
