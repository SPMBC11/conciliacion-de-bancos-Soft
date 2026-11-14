import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { ThemeSelector } from '@/components/ThemeSelector';
import { Providers } from '@/test-utils';

it('cambia el tema, lo aplica al documento y lo persiste', async () => {
  const user = userEvent.setup();
  render(
    <Providers>
      <ThemeSelector />
    </Providers>,
  );
  expect(document.documentElement.dataset.theme).toBe('light'); // sistema = claro (mock)
  await user.click(screen.getByRole('button', { name: 'Cambiar tema' }));
  await user.click(await screen.findByRole('menuitemradio', { name: /Oscuro/ }));
  expect(document.documentElement.dataset.theme).toBe('dark');
  expect(localStorage.getItem('finagent:theme')).toBe('dark');
});
