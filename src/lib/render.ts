/* ============================================================================
   render(spec) → a complete, valid HTML document.

   This is real output. Not a wireframe, not a mock. It is the page the user
   gets. The swarm engine later takes this exact DOM apart into a Blueprint
   and rebuilds it with cursors.
   ========================================================================== */

import type { Section, SiteSpec } from './spec';
import { THEMES, themeCss } from './themes';

const esc = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/* ── section renderers ───────────────────────────────────────────────────── */

type R = (s: Section) => string;

const hero: R = (s) => {
  if (s.type !== 'hero') return '';
  return `<header class="sec hero">
  <div class="wrap">
    ${s.eyebrow ? `<p class="eyebrow">${esc(s.eyebrow)}</p>` : ''}
    <h1>${esc(s.headline)}</h1>
    <p class="lede">${esc(s.sub)}</p>
    ${s.cta ? `<a class="cta" href="${esc(s.cta.href)}">${esc(s.cta.label)}</a>` : ''}
  </div>
</header>`;
};

const features: R = (s) => {
  if (s.type !== 'features') return '';
  return `<section class="sec" id="features">
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
  return `<section class="sec alt" id="pricing">
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
  return `<section class="sec" id="products">
  <div class="wrap">
    <h2>${esc(s.heading)}</h2>
    <ul class="grid-3 shop">
      ${s.items
        .map(
          (i) => `<li class="product">
        <div class="swatch" aria-hidden="true"></div>
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
  return `<section class="sec alt" id="testimonials">
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
  return `<section class="sec" id="faq">
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
  return `<section class="sec" id="about">
  <div class="wrap narrow">
    <h2>${esc(s.heading)}</h2>
    ${s.body.map((p) => `<p class="prose">${esc(p)}</p>`).join('\n    ')}
  </div>
</section>`;
};

const menu: R = (s) => {
  if (s.type !== 'menu') return '';
  return `<section class="sec alt" id="menu">
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
              (i) => `<li>
            <span class="dish">${esc(i.name)}${
                i.note ? `<em class="note">${esc(i.note)}</em>` : ''
              }</span>
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
  return `<section class="sec" id="gallery">
  <div class="wrap">
    ${s.heading ? `<h2>${esc(s.heading)}</h2>` : ''}
    <ul class="gallery">
      ${s.items
        .map(
          (i) => `<li class="frame">
        <div class="plate" aria-hidden="true"></div>
        <h3>${esc(i.title)}</h3>
        ${i.caption ? `<p>${esc(i.caption)}</p>` : ''}
      </li>`
        )
        .join('\n      ')}
    </ul>
  </div>
</section>`;
};

const stats: R = (s) => {
  if (s.type !== 'stats') return '';
  return `<section class="sec strip">
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
  return `<section class="sec">
  <div class="wrap narrow center">
    <h2>${esc(s.heading)}</h2>
    ${s.sub ? `<p class="lede">${esc(s.sub)}</p>` : ''}
    <a class="cta" href="${esc(s.action.href)}">${esc(s.action.label)}</a>
  </div>
</section>`;
};

const contact: R = (s) => {
  if (s.type !== 'contact') return '';
  const rows = [
    s.email ? `<li><span class="k">Email</span><a href="mailto:${esc(s.email)}">${esc(s.email)}</a></li>` : '',
    s.phone ? `<li><span class="k">Phone</span><span>${esc(s.phone)}</span></li>` : '',
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
          ? `<form class="contact-form" onsubmit="return false">
        <label>Name<input type="text" name="name" placeholder="Your name" /></label>
        <label>Email<input type="email" name="email" placeholder="you@example.com" /></label>
        <label>Message<textarea name="message" rows="4" placeholder="Say something"></textarea></label>
        <button type="submit" class="cta">Send</button>
      </form>`
          : ''
      }
    </div>
  </div>
</section>`;
};

const schedule: R = (s) => {
  if (s.type !== 'schedule') return '';
  return `<section class="sec" id="schedule">
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

/* gallery */
.gallery{display:grid;gap:calc(var(--space)*3);grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
.plate{aspect-ratio:1;background:var(--surface-alt);border:1px solid var(--rule);
  border-radius:var(--radius);margin-bottom:12px}
.frame h3{font-size:0.9375rem}
.frame p{font-size:0.875rem;color:var(--ink-2);margin:4px 0 0}

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
`;

/* ── document ────────────────────────────────────────────────────────────── */

export function renderBody(spec: SiteSpec): string {
  const navLinks = spec.nav.links
    .map((l) => `<li><a href="${esc(l.href)}">${esc(l.label)}</a></li>`)
    .join('');
  const sections = spec.sections.map((s) => RENDERERS[s.type](s)).join('\n');

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

export function renderDocument(spec: SiteSpec): string {
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
<body id="top">
${renderBody(spec)}
</body>
</html>`;
}
