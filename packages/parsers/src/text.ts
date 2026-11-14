/**
 * Texto de archivos bancarios. Muchos extractos colombianos vienen en Windows-1252 (ANSI), no en UTF-8.
 * Se intenta UTF-8 estricto; si falla, Windows-1252. El BOM se descarta.
 */
export function decodeText(buf: Uint8Array): { text: string; encoding: 'utf-8' | 'windows-1252' } {
  try {
    return {
      text: new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(buf),
      encoding: 'utf-8',
    };
  } catch {
    return { text: new TextDecoder('windows-1252').decode(buf), encoding: 'windows-1252' };
  }
}

/** Descripción normalizada para comparar: mayúsculas, sin tildes, sin espacios dobles (la original se conserva aparte). */
export function normalizeDescription(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Encabezado normalizado para reconocer la plantilla en cargas futuras. */
export function headerSignature(cells: unknown[]): string {
  return cells
    .map((c) => normalizeDescription(String(c ?? '')).replace(/[^A-Z0-9]+/g, ''))
    .filter(Boolean)
    .join('|');
}
