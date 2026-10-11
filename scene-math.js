export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export function chapterPosition(scrollY, offsets) {
  for (let i = offsets.length - 2; i >= 0; i--) {
    if (scrollY >= offsets[i]) return i + clamp((scrollY - offsets[i]) / Math.max(1, offsets[i + 1] - offsets[i]), 0, 1);
  }
  return 0;
}
export function smoothStep(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
export function damp(current, target, speed, dt) { return current + (target - current) * (1 - Math.exp(-speed * dt)); }
