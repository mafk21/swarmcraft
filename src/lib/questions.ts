/* ============================================================================
   Questions, per kind.

   Every kind gets a DIFFERENT set. A store is asked about catalogue size and
   shipping. A portfolio is asked about discipline and clients. A restaurant is
   asked about service and reservations. Nothing is shared but the framing
   questions, and even those are worded differently.

   Question kinds:
     text      short answer
     long      paragraph
     choice    pick one (becomes a fact)
     multi     pick many (becomes the section checklist)
     toggle    yes/no
   ========================================================================== */

import type { SiteKind, SectionType, ThemeId } from './spec';

export type Question =
  | { id: string; kind: 'text' | 'long'; label: string; hint?: string; placeholder?: string; required?: boolean; max?: number }
  | { id: string; kind: 'choice'; label: string; options: string[]; required?: boolean }
  | { id: string; kind: 'multi'; label: string; hint?: string; options: { id: SectionType; label: string; why: string }[]; min?: number }
  | { id: string; kind: 'toggle'; label: string; hint?: string; default?: boolean };

export type KindBrief = {
  kind: SiteKind;
  /** framing questions every kind gets, but worded for that kind */
  nameQ: string;
  nameHint: string;
  descriptionQ: string;
  descriptionHint: string;
  descriptionPlaceholder: string;
  /** the kind's own questions */
  questions: Question[];
  /** sections offered for this kind, in the order they're ticked by default */
  sections: { id: SectionType; label: string; why: string; on: boolean }[];
  /** themes this kind tends to suit */
  themes: ThemeId[];
};

const s = (id: SectionType, label: string, why: string, on = true) => ({ id, label, why, on });

export const KIND_BRIEFS: Record<SiteKind, KindBrief> = {
  /* ── store ──────────────────────────────────────────────────────────── */
  store: {
    kind: 'store',
    nameQ: 'What is the shop called?',
    nameHint: 'As it appears on the label and in the browser tab.',
    descriptionQ: 'What do you sell, and to whom?',
    descriptionHint: 'Two sentences. Name the thing. Skip the adjectives.',
    descriptionPlaceholder:
      'Hand-thrown stoneware for home cooks. Everything is made in a small workshop in Riyadh and fired in a gas kiln.',
    questions: [
      {
        id: 'catalogue',
        kind: 'choice',
        label: 'How many products?',
        options: ['3–8, a tight edit', '10–30, a full range', '50+, a big catalogue'],
        required: true,
      },
      {
        id: 'currency',
        kind: 'text',
        label: 'Price format',
        hint: 'How prices should read on the page.',
        placeholder: 'SAR 240',
        required: true,
      },
      {
        id: 'shipping',
        kind: 'long',
        label: 'Shipping and returns, in plain words',
        hint: 'This becomes real copy on the page, not a policy link.',
        placeholder: 'Ships in 2–3 days across the Gulf. Returns accepted for 14 days, unused and in the original box.',
      },
      {
        id: 'checkout',
        kind: 'choice',
        label: 'How do people buy?',
        options: ['Direct message or email', 'A payment link', 'In person, at the workshop'],
        required: true,
      },
      {
        id: 'origin',
        kind: 'text',
        label: 'Where are you based?',
        placeholder: 'Dammam, Saudi Arabia',
      },
    ],
    sections: [
      s('hero', 'Hero', 'The first screen: what you sell, one action'),
      s('products', 'Products', 'Your catalogue with prices'),
      s('about', 'About', 'Who makes this and why'),
      s('features', 'Why this shop', 'Materials, making, guarantees'),
      s('testimonials', 'Customer words', 'Quotes from people who bought', false),
      s('faq', 'FAQ', 'Shipping, returns, care', false),
      s('contact', 'Contact', 'How to reach you'),
      s('cta', 'Closing call to action', 'One last push at the bottom', false),
    ],
    themes: ['retail', 'warm', 'minimal'],
  },

  /* ── landing ────────────────────────────────────────────────────────── */
  landing: {
    kind: 'landing',
    nameQ: 'What is this page for?',
    nameHint: 'One page, one action. Name the action.',
    descriptionQ: 'What happens after someone takes the action?',
    descriptionHint: 'Describe the result, not the page.',
    descriptionPlaceholder:
      'People can book a 30-minute call about migrating their warehouse system. No form, no gate — a calendar link.',
    questions: [
      {
        id: 'action',
        kind: 'choice',
        label: 'What is the one action?',
        options: ['Book a call', 'Join a waitlist', 'Download something', 'Sign up free'],
        required: true,
      },
      {
        id: 'audience',
        kind: 'text',
        label: 'Who is this for?',
        hint: 'Be specific enough that someone could be excluded.',
        placeholder: 'Operations leads at 20–200 person logistics companies',
        required: true,
      },
      {
        id: 'proof',
        kind: 'long',
        label: 'What proof do you have?',
        hint: 'Numbers, names, or nothing. Leave empty if you have none — the page will not invent any.',
        placeholder: 'Six warehouses migrated. Average setup time down from 11 days to 4.',
      },
      {
        id: 'objection',
        kind: 'long',
        label: 'What is the main objection?',
        hint: 'The page answers this head-on.',
        placeholder: 'People assume migration means downtime. It does not — the old system stays live until cutover.',
      },
    ],
    sections: [
      s('hero', 'Hero', 'The pitch, above the fold'),
      s('features', 'What you get', 'Three specifics, not five vague ones'),
      s('stats', 'Proof numbers', 'Concrete figures', false),
      s('faq', 'FAQ', 'The objection, answered'),
      s('testimonials', 'Quotes', 'Someone credible saying it worked', false),
      s('cta', 'Repeat the action', 'The same action, second chance'),
    ],
    themes: ['minimal', 'studio', 'nordic'],
  },

  /* ── portfolio ──────────────────────────────────────────────────────── */
  portfolio: {
    kind: 'portfolio',
    nameQ: 'What is your name, or the studio name?',
    nameHint: 'Whatever you want in the nav.',
    descriptionQ: 'What do you do, and for whom?',
    descriptionHint: 'No job titles. What comes out the other end.',
    descriptionPlaceholder:
      'I design printed matter for museums and small publishers — catalogues, wayfinding, the occasional very long poster.',
    questions: [
      {
        id: 'discipline',
        kind: 'choice',
        label: 'What is the work?',
        options: ['Design', 'Writing', 'Photography', 'Code', 'Something else'],
        required: true,
      },
      {
        id: 'projects',
        kind: 'long',
        label: 'List 3–6 projects',
        hint: 'One per line: name, then what it was.',
        placeholder:
          'Pale Fire catalogue — 240-page exhibition catalogue for a small university museum\nWayfinding, Riyadh rail link — 40 signs across two terminals\nPoster series, 2024 — 12 posters, silkscreen',
      },
      {
        id: 'clients',
        kind: 'text',
        label: 'Past clients, if you can name them',
        placeholder: 'V&A, Serpentine, a few people I should not name',
      },
      {
        id: 'available',
        kind: 'toggle',
        label: 'Say whether you are taking work?',
        hint: 'A single honest line beats an implied maybe.',
        default: true,
      },
    ],
    sections: [
      s('hero', 'Hero', 'Name and discipline'),
      s('gallery', 'Selected work', 'The projects, as plates'),
      s('about', 'Statement', 'How you work'),
      s('contact', 'Contact', 'How to reach you'),
      s('testimonials', 'Client words', 'Short quotes', false),
      s('cta', 'Availability', 'One honest line about availability', false),
    ],
    themes: ['studio', 'brutalist', 'editorial'],
  },

  /* ── blog ───────────────────────────────────────────────────────────── */
  blog: {
    kind: 'blog',
    nameQ: 'What is the publication called?',
    nameHint: 'The masthead.',
    descriptionQ: 'What do you write about?',
    descriptionHint: 'Narrow is better than broad.',
    descriptionPlaceholder:
      'Notes on maintaining old buildings in the Gulf — materials, climate, and the people who keep them standing.',
    questions: [
      {
        id: 'cadence',
        kind: 'choice',
        label: 'How often?',
        options: ['Weekly', 'Monthly', 'When it is worth it'],
        required: true,
      },
      {
        id: 'pieces',
        kind: 'long',
        label: 'Name three pieces you would write',
        hint: 'Titles only. These become the index.',
        placeholder:
          'Why gypsum fails in humidity\nFourteen doors in Al Balad\nWhat a surveyor actually does',
      },
      {
        id: 'about',
        kind: 'long',
        label: 'Who is writing?',
        hint: 'Third person, one paragraph.',
        placeholder: 'A conservation architect working in the Eastern Province since 2011.',
      },
    ],
    sections: [
      s('hero', 'Masthead', 'What this is'),
      s('gallery', 'Latest posts', 'The index'),
      s('about', 'About the writer', 'Credibility'),
      s('contact', 'Subscribe', 'One field, no spam promise'),
      s('faq', 'FAQ', 'Frequency, comments, reuse', false),
    ],
    themes: ['editorial', 'nordic', 'minimal'],
  },

  /* ── restaurant ─────────────────────────────────────────────────────── */
  restaurant: {
    kind: 'restaurant',
    nameQ: 'What is the restaurant called?',
    nameHint: 'The sign, essentially.',
    descriptionQ: 'What do you cook?',
    descriptionHint: 'Ingredients and style, not vibes.',
    descriptionPlaceholder:
      'Levantine mezze and charcoal-grilled fish. Sixteen seats, one sitting, market menu that changes weekly.',
    questions: [
      {
        id: 'service',
        kind: 'choice',
        label: 'How does service work?',
        options: ['Walk-in only', 'Reservations', 'Tasting menu, booked ahead', 'Takeaway and delivery'],
        required: true,
      },
      {
        id: 'menu',
        kind: 'long',
        label: 'Paste 6–12 dishes with prices',
        hint: 'One per line. Rough is fine — the page will format it.',
        placeholder:
          'Hummus, olive oil, pine nuts — 28\nCharcoal sea bass — 96\nLamb neck, seven hours — 110\nFattoush — 32',
      },
      {
        id: 'hours',
        kind: 'text',
        label: 'Opening hours',
        placeholder: 'Tue–Sat, 19:00–23:30. Closed Sunday and Monday.',
        required: true,
      },
      {
        id: 'address',
        kind: 'text',
        label: 'Address',
        placeholder: 'Al Khobar, Prince Faisal bin Fahd Road',
        required: true,
      },
      {
        id: 'dietary',
        kind: 'long',
        label: 'Dietary notes',
        hint: 'Honest and specific.',
        placeholder: 'Most of the menu is vegetarian. No gluten-free bread — the oven is shared.',
      },
    ],
    sections: [
      s('hero', 'Hero', 'Name, what you cook, one action'),
      s('menu', 'Menu', 'Dishes and prices'),
      s('about', 'The place', 'Room, people, philosophy'),
      s('gallery', 'Photos', 'Plates and room', false),
      s('contact', 'Visit', 'Address, hours, phone'),
      s('faq', 'FAQ', 'Dietary, corkage, large tables', false),
    ],
    themes: ['warm', 'editorial', 'retail'],
  },

  /* ── saas ───────────────────────────────────────────────────────────── */
  saas: {
    kind: 'saas',
    nameQ: 'What is the product called?',
    nameHint: 'Short.',
    descriptionQ: 'What does it do, in one sentence a buyer would repeat?',
    descriptionHint: 'No metaphors.',
    descriptionPlaceholder:
      'It reconciles bank statements against invoices automatically, so month-end close takes an afternoon instead of a week.',
    questions: [
      {
        id: 'buyer',
        kind: 'text',
        label: 'Who signs the cheque?',
        placeholder: 'Finance leads at 50–500 person companies',
        required: true,
      },
      {
        id: 'pricing',
        kind: 'long',
        label: 'Pricing tiers',
        hint: 'One per line: name, price, then what is included.',
        placeholder:
          'Solo — $19/mo — 1 user, 200 reconciliations\nTeam — $79/mo — 5 users, unlimited\nFirm — talk to us — SSO, audit log',
        required: true,
      },
      {
        id: 'integrations',
        kind: 'text',
        label: 'What does it connect to?',
        placeholder: 'Xero, QuickBooks, CSV, and 14 banks',
      },
      {
        id: 'differentiator',
        kind: 'long',
        label: 'What does it do that the obvious alternative does not?',
        placeholder: 'It never guesses. Ambiguous matches are queued for a human with both documents side by side.',
      },
    ],
    sections: [
      s('hero', 'Hero', 'The claim'),
      s('features', 'How it works', 'Three steps'),
      s('stats', 'Outcomes', 'Concrete numbers', false),
      s('pricing', 'Pricing', 'Real tiers'),
      s('testimonials', 'Customers', 'Quotes with names', false),
      s('faq', 'FAQ', 'Security, migration, contracts'),
      s('cta', 'Start', 'The signup'),
    ],
    themes: ['nordic', 'studio', 'terminal'],
  },

  /* ── agency ─────────────────────────────────────────────────────────── */
  agency: {
    kind: 'agency',
    nameQ: 'What is the studio called?',
    nameHint: 'Keep it under four words.',
    descriptionQ: 'What do you actually do for clients?',
    descriptionHint: 'Deliverables, not disciplines.',
    descriptionPlaceholder:
      'We build and run data pipelines for regional retailers — from extraction through to the dashboards the buyers check each morning.',
    questions: [
      {
        id: 'services',
        kind: 'long',
        label: 'List 3–5 services',
        hint: 'One per line: the service, then what the client receives.',
        placeholder:
          'Data audit — a report of every source, gap and duplicate\nPipeline build — a running system, documented\nDashboards — three screens your team actually uses',
        required: true,
      },
      {
        id: 'size',
        kind: 'choice',
        label: 'Team size',
        options: ['Solo', '2–10', '10–50', '50+'],
        required: true,
      },
      {
        id: 'work',
        kind: 'long',
        label: 'Two or three case studies',
        hint: 'One per line: client type, the problem, the result.',
        placeholder:
          'Grocery chain, 40 stores — stock counts wrong every Sunday — now reconciled nightly\nFurniture retailer — three spreadsheets, no source of truth — single warehouse, one dashboard',
      },
      {
        id: 'engagement',
        kind: 'choice',
        label: 'How do you work?',
        options: ['Project, fixed price', 'Retainer', 'Both'],
        required: true,
      },
    ],
    sections: [
      s('hero', 'Hero', 'What you do, for whom'),
      s('features', 'Services', 'What a client receives'),
      s('gallery', 'Work', 'Case studies'),
      s('stats', 'Numbers', 'Evidence', false),
      s('about', 'How we work', 'Process and team'),
      s('testimonials', 'Clients', 'Quotes', false),
      s('contact', 'Contact', 'Start a conversation'),
    ],
    themes: ['studio', 'editorial', 'brutalist'],
  },

  /* ── event ──────────────────────────────────────────────────────────── */
  event: {
    kind: 'event',
    nameQ: 'What is the event called?',
    nameHint: 'Including the year if it recurs.',
    descriptionQ: 'What happens at it?',
    descriptionHint: 'Who is in the room and why.',
    descriptionPlaceholder:
      'A one-day conference for people who maintain public infrastructure — 180 attendees, no vendors on stage.',
    questions: [
      {
        id: 'when',
        kind: 'text',
        label: 'Date and venue',
        placeholder: '14 March 2027, Dhahran Expo, Hall 2',
        required: true,
      },
      {
        id: 'programme',
        kind: 'long',
        label: 'Schedule outline',
        hint: 'One per line: day and time, then the session.',
        placeholder:
          '09:30 — Doors, coffee\n10:00 — Opening: what failed last year\n11:15 — Panel: procurement\n14:00 — Workshops',
        required: true,
      },
      {
        id: 'tickets',
        kind: 'long',
        label: 'Ticket types and prices',
        hint: 'One per line.',
        placeholder: 'Early — SAR 450\nStandard — SAR 700\nStudent — SAR 200',
        required: true,
      },
      {
        id: 'speakers',
        kind: 'text',
        label: 'Named speakers or sessions',
        placeholder: 'Six confirmed, two pending',
      },
    ],
    sections: [
      s('hero', 'Hero', 'Name, date, ticket action'),
      s('schedule', 'Schedule', 'The running order'),
      s('features', 'Why come', 'What you will leave with'),
      s('pricing', 'Tickets', 'Types and prices'),
      s('about', 'About', 'Who runs this'),
      s('faq', 'FAQ', 'Travel, refunds, accessibility', false),
      s('contact', 'Contact', 'Questions'),
    ],
    themes: ['brutalist', 'studio', 'retail'],
  },

  /* ── docs ───────────────────────────────────────────────────────────── */
  docs: {
    kind: 'docs',
    nameQ: 'What is the product or project?',
    nameHint: 'This is the docs home heading.',
    descriptionQ: 'What does someone come here to do?',
    descriptionHint: 'The first task, not the feature list.',
    descriptionPlaceholder:
      'Install the CLI, authenticate against a workspace, and route a first event. Most people are done in ten minutes.',
    questions: [
      {
        id: 'audience',
        kind: 'choice',
        label: 'Who reads this?',
        options: ['Developers integrating', 'Operators configuring', 'End users'],
        required: true,
      },
      {
        id: 'topics',
        kind: 'long',
        label: 'Sections the docs need',
        hint: 'One per line. These become the FAQ entries and feature blocks.',
        placeholder:
          'Installation\nAuthentication\nSending events\nSchemas and validation\nRate limits\nErrors and retries',
        required: true,
      },
      {
        id: 'install',
        kind: 'text',
        label: 'The install or setup command',
        hint: 'Shown verbatim in a code block.',
        placeholder: 'npm i @acme/track',
      },
      {
        id: 'support',
        kind: 'text',
        label: 'Where do people get help?',
        placeholder: 'support@acme.dev, or the #acme channel in our Discord',
      },
    ],
    sections: [
      s('hero', 'Overview', 'What this is, first task'),
      s('features', 'Guides', 'The sections'),
      s('about', 'Concepts', 'The mental model'),
      s('faq', 'Troubleshooting', 'Errors and fixes'),
      s('contact', 'Support', 'Where to ask'),
    ],
    themes: ['terminal', 'minimal', 'nordic'],
  },

  /* ── custom ─────────────────────────────────────────────────────────── */
  custom: {
    kind: 'custom',
    nameQ: 'What is this called?',
    nameHint: 'Anything.',
    descriptionQ: 'Describe what the page needs to do.',
    descriptionHint: 'The more specific, the better the result.',
    descriptionPlaceholder:
      'A page for a community garden: when we meet, what we grow, how to get a plot, and how to donate tools.',
    questions: [
      {
        id: 'audience',
        kind: 'text',
        label: 'Who is it for?',
        placeholder: 'Neighbours within walking distance',
        required: true,
      },
      {
        id: 'must',
        kind: 'long',
        label: 'What must be on the page?',
        hint: 'One thing per line.',
        placeholder:
          'Meeting times\nWhat is growing this season\nHow to request a plot\nTool donation list',
        required: true,
      },
      {
        id: 'tone',
        kind: 'choice',
        label: 'Tone',
        options: ['Plain and factual', 'Warm', 'Dry and funny', 'Formal'],
        required: true,
      },
    ],
    sections: [
      s('hero', 'Hero', 'What this is'),
      s('about', 'About', 'The background'),
      s('features', 'Details', 'The practical information'),
      s('gallery', 'Images', 'Plates', false),
      s('faq', 'Questions', 'Answers'),
      s('contact', 'Contact', 'How to get involved'),
    ],
    themes: ['minimal', 'nordic', 'editorial'],
  },
};

/** The section checklist for a kind, with the user's current ticks. */
export function defaultSections(kind: SiteKind) {
  return KIND_BRIEFS[kind].sections.map((x) => ({ ...x }));
}

/** Total question count, for the progress bar. */
export function questionCount(kind: SiteKind): number {
  return 2 + KIND_BRIEFS[kind].questions.length;
}
