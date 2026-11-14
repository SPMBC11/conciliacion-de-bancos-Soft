import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Las páginas se cargan bajo demanda: la primera transformación en pruebas puede tardar más de 1 s.
configure({ asyncUtilTimeout: 5000 });

// Algunas pruebas (contraste) corren en Node, sin DOM.
if (typeof window !== 'undefined') {
  // jsdom no implementa matchMedia; por defecto el sistema "prefiere" tema claro.
  window.matchMedia ??= vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;

  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.unstubAllGlobals();
    document.cookie = 'fa_csrf=; max-age=0';
    delete document.documentElement.dataset.theme;
  });
}
