/* ============================================================================
   Empty-but-valid sections, so a section can be added from the inspector
   without going back through the funnel. Each one satisfies the schema.
   ========================================================================== */

import type { SectionType, Section } from './spec';

export function newSection(type: SectionType): Section {
  switch (type) {
    case 'hero':
      return {
        type: 'hero',
        headline: 'A headline that says what this is',
        sub: 'One sentence that says who it is for and what they get.',
      };
    case 'features':
      return {
        type: 'features',
        heading: 'What you get',
        items: [
          { title: 'First thing', body: 'A sentence explaining the first thing.' },
          { title: 'Second thing', body: 'A sentence explaining the second thing.' },
          { title: 'Third thing', body: 'A sentence explaining the third thing.' },
        ],
      };
    case 'pricing':
      return {
        type: 'pricing',
        heading: 'Pricing',
        tiers: [
          { name: 'Basic', price: 'SAR 0', features: ['What is included', 'And this'], cta: 'Choose' },
          {
            name: 'Standard',
            price: 'SAR 0',
            features: ['Everything in Basic', 'Plus this'],
            cta: 'Choose',
            featured: true,
          },
        ],
      };
    case 'products':
      return {
        type: 'products',
        heading: 'Products',
        items: [
          { name: 'First product', price: 'SAR 0' },
          { name: 'Second product', price: 'SAR 0' },
          { name: 'Third product', price: 'SAR 0' },
        ],
      };
    case 'testimonials':
      return {
        type: 'testimonials',
        heading: 'What people said',
        items: [
          { quote: 'A real quote from a real person.', author: 'Name', role: 'Role' },
          { quote: 'A second real quote.', author: 'Name', role: 'Role' },
        ],
      };
    case 'faq':
      return {
        type: 'faq',
        heading: 'Questions',
        items: [
          { q: 'A question someone actually asks?', a: 'The straight answer.' },
          { q: 'Another question?', a: 'Another answer.' },
          { q: 'A third?', a: 'A third answer.' },
        ],
      };
    case 'about':
      return {
        type: 'about',
        heading: 'About',
        body: ['A paragraph about who is behind this and how it works.'],
      };
    case 'menu':
      return {
        type: 'menu',
        heading: 'Menu',
        groups: [
          {
            name: 'Group',
            items: [
              { name: 'Dish', price: '0' },
              { name: 'Another dish', price: '0' },
            ],
          },
        ],
      };
    case 'gallery':
      return {
        type: 'gallery',
        heading: 'Work',
        items: [
          { title: 'First piece' },
          { title: 'Second piece' },
          { title: 'Third piece' },
        ],
      };
    case 'stats':
      return {
        type: 'stats',
        items: [
          { value: '0', label: 'Something measured' },
          { value: '0', label: 'Something else' },
          { value: '0', label: 'And this' },
        ],
      };
    case 'cta':
      return {
        type: 'cta',
        heading: 'One last thing',
        action: { label: 'Do the thing', href: '#' },
      };
    case 'contact':
      return {
        type: 'contact',
        heading: 'Contact',
        email: 'you@example.com',
        form: true,
      };
    case 'schedule':
      return {
        type: 'schedule',
        heading: 'Schedule',
        days: [
          {
            day: 'Day one',
            items: [
              { time: '10:00', title: 'First session' },
              { time: '12:00', title: 'Second session' },
            ],
          },
        ],
      };
  }
}
