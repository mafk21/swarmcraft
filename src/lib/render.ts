/* ============================================================================
   render(spec) → a complete, valid HTML document.

   This is real output. Not a wireframe, not a mock. It is the page the user
   gets. The swarm engine later takes this exact DOM apart into a Blueprint
   and rebuilds it with cursors.
   ========================================================================== */

import type { Section, SiteSpec } from './spec';
import { resolveHref } from './spec';

/* ── images ──────────────────────────────────────────────────────────────── */

/**
 * Only two kinds of src are allowed: a file the user put in this project, or a
 * page in this site. Anything else renders as an empty plate — a model cannot
 * make the exported page call out to a remote host.
 */
function imageAttrs(src: string | undefined): string | null {
  if (!src) return null;
  if (src.startsWith('media:') || src.startsWith('pages/')) return src;
  return null;
}

/** A plate: either the real image, or a drawn placeholder. Both hold the box. */
function plate(
  src: string | undefined,
  alt: string | undefined,
  cls: string,
  label?: string
): string {
  const ok = imageAttrs(src);
  if (ok) {
    return `<div class="${cls} has-img"><img src="${esc(ok)}" alt="${esc(
      alt ?? ''
    )}" loading="lazy" decoding="async" /></div>`;
  }
  return `<div class="${cls}" aria-hidden="true">${
    label ? `<span>${esc(label)}</span>` : ''
  }</div>`;
}
import { THEMES, themeCss } from './themes';

/** Set by renderDocument for the duration of a render. Section renderers read
    it to resolve `page:` links, which only make sense in context. */
let CTX: { index: number; exportMode: boolean; section: number; slugs?: string[] } = {
  index: 0,
  exportMode: false,
  section: -1,
};
const link = (h: string): string =>
  esc(resolveHref(h, CTX.index, CTX.exportMode, CTX.slugs));

const esc = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** A phone number written the way people write it ("013 812 4400",
    "+966 13 812 4400") into the digits a `tel:` link needs. The visible text
    keeps the original spacing; only the href is normalised. */
const telHref = (s: string): string => {
  const plus = s.trim().startsWith('+');
  const digits = s.replace(/[^0-9]/g, '');
  return plus ? `+${digits}` : digits;
};

/* ── section renderers ───────────────────────────────────────────────────── */

type R = (s: Section) => string;

const hero: R = (s) => {
  if (s.type !== 'hero') return '';
  const hasImage = !!imageAttrs(s.image?.src);
  return `<header class="sec hero${hasImage ? ' hero-split' : ''}" data-sec="${CTX.section}">
  <div class="wrap">
    <div class="hero-copy">
      ${s.eyebrow ? `<p class="eyebrow">${esc(s.eyebrow)}</p>` : ''}
      <h1>${esc(s.headline)}</h1>
      <p class="lede">${esc(s.sub)}</p>
      ${s.cta ? `<a class="cta" href="${link(s.cta.href)}">${esc(s.cta.label)}</a>` : ''}
    </div>
    ${hasImage ? `<div class="hero-art">${plate(s.image?.src, s.image?.alt, 'art')}</div>` : ''}
  </div>
</header>`;
};

const features: R = (s) => {
  if (s.type !== 'features') return '';
  return `<section class="sec" id="features" data-sec="${CTX.section}">
  <div class="wrap">
    <h2>${esc(s.heading)}</h2>
    <ul class="grid-3">
      ${s.items
        .map(
          (i) => `<li class="card">
        <h3>${esc(i.title)}</h3>
        <p>${esc(i.body)}</p>
      </li>`
        )
        .join('\n      ')}
    </ul>
  </div>
</section>`;
};

const pricing: R = (s) => {
  if (s.type !== 'pricing') return '';
  return `<section class="sec alt" id="pricing" data-sec="${CTX.section}">
  <div class="wrap">
    <h2>${esc(s.heading)}</h2>
    <ul class="grid-${Math.min(s.tiers.length, 4)}">
      ${s.tiers
        .map(
          (t) => `<li class="tier${t.featured ? ' featured' : ''}">
        <h3>${esc(t.name)}</h3>
        <p class="price">${esc(t.price)}${
            t.period ? `<span class="period">${esc(t.period)}</span>` : ''
          }</p>
        <ul class="ticks">
          ${t.features.map((f) => `<li>${esc(f)}</li>`).join('\n          ')}
        </ul>
        <a class="cta ghost" href="#">${esc(t.cta)}</a>
      </li>`
        )
        .join('\n      ')}
    </ul>
  </div>
</section>`;
};

const products: R = (s) => {
  if (s.type !== 'products') return '';
  return `<section class="sec" id="products" data-sec="${CTX.section}">
  <div class="wrap">
    <h2>${esc(s.heading)}</h2>
    <ul class="grid-3 shop">
      ${s.items
        .map(
          (i) => `<li class="product">
        ${plate(i.image?.src, i.image?.alt, 'swatch')}
        <div class="product-row">
          <h3>${esc(i.name)}</h3>
          <span class="tag">${esc(i.price)}</span>
        </div>
        ${i.note ? `<p>${esc(i.note)}</p>` : ''}
      </li>`
        )
        .join('\n      ')}
    </ul>
  </div>
</section>`;
};

const testimonials: R = (s) => {
  if (s.type !== 'testimonials') return '';
  return `<section class="sec alt" id="testimonials" data-sec="${CTX.section}">
  <div class="wrap">
    <h2>${esc(s.heading)}</h2>
    <div class="grid-2">
      ${s.items
        .map(
          (i) => `<blockquote>
        <p>${esc(i.quote)}</p>
        <footer>${esc(i.author)}${
            i.role ? `<span class="role">, ${esc(i.role)}</span>` : ''
          }</footer>
      </blockquote>`
        )
        .join('\n      ')}
    </div>
  </div>
</section>`;
};

const faq: R = (s) => {
  if (s.type !== 'faq') return '';
  return `<section class="sec" id="faq" data-sec="${CTX.section}">
  <div class="wrap narrow">
    <h2>${esc(s.heading)}</h2>
    <dl class="faq">
      ${s.items
        .map(
          (i) => `<dt>${esc(i.q)}</dt>
      <dd>${esc(i.a)}</dd>`
        )
        .join('\n      ')}
    </dl>
  </div>
</section>`;
};

const about: R = (s) => {
  if (s.type !== 'about') return '';
  const hasImage = !!imageAttrs(s.image?.src);
  return `<section class="sec${hasImage ? ' about-split' : ''}" id="about" data-sec="${CTX.section}">
  <div class="wrap${hasImage ? '' : ' narrow'}">
    <div class="about-copy">
      <h2>${esc(s.heading)}</h2>
      ${s.body.map((p) => `<p class="prose">${esc(p)}</p>`).join('\n      ')}
    </div>
    ${hasImage ? `<div class="about-art">${plate(s.image?.src, s.image?.alt, 'portrait')}</div>` : ''}
  </div>
</section>`;
};

const menu: R = (s) => {
  if (s.type !== 'menu') return '';
  return `<section class="sec alt" id="menu" data-sec="${CTX.section}">
  <div class="wrap">
    <h2>${esc(s.heading)}</h2>
    <div class="menu-groups">
      ${s.groups
        .map(
          (g) => `<div class="menu-group">
        <h3>${esc(g.name)}</h3>
        <ul class="menu-list">
          ${g.items
            .map(
              (i) => `<li>${plate(i.image?.src, i.image?.alt, 'dish-img')}<span class="dish">${esc(
                i.name
              )}${i.note ? `<em class="note">${esc(i.note)}</em>` : ''}</span>
            <span class="dots" aria-hidden="true"></span>
            <span class="cost">${esc(i.price)}</span>
          </li>`
            )
            .join('\n          ')}
        </ul>
      </div>`
        )
        .join('\n      ')}
    </div>
  </div>
</section>`;
};

const gallery: R = (s) => {
  if (s.type !== 'gallery') return '';
  const layout = s.layout ?? 'grid';

  const items = s.items.map((i, n) => {
    const span = i.span ? ` span-${i.span}` : '';
    const first = n === 0 ? ' is-first' : '';
    return `<li class="frame${span}${first}">
      ${plate(i.image?.src, i.image?.alt, 'plate', i.title)}
      <div class="frame-cap">
        <h3>${esc(i.title)}</h3>
        ${i.caption ? `<p>${esc(i.caption)}</p>` : ''}
      </div>
    </li>`;
  });

  /* Each layout is a different idea about what a gallery is for:
       grid     — equal weight, catalogue
       feature  — one large piece, the rest supporting
       strip    — a horizontal run, scrollable on narrow screens
       masonry  — varied heights, rhythm                                  */
  if (layout === 'feature') {
    const [first, ...rest] = items;
    return `<section class="sec" id="gallery" data-sec="${CTX.section}">
  <div class="wrap">
    ${s.heading ? `<h2>${esc(s.heading)}</h2>` : ''}
    <div class="gal-feature">
      <ul class="gal-hero">${first}</ul>
      <ul class="gal-rest">${rest.join('\n')}</ul>
    </div>
  </div>
</section>`;
  }

  if (layout === 'strip') {
    return `<section class="sec" id="gallery" data-sec="${CTX.section}">
  <div class="wrap">
    ${s.heading ? `<h2>${esc(s.heading)}</h2>` : ''}
  </div>
  <ul class="gal-strip">${items.join('\n')}</ul>
</section>`;
  }

  return `<section class="sec" id="gallery" data-sec="${CTX.section}">
  <div class="wrap">
    ${s.heading ? `<h2>${esc(s.heading)}</h2>` : ''}
    <ul class="gal-${layout === 'masonry' ? 'masonry' : 'grid'}">${items.join('\n')}</ul>
  </div>
</section>`;
};

const stats: R = (s) => {
  if (s.type !== 'stats') return '';
  return `<section class="sec strip" data-sec="${CTX.section}">
  <div class="wrap">
    <ul class="stats">
      ${s.items
        .map(
          (i) => `<li>
        <span class="value">${esc(i.value)}</span>
        <span class="label">${esc(i.label)}</span>
      </li>`
        )
        .join('\n      ')}
    </ul>
  </div>
</section>`;
};

const cta: R = (s) => {
  if (s.type !== 'cta') return '';
  return `<section class="sec" data-sec="${CTX.section}">
  <div class="wrap narrow center">
    <h2>${esc(s.heading)}</h2>
    ${s.sub ? `<p class="lede">${esc(s.sub)}</p>` : ''}
    <a class="cta" href="${link(s.action.href)}">${esc(s.action.label)}</a>
  </div>
</section>`;
};

const contact: R = (s) => {
  if (s.type !== 'contact') return '';
  const rows = [
    s.email ? `<li><span class="k">Email</span><a href="mailto:${esc(s.email)}">${esc(s.email)}</a></li>` : '',
    s.phone
      ? `<li><span class="k">Phone</span><a href="tel:${esc(telHref(s.phone))}">${esc(s.phone)}</a></li>`
      : '',
    s.address ? `<li><span class="k">Address</span><span>${esc(s.address)}</span></li>` : '',
  ]
    .filter(Boolean)
    .join('\n      ');

  return `<section class="sec alt" id="contact">
  <div class="wrap">
    <h2>${esc(s.heading)}</h2>
    <div class="contact-grid">
      <ul class="contact-list">
      ${rows}
      </ul>
      ${
        s.form
          ? `<form class="contact-form" action="${
              s.email ? esc(`mailto:${s.email}`) : ''
            }" method="post" enctype="text/plain" data-mailto="${
              s.email ? esc(`mailto:${s.email}`) : ''
            }"${s.email ? '' : ' hidden'}>
        <label>Name<input type="text" name="name" required autocomplete="name" /></label>
        <label>Email<input type="email" name="email" required autocomplete="email" /></label>
        <label>Message<textarea name="message" rows="4" required></textarea></label>
        <button type="submit" class="cta">Send message</button>
        <p class="form-note" role="status" aria-live="polite"></p>
      </form>`
          : ''
      }
    </div>
  </div>
</section>`;
};

const schedule: R = (s) => {
  if (s.type !== 'schedule') return '';
  return `<section class="sec" id="schedule" data-sec="${CTX.section}">
  <div class="wrap">
    <h2>${esc(s.heading)}</h2>
    <div class="days">
      ${s.days
        .map(
          (d) => `<div class="day">
        <h3>${esc(d.day)}</h3>
        <ul class="slots">
          ${d.items
            .map(
              (i) => `<li><span class="time">${esc(i.time)}</span><span class="what">${esc(
                i.title
              )}</span></li>`
            )
            .join('\n          ')}
        </ul>
      </div>`
        )
        .join('\n      ')}
    </div>
  </div>
</section>`;
};

const RENDERERS: Record<Section['type'], R> = {
  hero,
  features,
  pricing,
  products,
  testimonials,
  faq,
  about,
  menu,
  gallery,
  stats,
  cta,
  contact,
  schedule,
};

/* ── the site stylesheet ─────────────────────────────────────────────────── */

const SITE_CSS = `
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;scrollbar-gutter:stable}
body{
  margin:0;background:var(--surface);color:var(--ink);
  font-family:var(--font-body);font-size:17px;line-height:1.6;
  -webkit-font-smoothing:antialiased;
}
h1,h2,h3{font-family:var(--font-display);font-weight:var(--f-display);
  line-height:var(--lh-display);letter-spacing:var(--ls-display);text-wrap:balance;margin:0}
h1{font-size:calc(2.6rem * var(--scale) / 1.333)}
h2{font-size:calc(1.5rem * var(--scale) / 1.333);margin-bottom:calc(var(--space)*3)}
h3{font-size:1.0625rem;line-height:1.3}
p{margin:0 0 calc(var(--space)*2)}
a{color:inherit}
ul,ol{margin:0;padding:0;list-style:none}
.wrap{max-width:1080px;margin:0 auto;padding:0 32px}
.wrap.narrow{max-width:720px}
.sec{padding:var(--section-pad) 0;border-top:1px solid var(--rule)}
.hero{border-top:0;padding-top:calc(var(--section-pad)*1.15);padding-bottom:calc(var(--section-pad)*1.15)}
.alt{background:var(--surface-alt)}
.strip{padding:calc(var(--section-pad)*0.45) 0}
.center{text-align:center}

/* nav */
.nav{position:sticky;top:0;z-index:10;background:color-mix(in srgb,var(--surface) 92%,transparent);
  border-bottom:1px solid var(--rule);backdrop-filter:blur(8px)}
.nav .wrap{display:flex;align-items:center;justify-content:space-between;height:64px;gap:24px}
.brand{font-family:var(--font-display);font-weight:var(--f-display);font-size:1.0625rem;
  letter-spacing:var(--ls-display);text-decoration:none}
.nav ul{display:flex;gap:22px;flex-wrap:wrap}
.nav a{font-size:0.875rem;text-decoration:none;color:var(--ink-2)}
.nav a:hover{color:var(--ink)}

/* type */
.eyebrow{font-size:0.75rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--ink-2);
  margin-bottom:calc(var(--space)*2)}
.lede{font-size:1.125rem;color:var(--ink-2);max-width:var(--measure);margin-top:calc(var(--space)*3)}
.prose{max-width:var(--measure);color:var(--ink-2);font-size:1.0625rem}

/* cta */
.cta{display:inline-block;margin-top:calc(var(--space)*3);padding:12px 22px;
  background:var(--accent);color:#fff;text-decoration:none;font-size:0.9375rem;
  font-weight:600;border-radius:var(--radius);border:var(--border-w) solid var(--accent)}
.cta:hover{filter:brightness(1.12)}
.cta.ghost{background:transparent;color:var(--accent);margin-top:auto}

/* grids */
.grid-3{display:grid;gap:1px;background:var(--rule);
  grid-template-columns:repeat(auto-fit,minmax(240px,1fr));border:1px solid var(--rule)}
.grid-2{display:grid;gap:calc(var(--space)*3);grid-template-columns:repeat(auto-fit,minmax(280px,1fr))}
.grid-4{display:grid;gap:calc(var(--space)*2);grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}
.card{background:var(--surface);padding:28px 24px}
.card p{color:var(--ink-2);font-size:0.9375rem;margin:10px 0 0}

/* pricing */
.tier{background:var(--surface);border:1px solid var(--rule);border-radius:var(--radius);
  padding:28px 24px;display:flex;flex-direction:column;gap:16px}
.tier.featured{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)}
.price{font-family:var(--font-display);font-size:2rem;font-weight:var(--f-display);
  letter-spacing:var(--ls-display);margin:0}
.period{font-size:0.875rem;color:var(--ink-2);font-weight:400;margin-left:4px}
.ticks{display:flex;flex-direction:column;gap:7px;font-size:0.9375rem;color:var(--ink-2);flex:1}
.ticks li{display:flex;gap:9px}
.ticks li::before{content:"—";color:var(--accent)}

/* products */
.product{background:var(--surface);padding:20px}
.swatch{aspect-ratio:4/3;background:var(--surface-alt);
  border:1px solid var(--rule);border-radius:var(--radius);margin-bottom:14px}
.product-row{display:flex;justify-content:space-between;align-items:baseline;gap:12px}
.tag{font-family:var(--font-display);font-size:0.9375rem;font-weight:var(--f-display)}
.product p{font-size:0.875rem;color:var(--ink-2);margin:6px 0 0}

/* quotes */
blockquote{margin:0;padding:26px 24px;background:var(--surface);border:1px solid var(--rule);
  border-radius:var(--radius)}
blockquote p{font-family:var(--font-display);font-size:1.0625rem;line-height:1.45;margin:0 0 14px}
blockquote footer{font-size:0.8125rem;color:var(--ink-2);letter-spacing:0.02em}
.role{color:var(--ink-2)}

/* faq */
.faq{margin:0}
.faq dt{font-weight:600;padding:18px 0 6px;border-top:1px solid var(--rule)}
.faq dd{margin:0 0 18px;color:var(--ink-2);max-width:var(--measure)}

/* menu */
.menu-groups{display:grid;gap:calc(var(--space)*5);grid-template-columns:repeat(auto-fit,minmax(300px,1fr))}
.menu-group h3{font-size:0.75rem;letter-spacing:0.12em;text-transform:uppercase;
  color:var(--ink-2);padding-bottom:10px;border-bottom:1px solid var(--rule);margin-bottom:14px}
.menu-list li{display:flex;align-items:baseline;gap:8px;padding:7px 0;font-size:0.9375rem}
.dish{display:flex;flex-direction:column}
.note{font-style:normal;font-size:0.8125rem;color:var(--ink-2)}
.dots{flex:1;border-bottom:1px dotted var(--rule);transform:translateY(-3px)}
.cost{font-variant-numeric:tabular-nums}

/* images */
.has-img{overflow:hidden;position:relative}
.has-img img{width:100%;height:100%;object-fit:cover;display:block}
.art{aspect-ratio:4/3;background:var(--surface-alt);border:1px solid var(--rule);
  border-radius:var(--radius);overflow:hidden}
.portrait{aspect-ratio:3/4;background:var(--surface-alt);border:1px solid var(--rule);
  border-radius:var(--radius);overflow:hidden}
.plate{aspect-ratio:1;background:var(--surface-alt);border:1px solid var(--rule);
  border-radius:var(--radius);overflow:hidden;display:flex;align-items:flex-end}
.plate span{padding:10px 12px;font-size:0.75rem;letter-spacing:0.08em;
  text-transform:uppercase;color:var(--ink-2)}
.dish-img{width:44px;height:44px;flex:none;border-radius:calc(var(--radius) + 2px);
  overflow:hidden;background:var(--surface-alt);border:1px solid var(--rule)}
.dish-img img{width:100%;height:100%;object-fit:cover;display:block}

/* hero with a picture */
.hero-split .wrap{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,0.9fr);
  gap:calc(var(--space)*6);align-items:center}
@media (max-width:760px){.hero-split .wrap{grid-template-columns:1fr}}

/* about with a portrait */
.about-split .wrap{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,0.6fr);
  gap:calc(var(--space)*6);align-items:start}
@media (max-width:760px){.about-split .wrap{grid-template-columns:1fr}}

/* gallery: four compositions */
.gal-grid{display:grid;gap:calc(var(--space)*3);
  grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
.gal-masonry{columns:3;column-gap:calc(var(--space)*3)}
@media (max-width:860px){.gal-masonry{columns:2}}
@media (max-width:560px){.gal-masonry{columns:1}}
.gal-masonry .frame{break-inside:avoid;margin-bottom:calc(var(--space)*3)}
.gal-masonry .plate{aspect-ratio:auto;height:240px}
.gal-masonry .frame.span-tall .plate{height:420px}
.gal-masonry .frame.span-wide .plate{height:200px}

.gal-feature{display:grid;gap:calc(var(--space)*3);
  grid-template-columns:minmax(0,1.5fr) minmax(0,1fr)}
@media (max-width:760px){.gal-feature{grid-template-columns:1fr}}
.gal-hero .plate{aspect-ratio:16/11}
.gal-rest{display:grid;gap:calc(var(--space)*3);grid-template-columns:1fr 1fr;align-content:start}
.gal-rest .plate{aspect-ratio:1}
.gal-rest .frame:first-child{grid-column:span 2}
.gal-rest .frame:first-child .plate{aspect-ratio:2/1}
.gal-rest .frame:nth-child(n+5){display:none}

.gal-strip{display:flex;gap:calc(var(--space)*3);overflow-x:auto;padding:0 32px 8px;
  scroll-snap-type:x mandatory;list-style:none;margin:0}
.gal-strip .frame{flex:0 0 clamp(240px,32vw,380px);scroll-snap-align:start}
.gal-strip .frame .plate{aspect-ratio:4/5}
.gal-strip .frame.is-first .plate{aspect-ratio:4/5}

/* frame chrome shared by all layouts */
.frame h3{font-size:0.9375rem;margin-top:12px}
.frame p{font-size:0.875rem;color:var(--ink-2);margin:4px 0 0}
.frame .plate{margin-bottom:0}
.frame-cap{padding-top:0}
.gal-grid .frame.span-wide{grid-column:span 2}
.gal-grid .frame.span-tall .plate{aspect-ratio:1/2}

/* stats */
.stats{display:grid;gap:calc(var(--space)*3);grid-template-columns:repeat(auto-fit,minmax(140px,1fr))}
.stats li{display:flex;flex-direction:column;gap:4px}
.value{font-family:var(--font-display);font-size:1.75rem;font-weight:var(--f-display);
  letter-spacing:var(--ls-display)}
.label{font-size:0.8125rem;color:var(--ink-2)}

/* contact */
.contact-grid{display:grid;gap:calc(var(--space)*4);grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}
.contact-list{display:flex;flex-direction:column;gap:14px;font-size:0.9375rem}
.contact-list li{display:flex;flex-direction:column;gap:2px}
.contact-list .k{font-size:0.75rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--ink-2)}
.contact-form{display:flex;flex-direction:column;gap:14px;max-width:440px}
.contact-form label{display:flex;flex-direction:column;gap:6px;font-size:0.8125rem;color:var(--ink-2)}
.contact-form input,.contact-form textarea{
  font:inherit;font-size:0.9375rem;color:var(--ink);background:var(--surface);
  border:1px solid var(--rule);border-radius:var(--radius);padding:10px 12px}
.contact-form input:focus,.contact-form textarea:focus{outline:2px solid var(--accent);outline-offset:1px}
.contact-form .cta{margin-top:4px;align-self:flex-start;cursor:pointer;font-family:inherit}
.contact-form[hidden]{display:none}
.form-note{margin:0;font-size:0.8125rem;color:var(--ink-2);min-height:1.2em}

/* schedule */
.days{display:grid;gap:calc(var(--space)*4);grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
.day h3{font-size:0.8125rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--ink-2);
  padding-bottom:10px;border-bottom:1px solid var(--rule);margin-bottom:12px}
.slots li{display:flex;gap:14px;padding:6px 0;font-size:0.9375rem}
.time{font-variant-numeric:tabular-nums;color:var(--ink-2);min-width:64px}

/* footer */
.foot{border-top:1px solid var(--rule);padding:32px 0}
.foot .wrap{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;
  font-size:0.8125rem;color:var(--ink-2)}
/* ── motion ──────────────────────────────────────────────────────────────── */
/* The first version of this stylesheet had no motion at all: a static
   document that looked correct and felt dead. These rules give the page a
   pulse without touching the content, and every one of them is disabled under
   \`prefers-reduced-motion\`, because a site that ignores that setting is
   broken for some of its readers.
   Motion here is one idea used consistently: things arrive as you reach them,
   and respond when you touch them. */

@keyframes fade-up{
  from{opacity:0;transform:translateY(14px)}
  to{opacity:1;transform:none}
}
@keyframes fade-in{from{opacity:0}to{opacity:1}}
@keyframes rule-in{
  from{transform:scaleX(0)}
  to{transform:scaleX(1)}
}
@keyframes drift{
  from{transform:scale(1.06) translateY(0)}
  to{transform:scale(1.06) translateY(-10px)}
}

/* The hero arrives immediately — it is above the fold, so waiting for an
   observer would mean the first thing anyone sees is blank. */
.hero .eyebrow{animation:fade-up .5s cubic-bezier(.2,.7,.2,1) both}
.hero h1{animation:fade-up .62s cubic-bezier(.2,.7,.2,1) .06s both}
.hero .lede{animation:fade-up .62s cubic-bezier(.2,.7,.2,1) .13s both}
.hero .cta,.hero .hero-actions{animation:fade-up .62s cubic-bezier(.2,.7,.2,1) .2s both}
.hero .plate,.hero .hero-art{animation:fade-in .9s ease .1s both}

/* Everything below the fold reveals once, on arrival. Children stagger, so a
   grid reads as a sequence rather than a slab. */
/* IMPORTANT: nothing is hidden by CSS alone. The hidden state only applies
   once the script has marked the page as animation-ready. If the script fails
   to load, is blocked, or the export is opened with JS off, every section is
   simply visible — a blank page is a far worse failure than a still one. */
.motion-ready .reveal{opacity:0;transform:translateY(16px)}
.motion-ready .reveal.in{
  opacity:1;transform:none;
  transition:opacity .62s cubic-bezier(.2,.7,.2,1),transform .62s cubic-bezier(.2,.7,.2,1);
}
.reveal.in > *{transition:opacity .5s ease,transform .5s cubic-bezier(.2,.7,.2,1)}
.motion-ready .reveal .stag{opacity:0;transform:translateY(10px)}
.motion-ready .reveal.in .stag{opacity:1;transform:none}
.motion-ready .reveal.in .stag:nth-child(1){transition-delay:.04s}
.motion-ready .reveal.in .stag:nth-child(2){transition-delay:.1s}
.motion-ready .reveal.in .stag:nth-child(3){transition-delay:.16s}
.motion-ready .reveal.in .stag:nth-child(4){transition-delay:.22s}
.motion-ready .reveal.in .stag:nth-child(5){transition-delay:.28s}
.motion-ready .reveal.in .stag:nth-child(6){transition-delay:.34s}
.motion-ready .reveal.in .stag:nth-child(7){transition-delay:.4s}
.motion-ready .reveal.in .stag:nth-child(8){transition-delay:.46s}
.motion-ready .reveal.in .stag:nth-child(n+9){transition-delay:.5s}

/* Section headings get a rule that draws itself in. One line of movement,
   used once per section, is enough. */
.sec h2{position:relative;padding-bottom:.5em}
.sec h2::after{
  content:"";position:absolute;left:0;bottom:0;width:2.6em;height:2px;
  background:var(--accent);transform:scaleX(0);transform-origin:left;
}
.motion-ready .reveal.in h2::after,.hero h2::after{animation:rule-in .7s cubic-bezier(.2,.7,.2,1) .12s forwards}
.center h2::after,.center h2::after{left:50%;margin-left:-1.3em;transform-origin:center}

/* Interaction: everything clickable responds. A button that does nothing when
   hovered is the difference between a document and a site. */
.cta{transition:transform .18s ease,filter .18s ease,box-shadow .18s ease}
.cta:hover{transform:translateY(-1px);filter:brightness(1.06)}
.cta:active{transform:translateY(0)}
.card,.product,.tier,.group{
  transition:transform .22s cubic-bezier(.2,.7,.2,1),border-color .22s ease,background .22s ease;
}
.card:hover,.product:hover,.tier:hover,.group:hover{
  transform:translateY(-3px);border-color:var(--accent);
}
.tier.featured{transition:transform .22s cubic-bezier(.2,.7,.2,1)}
.tier.featured:hover{transform:translateY(-3px)}
a{transition:color .16s ease}
.nav a{position:relative}
.nav a::after{
  content:"";position:absolute;left:0;right:0;bottom:-4px;height:1px;
  background:currentColor;transform:scaleX(0);transform-origin:right;
  transition:transform .24s cubic-bezier(.2,.7,.2,1);
}
.nav a:hover::after{transform:scaleX(1);transform-origin:left}

/* Photos breathe very slightly — enough to feel alive, not enough to distract. */
.has-img img{transition:transform .5s cubic-bezier(.2,.7,.2,1)}
.card:hover .has-img img,.product:hover .has-img img,.hero-art:hover img{transform:scale(1.03)}

/* The nav gains weight once you leave the top. */
.nav{transition:box-shadow .25s ease,background .25s ease}
.nav.scrolled{box-shadow:0 1px 0 var(--rule),0 6px 24px rgba(0,0,0,.06)}

/* A quiet scroll cue under the hero, only where there is more page below. */
.scroll-cue{
  display:inline-block;margin-top:28px;font-size:.75rem;letter-spacing:.08em;
  text-transform:uppercase;color:var(--ink-2);opacity:0;
  animation:fade-in .6s ease .9s forwards;
}
.scroll-cue::after{
  content:"";display:block;width:1px;height:22px;margin:8px auto 0;background:var(--ink-2);
  animation:cue 1.8s ease-in-out infinite;transform-origin:top;
}
@keyframes cue{0%,100%{transform:scaleY(.4);opacity:.5}50%{transform:scaleY(1);opacity:1}}

/* The build screen shows this document inside an iframe while the cursors
   draw it. Animations must not run there: the reveal would fight the
   blueprint. renderDocument adds .is-capture for that case. */
.is-capture .reveal,.is-capture .reveal .stag,.is-capture.motion-ready .reveal{opacity:1!important;transform:none!important}
.is-capture *,.is-capture *::before,.is-capture *::after{animation:none!important}

@media (prefers-reduced-motion:reduce){
  *,*::before,*::after{
    animation-duration:.001ms!important;animation-iteration-count:1!important;
    transition-duration:.001ms!important;scroll-behavior:auto!important;
  }
  .reveal,.reveal .stag{opacity:1!important;transform:none!important}
}
\`
`;

/* The tiny script that makes the reveals happen. Kept inline and dependency
   free: the exported page has to work as a file on someone's laptop. */
const SITE_JS = `
(function(){
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  /* Nothing is hidden until this line runs. If the script is blocked or the
     file is opened with JS disabled, the page is static but complete. */
  if (!reduced) document.documentElement.classList.add('motion-ready');
  var sections = document.querySelectorAll('.sec');
  var i;
  /* Mark the parts that should arrive on scroll. The hero is exempt: it is
     visible at load, so hiding it would show a blank first screen. */
  for (i = 1; i < sections.length; i++) sections[i].classList.add('reveal');
  var stags = document.querySelectorAll('.grid-3 > *, .grid-2 > *, .grid-4 > *, .faq > *, .contact-grid > *');
  for (i = 0; i < stags.length; i++) stags[i].classList.add('stag');

  if (reduced || !('IntersectionObserver' in window)) {
    var all = document.querySelectorAll('.reveal');
    for (i = 0; i < all.length; i++) all[i].classList.add('in');
    return;
  }
  var io = new IntersectionObserver(function(entries){
    for (var e = 0; e < entries.length; e++) {
      if (entries[e].isIntersecting) {
        entries[e].target.classList.add('in');
        io.unobserve(entries[e].target);
      }
    }
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
  var rs = document.querySelectorAll('.reveal');
  for (i = 0; i < rs.length; i++) io.observe(rs[i]);

  /* The contact form has no server behind it. Rather than pretending to send,
     it opens the visitor's mail app with the message filled in — so the words
     actually reach the person who owns the address. */
  var forms = document.querySelectorAll('.contact-form[data-mailto]');
  for (i = 0; i < forms.length; i++) (function(f){
    f.addEventListener('submit', function(ev){
      var to = f.getAttribute('data-mailto');
      if (!to) return;
      ev.preventDefault();
      var get = function(n){ var el = f.elements[n]; return el && el.value ? el.value : ''; };
      var NL = String.fromCharCode(10);
      var body = 'Name: ' + get('name') + NL + 'Email: ' + get('email') + NL + NL + get('message');
      var note = f.querySelector('.form-note');
      if (note) note.textContent = 'Opening your mail app with the message filled in.';
      window.location.href = to + '?subject=' + encodeURIComponent('Website enquiry')
        + '&body=' + encodeURIComponent(body);
    });
  })(forms[i]);

  /* The nav gets a shadow once the page has moved. */
  var nav = document.querySelector('.nav');
  if (nav) {
    var onScroll = function(){
      if (window.scrollY > 8) nav.classList.add('scrolled');
      else nav.classList.remove('scrolled');
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }
})();
`;



/* ── document ────────────────────────────────────────────────────────────── */

export type RenderOpts = {
  /** which page this is, for page: links */
  index?: number;
  /** true when writing files to disk rather than an in-app preview */
  exportMode?: boolean;
  /** true while the build screen draws this page: motion must stand still */
  capture?: boolean;
  /** export filenames by page index, so links point at real files */
  slugs?: string[];
};

export function renderBody(spec: SiteSpec, opts: RenderOpts = {}): string {
  const idx = opts.index ?? 0;
  const href = (h: string) =>
    esc(resolveHref(h, idx, opts.exportMode ?? false, opts.slugs));

  const navLinks = spec.nav.links
    .map((l) => `<li><a href="${href(l.href)}">${esc(l.label)}</a></li>`)
    .join('');
  const sections = spec.sections
    .map((sec, i) => {
      CTX.section = i;
      return RENDERERS[sec.type](sec);
    })
    .join('\n');

  return `<nav class="nav">
  <div class="wrap">
    <a class="brand" href="#top">${esc(spec.nav.brand)}</a>
    <ul>${navLinks}</ul>
  </div>
</nav>
${sections}
<footer class="foot">
  <div class="wrap">
    <span>${esc(spec.footer.note)}</span>
    <span>${esc(spec.meta.title)}</span>
  </div>
</footer>`;
}

export function renderDocument(spec: SiteSpec, opts: RenderOpts = {}): string {
  CTX = {
    index: opts.index ?? 0,
    exportMode: opts.exportMode ?? false,
    section: -1,
    slugs: opts.slugs,
  };
  const theme = THEMES[spec.meta.theme];
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${esc(spec.meta.title)}</title>
<meta name="description" content="${esc(spec.meta.description)}" />
<style>
${themeCss(theme, spec.meta.accent)}
${SITE_CSS}
</style>
</head>
<body id="top"${opts.capture ? ' class="is-capture"' : ''}>
${renderBody(spec, opts)}
<script>${SITE_JS}</script>
</body>
</html>`;
}
