import Lenis from './vendor/lenis.mjs';

const { gsap, ScrollTrigger } = window;
gsap.registerPlugin(ScrollTrigger);
export { gsap, ScrollTrigger };
export const desktopMotion = matchMedia('(min-width: 768px) and (prefers-reduced-motion: no-preference)');

export function setupSmoothScroll(chapters) {
  // Own history restoration so the browser cannot race Lenis after reload/back.
  history.scrollRestoration = 'manual';
  let lenis = null, fadeContext = null;
  const tick = time => lenis?.raf(time * 1000);
  gsap.ticker.lagSmoothing(0);
  function configure() {
    gsap.ticker.remove(tick);
    lenis?.destroy(); lenis = null;
    fadeContext?.revert(); fadeContext = null;
    document.documentElement.dataset.scrollMode = desktopMotion.matches ? 'lenis' : 'native';
    if (desktopMotion.matches) {
      lenis = new Lenis({ lerp: .08, autoRaf: false, anchors: false, prevent: node => !!node.closest('dialog') });
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add(tick);
    } else {
      fadeContext = gsap.context(() => {
        chapters.forEach(chapter => {
          const copy = chapter.querySelector('.chapter-copy, .finale-copy');
          gsap.fromTo(copy, { opacity: 0 }, {
            opacity: 1, duration: .35, ease: 'power1.out',
            scrollTrigger: { trigger: chapter, start: 'top 85%', toggleActions: 'play none none reverse' }
          });
        });
      });
    }
    ScrollTrigger.refresh();
  }
  configure();
  desktopMotion.addEventListener('change', configure);
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href^="#"]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = document.getElementById(link.hash.slice(1));
    if (!target) return;
    event.preventDefault();
    if (location.hash !== link.hash) history.pushState(null, '', link.hash);
    const complete = () => {
      if (link.classList.contains('skip-link')) { target.tabIndex = -1; target.focus({ preventScroll: true }); }
    };
    if (lenis) lenis.scrollTo(target.id==='stage'?0:target, { onComplete: complete });
    else { target.scrollIntoView({ behavior: 'auto' }); complete(); }
  });
  window.addEventListener('load', () => {
    const target = document.getElementById(location.hash.slice(1));
    if (target && lenis) lenis.scrollTo(target.id==='stage'?0:target, { immediate: true });
    ScrollTrigger.refresh();
  }, { once: true });
  window.addEventListener('popstate', () => {
    const target = document.getElementById(location.hash.slice(1));
    if (lenis) lenis.scrollTo(!target||target.id==='stage'?0:target, { immediate: true });
    else if (target) target.scrollIntoView({ behavior: 'auto' });
    else window.scrollTo(0, 0);
  });
  window.addEventListener('pagehide', () => { gsap.ticker.remove(tick); lenis?.destroy(); }, { once: true });
  window.addEventListener('pageshow', event => { if (event.persisted) configure(); });
}
