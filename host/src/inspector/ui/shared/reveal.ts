/**
 * Scroll the element `selector` finds into view and flash it once, after the next paint, so a
 * revealed row has rendered (opened, unfiltered) before it is looked for.
 */
export function scrollToAndFlash(selector: string): void {
  requestAnimationFrame(() => {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) return;
    element.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    element.animate(
      [{ boxShadow: 'inset 0 0 0 2px var(--ring)' }, { boxShadow: 'inset 0 0 0 2px transparent' }],
      { duration: 1200, easing: 'ease-out' },
    );
  });
}
