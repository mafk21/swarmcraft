/* ============================================================================
   The field map: every editable value in a SiteSpec, with a label and a kind.

   One table instead of thirteen bespoke editors. Adding a section type means
   adding fourteen lines here and nothing else.
   ========================================================================== */

import type { Section } from '../lib/spec';

export type FieldSpec =
  | { key: string; label: string; kind: 'text' | 'long'; hint?: string }
  | { key: string; label: string; kind: 'image'; hint?: string }
  | { key: string; label: string; kind: 'list'; hint?: string; of: 'text' | 'long' }
  | { key: string; label: string; kind: 'objs'; hint?: string; fields: OField[] }
  | { key: string; label: string; kind: 'groups'; hint?: string; fields: OField[] }
  | { key: string; label: string; kind: 'select'; options: { value: string; label: string }[] };

export type OField = {
  key: string;
  label: string;
  kind: 'text' | 'long' | 'list' | 'image' | 'span';
};

export const SECTION_FIELDS: Record<Section['type'], FieldSpec[]> = {
  hero: [
    { key: 'eyebrow', label: 'Eyebrow', kind: 'text' },
    { key: 'image', label: 'Picture', kind: 'image', hint: 'Optional. Nothing is uploaded.' },
    { key: 'headline', label: 'Headline', kind: 'text' },
    { key: 'sub', label: 'Sub-line', kind: 'long' },
    { key: 'cta', label: 'Button', kind: 'objs', fields: [
      { key: 'label', label: 'Label', kind: 'text' },
      { key: 'href', label: 'Link', kind: 'text' },
    ] },
  ],
  features: [
    { key: 'heading', label: 'Heading', kind: 'text' },
    { key: 'items', label: 'Items', kind: 'objs', hint: '3 to 6', fields: [
      { key: 'title', label: 'Title', kind: 'text' },
      { key: 'body', label: 'Body', kind: 'long' },
    ] },
  ],
  pricing: [
    { key: 'heading', label: 'Heading', kind: 'text' },
    { key: 'tiers', label: 'Tiers', kind: 'objs', hint: '2 to 4', fields: [
      { key: 'name', label: 'Name', kind: 'text' },
      { key: 'price', label: 'Price', kind: 'text' },
      { key: 'period', label: 'Period', kind: 'text' },
      { key: 'features', label: 'Includes', kind: 'list' },
      { key: 'cta', label: 'Button', kind: 'text' },
    ] },
  ],
  products: [
    { key: 'heading', label: 'Heading', kind: 'text' },
    { key: 'items', label: 'Products', kind: 'objs', fields: [
      { key: 'image', label: 'Picture', kind: 'image' },
      { key: 'name', label: 'Name', kind: 'text' },
      { key: 'price', label: 'Price', kind: 'text' },
      { key: 'note', label: 'Note', kind: 'text' },
    ] },
  ],
  testimonials: [
    { key: 'heading', label: 'Heading', kind: 'text' },
    { key: 'items', label: 'Quotes', kind: 'objs', hint: 'Only real ones', fields: [
      { key: 'quote', label: 'Quote', kind: 'long' },
      { key: 'author', label: 'Name', kind: 'text' },
      { key: 'role', label: 'Role', kind: 'text' },
    ] },
  ],
  faq: [
    { key: 'heading', label: 'Heading', kind: 'text' },
    { key: 'items', label: 'Questions', kind: 'objs', fields: [
      { key: 'q', label: 'Question', kind: 'text' },
      { key: 'a', label: 'Answer', kind: 'long' },
    ] },
  ],
  about: [
    { key: 'heading', label: 'Heading', kind: 'text' },
    { key: 'image', label: 'Portrait', kind: 'image' },
    { key: 'body', label: 'Paragraphs', kind: 'list', of: 'long' },
  ],
  menu: [
    { key: 'heading', label: 'Heading', kind: 'text' },
    { key: 'groups', label: 'Groups', kind: 'groups', fields: [
      { key: 'name', label: 'Group name', kind: 'text' },
      { key: 'items', label: 'Dishes', kind: 'list' },
    ] },
  ],
  gallery: [
    { key: 'heading', label: 'Heading', kind: 'text' },
    {
      key: 'layout',
      label: 'Composition',
      kind: 'select',
      options: [
        { value: 'grid', label: 'Grid — equal weight' },
        { value: 'feature', label: 'Feature — one large' },
        { value: 'strip', label: 'Strip — a run of pictures' },
        { value: 'masonry', label: 'Masonry — varied heights' },
      ],
    },
    { key: 'items', label: 'Pieces', kind: 'objs', fields: [
      { key: 'image', label: 'Picture', kind: 'image' },
      { key: 'title', label: 'Title', kind: 'text' },
      { key: 'caption', label: 'Caption', kind: 'text' },
      { key: 'span', label: 'Size', kind: 'span' },
    ] },
  ],
  stats: [
    { key: 'items', label: 'Figures', kind: 'objs', hint: 'Real numbers only', fields: [
      { key: 'value', label: 'Value', kind: 'text' },
      { key: 'label', label: 'Label', kind: 'text' },
    ] },
  ],
  cta: [
    { key: 'heading', label: 'Heading', kind: 'text' },
    { key: 'sub', label: 'Sub-line', kind: 'long' },
    { key: 'action', label: 'Button', kind: 'objs', fields: [
      { key: 'label', label: 'Label', kind: 'text' },
      { key: 'href', label: 'Link', kind: 'text' },
    ] },
  ],
  contact: [
    { key: 'heading', label: 'Heading', kind: 'text' },
    { key: 'email', label: 'Email', kind: 'text' },
    { key: 'phone', label: 'Phone', kind: 'text' },
    { key: 'address', label: 'Address', kind: 'text' },
  ],
  schedule: [
    { key: 'heading', label: 'Heading', kind: 'text' },
    { key: 'days', label: 'Days', kind: 'groups', fields: [
      { key: 'day', label: 'Day', kind: 'text' },
      { key: 'items', label: 'Sessions', kind: 'list' },
    ] },
  ],
};

/** A short preview of what a section currently says, for the collapsed card. */
export function sectionSummary(s: Section): string {
  switch (s.type) {
    case 'hero':
      return s.headline;
    case 'features':
    case 'products':
    case 'testimonials':
    case 'faq':
    case 'gallery':
    case 'stats':
      return `${s.items.length} item${s.items.length === 1 ? '' : 's'}`;
    case 'pricing':
      return `${s.tiers.length} tiers`;
    case 'about':
      return `${s.body.length} paragraph${s.body.length === 1 ? '' : 's'}`;
    case 'menu':
      return `${s.groups.length} groups`;
    case 'schedule':
      return `${s.days.length} days`;
    case 'cta':
      return s.heading;
    case 'contact':
      return s.email ?? 'no email';
  }
}
