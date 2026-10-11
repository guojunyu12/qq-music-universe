import { copyFile } from 'node:fs/promises';
for (const [source, target] of [
  ['gsap/dist/gsap.min.js', 'gsap.min.js'],
  ['gsap/dist/ScrollTrigger.min.js', 'ScrollTrigger.min.js'],
  ['lenis/dist/lenis.mjs', 'lenis.mjs'],
  ['lenis/dist/lenis.css', 'lenis.css'],
  ['lenis/LICENSE', 'LICENSE-lenis.txt']
]) await copyFile(`node_modules/${source}`, `dist/vendor/${target}`);
