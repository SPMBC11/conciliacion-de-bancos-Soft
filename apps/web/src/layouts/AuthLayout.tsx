import type { ReactNode } from 'react';
import { Logo } from '@/components/Logo';
import { ThemeSelector } from '@/components/ThemeSelector';
import { Card } from '@/components/ui/card';

/** Pantallas sin sesión: tarjeta centrada con logo. */
export function AuthLayout({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 p-4">
      <div className="fixed top-3 right-3">
        <ThemeSelector />
      </div>
      <Logo />
      <Card className="w-full max-w-sm p-6">
        <h1 className="text-xl font-semibold">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        <div className="mt-5">{children}</div>
      </Card>
      <p className="text-xs text-muted-foreground">Conciliación bancaria · Colombia</p>
    </div>
  );
}
