import { build } from 'esbuild';
import { scratch } from './_scratch.mjs';
import { JSDOM } from 'jsdom';
const out = scratch('strict.mjs');
await build({entryPoints:['scripts/fixtures/strict-entry.tsx'],bundle:true,format:'esm',platform:'browser',outfile:out.path,logLevel:'silent',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'}});
const dom = new JSDOM('<div id="root"></div>',{url:'http://localhost/'});
const w = dom.window;
globalThis.window=w; globalThis.document=w.document;
Object.defineProperty(globalThis,'navigator',{value:w.navigator,configurable:true});
globalThis.HTMLElement=w.HTMLElement; globalThis.Element=w.Element; globalThis.Node=w.Node;
globalThis.MutationObserver=w.MutationObserver;
globalThis.requestAnimationFrame=(cb)=>w.setTimeout(()=>cb(1),0);
globalThis.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
globalThis.IS_REACT_ACT_ENVIRONMENT=true; w.IS_REACT_ACT_ENVIRONMENT=true;

// count fetches and whether any was aborted
let fetches=0, aborted=0, signals=[];
globalThis.fetch=(url,init={})=>{
  fetches++; signals.push(init.signal);
  init.signal?.addEventListener('abort',()=>{aborted++;});
  return new Promise(()=>{}); // never settles
};
const { mountBuild } = await import(out.url);
const { el } = mountBuild();
await new Promise(r=>w.setTimeout(r,600));
console.log('fetch calls:', fetches, '| aborted:', aborted);
console.log('signal aborted flags:', signals.map(s=>s?.aborted));
console.log('screen:', (el.textContent||'').replace(/\s+/g,' ').slice(0,160));
