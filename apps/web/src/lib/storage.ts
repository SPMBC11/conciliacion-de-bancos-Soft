/** localStorage solo para comodidades del usuario (tema, sidebar). Puede no estar disponible. */
export function readPref(key: string): string | null {
  try {
    return localStorage.getItem(`finagent:${key}`);
  } catch {
    return null;
  }
}

export function writePref(key: string, value: string) {
  try {
    localStorage.setItem(`finagent:${key}`, value);
  } catch {
    // Navegación privada o almacenamiento bloqueado: la preferencia no persiste, la app sigue.
  }
}
