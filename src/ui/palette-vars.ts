// Exports the UI tokens of render/palette.ts as CSS custom properties, so stylesheets never hardcode colors.
import { palette, toCss } from '../render/palette';

export function applyPaletteVars(el: HTMLElement): void {
  for (const [name, value] of Object.entries(palette.ui)) {
    el.style.setProperty(`--sz-${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`, toCss(value));
  }
  el.style.setProperty('--sz-background', toCss(palette.background));
}
