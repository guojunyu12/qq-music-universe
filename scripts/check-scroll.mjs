import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// Exercise the real integration with lightweight platform/library doubles.
const source = (await readFile('dist/scroll-motion.js', 'utf8'))
  .replace(/^import .*;\n/, '').replace(/^export \{.*\};\n/m, '').replaceAll('export ', '');
for (const desktop of [true, false]) {
  const events = {}, media = { matches: desktop, addEventListener: (_, fn) => { events.media = fn; } };
  const ticks = new Set(), instances = [], fades = [], target = { scrollIntoView: () => { target.native = true; } };
  let registered = false, lag = null, scrollUpdate = 0;
  const ScrollTrigger = { update: () => scrollUpdate++, refresh() {} };
  const gsap = {
    registerPlugin: plugin => { registered = plugin === ScrollTrigger; },
    ticker: { add: fn => ticks.add(fn), remove: fn => ticks.delete(fn), lagSmoothing: n => { lag = n; } },
    context: fn => { fn(); return { revert() {} }; },
    fromTo: (_, __, options) => fades.push(options)
  };
  class Lenis {
    constructor(options) { this.options = options; instances.push(this); }
    on(name, fn) { this[name] = fn; }
    raf(ms) { this.ms = ms; }
    destroy() { this.destroyed = true; }
    scrollTo(to) { this.target = to; }
  }
  const html = { dataset: {} };
  const location = { hash: '' };
  const document = { documentElement: html, getElementById: () => target, addEventListener: (name, fn) => { events[name] = fn; } };
  const context = vm.createContext({ Lenis, window: { gsap, ScrollTrigger, addEventListener() {} }, document,
    matchMedia: () => media, location, history: { pushState: (_, __, hash) => { location.hash = hash; } } });
  vm.runInContext(source + '\nsetupSmoothScroll([{querySelector:()=>({})}]);', context);
  assert.ok(registered); assert.equal(lag, 0);
  assert.equal(html.dataset.scrollMode, desktop ? 'lenis' : 'native');
  const link = { hash: '#player', classList: { contains: () => false } };
  let prevented = false;
  events.click({ target: { closest: () => link }, button: 0, preventDefault: () => { prevented = true; } });
  assert.ok(prevented); assert.equal(location.hash, '#player');
  if (desktop) {
    assert.equal(instances[0].options.lerp, .08); assert.equal(instances[0].options.autoRaf, false);
    assert.equal(instances[0].target, target); assert.equal(ticks.size, 1);
    target.id='stage';link.hash='#stage';events.click({target:{closest:()=>link},button:0,preventDefault(){}});assert.equal(instances[0].target,0,'pinned hero anchor must return to document start');target.id='player';
    [...ticks][0](2); assert.equal(instances[0].ms, 2000);
    instances[0].scroll(); assert.equal(scrollUpdate, 1);
    media.matches = false; events.media();
    assert.ok(instances[0].destroyed); assert.equal(ticks.size, 0); assert.equal(html.dataset.scrollMode, 'native');
  } else { assert.equal(instances.length, 0); assert.ok(target.native); }
  assert.ok(fades.length > 0); assert.ok(fades.every(tween => !tween.scrollTrigger.pin && !tween.scrollTrigger.scrub));
}
console.log('Passed: Lenis/GSAP clock sync, anchors, responsive/reduced-motion fallback and teardown.');
