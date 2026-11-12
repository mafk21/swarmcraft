/* ============================================================================
   Eight themes. Hand-written. Never generated.

   Each theme is a token file: type pairing, scale, measure, spacing rhythm,
   radius, border weight, and ONE accent. Because these are authored, the
   generated site can look intentional even when the copy is plain.
   ========================================================================== */

import type { ThemeId, AccentId } from './spec';

export type Theme = {
  id: ThemeId;
  label: string;
  character: string;
  /** CSS custom properties applied to the rendered site */
  vars: Record<string, string>;
};

const BASE_FONTS =
  `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`;
const SERIF = `Georgia, 'Times New Roman', Times, serif`;
const MONO = `ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace`;

export const ACCENT_HEX: Record<AccentId, string> = {
  slate: '#3c4655',
  oxblood: '#7d2b2b',
  forest: '#2c5340',
  ink: '#1b2333',
  sand: '#7a6234',
  clay: '#8a4b32',
};

export const THEMES: Record<ThemeId, Theme> = {
  editorial: {
    id: 'editorial',
    label: 'Editorial',
    character: 'Serif display, generous measure, hairline rules',
    vars: {
      '--font-display': SERIF,
      '--font-body': BASE_FONTS,
      '--f-display': '600',
      '--lh-display': '1.08',
      '--ls-display': '-0.02em',
      '--measure': '62ch',
      '--scale': '1.333',
      '--radius': '0px',
      '--border-w': '1px',
      '--space': '8px',
      '--section-pad': '96px',
      '--surface': '#fbfaf7',
      '--surface-alt': '#f2efe8',
      '--ink': '#17161a',
      '--ink-2': '#4a4741',
      '--rule': '#d8d3c8',
    },
  },

  studio: {
    id: 'studio',
    label: 'Studio',
    character: 'Tight grotesque, high contrast, oversized type',
    vars: {
      '--font-display': BASE_FONTS,
      '--font-body': BASE_FONTS,
      '--f-display': '800',
      '--lh-display': '0.94',
      '--ls-display': '-0.045em',
      '--measure': '54ch',
      '--scale': '1.5',
      '--radius': '2px',
      '--border-w': '1px',
      '--space': '8px',
      '--section-pad': '112px',
      '--surface': '#ffffff',
      '--surface-alt': '#f4f4f4',
      '--ink': '#0a0a0a',
      '--ink-2': '#525252',
      '--rule': '#dcdcdc',
    },
  },

  retail: {
    id: 'retail',
    label: 'Retail',
    character: 'Brisk, dense grid, product-first',
    vars: {
      '--font-display': BASE_FONTS,
      '--font-body': BASE_FONTS,
      '--f-display': '700',
      '--lh-display': '1.12',
      '--ls-display': '-0.02em',
      '--measure': '56ch',
      '--scale': '1.25',
      '--radius': '6px',
      '--border-w': '1px',
      '--space': '8px',
      '--section-pad': '80px',
      '--surface': '#ffffff',
      '--surface-alt': '#f7f7f8',
      '--ink': '#141519',
      '--ink-2': '#5b5f68',
      '--rule': '#e3e4e8',
    },
  },

  nordic: {
    id: 'nordic',
    label: 'Nordic',
    character: 'Light, airy, muted, lots of space',
    vars: {
      '--font-display': BASE_FONTS,
      '--font-body': BASE_FONTS,
      '--f-display': '500',
      '--lh-display': '1.2',
      '--ls-display': '-0.012em',
      '--measure': '58ch',
      '--scale': '1.25',
      '--radius': '4px',
      '--border-w': '1px',
      '--space': '10px',
      '--section-pad': '120px',
      '--surface': '#fcfcfd',
      '--surface-alt': '#f3f5f7',
      '--ink': '#1d2228',
      '--ink-2': '#697180',
      '--rule': '#e1e5ea',
    },
  },

  brutalist: {
    id: 'brutalist',
    label: 'Brutalist',
    character: 'Monospace, hard borders, no radius',
    vars: {
      '--font-display': MONO,
      '--font-body': MONO,
      '--f-display': '700',
      '--lh-display': '1.06',
      '--ls-display': '-0.03em',
      '--measure': '68ch',
      '--scale': '1.414',
      '--radius': '0px',
      '--border-w': '2px',
      '--space': '8px',
      '--section-pad': '88px',
      '--surface': '#f5f4f0',
      '--surface-alt': '#e9e7e0',
      '--ink': '#0d0d0d',
      '--ink-2': '#3d3c38',
      '--rule': '#0d0d0d',
    },
  },

  warm: {
    id: 'warm',
    label: 'Warm',
    character: 'Soft, rounded, human',
    vars: {
      '--font-display': SERIF,
      '--font-body': BASE_FONTS,
      '--f-display': '600',
      '--lh-display': '1.15',
      '--ls-display': '-0.01em',
      '--measure': '60ch',
      '--scale': '1.3',
      '--radius': '14px',
      '--border-w': '1px',
      '--space': '8px',
      '--section-pad': '104px',
      '--surface': '#fdf9f3',
      '--surface-alt': '#f6eee1',
      '--ink': '#241c14',
      '--ink-2': '#6b5a48',
      '--rule': '#e6d8c4',
    },
  },

  terminal: {
    id: 'terminal',
    label: 'Terminal',
    character: 'Mono throughout, dark, technical',
    vars: {
      '--font-display': MONO,
      '--font-body': MONO,
      '--f-display': '600',
      '--lh-display': '1.15',
      '--ls-display': '-0.01em',
      '--measure': '76ch',
      '--scale': '1.25',
      '--radius': '3px',
      '--border-w': '1px',
      '--space': '8px',
      '--section-pad': '80px',
      '--surface': '#0e1113',
      '--surface-alt': '#151a1d',
      '--ink': '#dfe6e9',
      '--ink-2': '#8b989e',
      '--rule': '#263035',
    },
  },

  minimal: {
    id: 'minimal',
    label: 'Minimal',
    character: 'Everything stripped back to hierarchy',
    vars: {
      '--font-display': BASE_FONTS,
      '--font-body': BASE_FONTS,
      '--f-display': '600',
      '--lh-display': '1.18',
      '--ls-display': '-0.018em',
      '--measure': '56ch',
      '--scale': '1.2',
      '--radius': '2px',
      '--border-w': '1px',
      '--space': '8px',
      '--section-pad': '128px',
      '--surface': '#ffffff',
      '--surface-alt': '#fafafa',
      '--ink': '#111111',
      '--ink-2': '#666666',
      '--rule': '#e8e8e8',
    },
  },
};

export const THEME_LIST = Object.values(THEMES);

/** Which themes suit which kind — used when Gemini picks, and for UI hints. */
export const THEME_AFFINITY: Record<string, ThemeId[]> = {
  store: ['retail', 'warm', 'minimal'],
  landing: ['minimal', 'studio', 'nordic'],
  portfolio: ['studio', 'brutalist', 'editorial'],
  blog: ['editorial', 'nordic', 'minimal'],
  restaurant: ['warm', 'editorial', 'retail'],
  saas: ['nordic', 'studio', 'terminal'],
  agency: ['studio', 'editorial', 'brutalist'],
  event: ['brutalist', 'studio', 'retail'],
  docs: ['terminal', 'minimal', 'nordic'],
  custom: ['minimal', 'nordic', 'editorial'],
};

/** The CSS string we inject into the preview iframe. */
export function themeCss(theme: Theme, accent: AccentId): string {
  const accentHex = ACCENT_HEX[accent] ?? ACCENT_HEX.slate;
  const vars = Object.entries(theme.vars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');
  return `:root {\n  --accent: ${accentHex};\n${vars}\n}`;
}
