/* ============================================================================
   A hand-written SiteSpec used by the demo build.

   Written by a person, deliberately plain, so the demo shows what the engine
   does rather than what a model writes.
   ========================================================================== */

import type { SiteSpec } from './spec';

export const DEMO_SPEC: SiteSpec = {
  meta: {
    title: 'Kiln & Table',
    description:
      'Hand-thrown stoneware for home cooks. Made in a small workshop in Dammam, fired in a gas kiln.',
    theme: 'warm',
    accent: 'clay',
    themeReason: 'Warm serif and rounded corners suit a workshop selling things made by hand.',
  },
  nav: {
    brand: 'Kiln & Table',
    links: [
      { label: 'Shop', href: '#products' },
      { label: 'Making', href: '#about' },
      { label: 'Questions', href: '#faq' },
      { label: 'Contact', href: '#contact' },
    ],
  },
  sections: [
    {
      type: 'hero',
      eyebrow: 'Dammam, since 2019',
      headline: 'Pots that get used',
      sub: 'Stoneware for people who cook every day. No gift sets, no display pieces, nothing that needs its own shelf.',
      cta: { label: 'See what is in the kiln', href: '#products' },
    },
    {
      type: 'products',
      heading: 'In the kiln this week',
      items: [
        { name: 'Everyday bowl', price: 'SAR 85', note: '900g, 18cm across. The one we make most of.' },
        { name: 'Flat plate', price: 'SAR 110', note: '26cm. Fits a whole sea bass.' },
        { name: 'Pourer', price: 'SAR 140', note: 'For milk, or gravy, or stock.' },
        { name: 'Casserole, small', price: 'SAR 320', note: 'Oven to table. Two servings.' },
        { name: 'Beaker', price: 'SAR 60', note: 'No handle, because handles break.' },
        { name: 'Serving platter', price: 'SAR 260', note: 'Made to order in six weeks.' },
      ],
    },
    {
      type: 'about',
      heading: 'One wheel, one kiln',
      body: [
        'The workshop is a converted garage on the Dammam coast road. Two people work in it: one throws, one glazes.',
        'Everything is fired to 1280°C in a gas kiln that takes a full day to come up to temperature and another to cool. That wait is the reason the shop sells out.',
        'Nothing is dishwasher-proof in the sense the box claims. It survives, but the glaze dulls after a few hundred cycles. We would rather say so.',
      ],
    },
    {
      type: 'features',
      heading: 'What you are buying',
      items: [
        {
          title: 'Fired hot, not fast',
          body: 'Stoneware vitrifies at temperature. It does not stain, and it does not chip when it meets a sink.',
        },
        {
          title: 'Each one is a little different',
          body: 'Glaze pools where it pools. Two bowls from the same batch will not match exactly.',
        },
        {
          title: 'Repaired, not replaced',
          body: 'Chips can be ground smooth, cracks can be filled. Send it back and we will do it.',
        },
      ],
    },
    {
      type: 'faq',
      heading: 'Questions we get',
      items: [
        {
          q: 'When does the shop restock?',
          a: 'Kilns are unloaded on Thursdays. The list goes out the same evening to people on the mailing list, and most of it is gone by Saturday.',
        },
        {
          q: 'Can I put it in the dishwasher?',
          a: 'It will survive, but the surface dulls over a few years. Hand washing keeps the glaze bright.',
        },
        {
          q: 'Do you ship outside the Gulf?',
          a: 'Not yet. The packing is heavy and the couriers are unreliable. Within Saudi Arabia it is two to three days.',
        },
        {
          q: 'Can you make a set to match?',
          a: 'Yes, for orders over twelve pieces. Expect six to eight weeks, because it goes through two firings.',
        },
      ],
    },
    {
      type: 'contact',
      heading: 'Come by, or write',
      email: 'workshop@kilnandtable.sa',
      phone: '+966 13 800 0000',
      address: 'Coast Road, Dammam, Eastern Province',
      form: true,
    },
  ],
  footer: {
    note: 'Kiln & Table. Made by two people in a garage in Dammam.',
  },
  voice: {
    register: 'Plain, dry, specific. No sales language.',
    facts: [
      'Fired to 1280°C',
      'Kilns unloaded on Thursdays',
      'Two people in the workshop',
      'Ships in two to three days within Saudi Arabia',
    ],
  },
};
