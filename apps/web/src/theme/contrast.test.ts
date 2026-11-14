// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** Verifica WCAG AA (texto normal ≥ 4,5:1) de los pares de tokens usados en la UI, en ambos temas. */
const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');

function block(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  return Object.fromEntries(
    [...body.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]),
  );
}

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

const TEXT_TOKENS = [
  'foreground',
  'muted-foreground',
  'success-text',
  'warning-text',
  'danger-text',
];
const SURFACES = ['background', 'surface', 'surface-secondary'];

describe.each([
  ['claro', ':root {'],
  ['oscuro', ":root[data-theme='dark']"],
])('contraste tema %s', (_name, selector) => {
  const t = block(selector);

  it.each(TEXT_TOKENS.flatMap((fg) => SURFACES.map((bg) => [fg, bg])))(
    '%s sobre %s ≥ 4,5',
    (fg, bg) => {
      expect(contrast(t[fg]!, t[bg]!)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('texto del botón primario ≥ 4,5', () => {
    expect(contrast(t['primary-foreground']!, t.primary!)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t['primary-foreground']!, t['primary-hover']!)).toBeGreaterThanOrEqual(4.5);
  });
});

it('el bloque oscuro por preferencia del sistema es idéntico al de data-theme=dark', () => {
  expect(block(":root:not([data-theme='light'])")).toEqual(block(":root[data-theme='dark']"));
});
